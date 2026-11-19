# VAYUVERSE AI — 100% Free-Tier Production Deployment Roadmap ($0/Month)

This guide walks you step-by-step through deploying the entire **VAYUVERSE AI** full-stack platform at **$0.00/month** with **no paid plans required**:

| Layer | Platform | Plan | Monthly Cost | Credit Card Required? |
| :--- | :--- | :--- | :---: | :---: |
| **Frontend + OAuth Routes** | **Vercel** | Hobby (Free) | **$0** | No |
| **Backend REST API (FastAPI)** | **Render** | Free Web Service (750 hrs/mo) | **$0** | No |
| **Database (PostgreSQL, 24 tables)** | **Supabase** | Free Plan (500 MB + IPv4 Pooler) | **$0** | No |
| **Sign in with Google** | **Google Cloud Console** | Google Auth Platform (OAuth 2.0 + PKCE) | **$0** | No |
| **Source Code & Auto-Deploy** | **GitHub** | Free Repository | **$0** | No |
| **Live Air, Weather, 72h Forecast & Global City Search** | **Open-Meteo APIs** (Copernicus CAMS + ECMWF + Geocoding) | Free Non-Commercial API | **$0** | No (No key needed) |
| **Interactive Live Map & Click-Anywhere Reverse Geocoding** | **Leaflet + OpenStreetMap / CARTO + BigDataCloud** | Free Open Tiles & Reverse Geocoder | **$0** | No (No key needed) |
| **AI Assistant** | Built-in Grounded Engine + optional **Google AI Studio (Gemini 2.0 Flash)** | Free Tier | **$0** | No |
| **Total Monthly Cost** | | | **$0.00 / mo** | **None** |

---

## Architecture Overview

```text
User Browser
   │
   ▼  HTTPS (https://YOUR-APP.vercel.app)
┌──────────────────────────────────────────────────────────┐
│  VERCEL (Free Hobby Tier) — Next.js 14 App Router        │
│  • Landing Page (/), Alpine Login (/login, /register)    │
│  • Full Interactive Dashboard (/dashboard/*)             │
│  • Any-City Search + Click-Anywhere Live Air Map         │
│  • /api/auth/google & /api/auth/callback/google (PKCE)   │
│  • /api/v1/* Secure Server Proxy (60s timeout + fallback)│
└───────────────┬──────────────────────────┬───────────────┘
                │ Google OAuth 2.0 + PKCE  │ Bearer JWT + X-Internal-Secret
                ▼                          ▼
┌───────────────────────────┐  ┌─────────────────────────────────────────┐
│  GOOGLE CLOUD CONSOLE     │  │  RENDER (Free Web Service) — FastAPI    │
│  • OAuth 2.0 Client ID    │  │  • https://YOUR-API.onrender.com        │
│  • Verified email/profile │  │  • Auth, RBAC, 14 Modules, AI Assistant │
└───────────────────────────┘  │  • Live Open-Meteo CAMS + Geocoding     │
                               └────────────────────┬────────────────────┘
                                                    │ TLS + Supavisor IPv4 (:6543)
                                                    ▼
                               ┌─────────────────────────────────────────┐
                               │  SUPABASE (Free Plan) — PostgreSQL 15+  │
                               │  • 24 Tables (RLS Enabled)              │
                               │  • Users, Profiles, Google Links, Logs  │
                               └─────────────────────────────────────────┘
```

---

## Folder Contents Included for Deployment

Everything lives in a single monorepo folder (`vayuverse-ai/` — also bundled as `vayuverse-ai-deployment.zip`):

```text
vayuverse-ai/
├── src/                          # Next.js 14 Frontend + Google OAuth PKCE + API Proxy (Vercel)
│   ├── app/                      # /, /login, /register, /forgot-password, /onboarding, /dashboard/*, /api/*
│   │   └── icon.png              # Exact VA orbital-swoosh favicon
│   ├── components/               # UI, Maps (InteractiveAirMapExplorer, VayuMap), CitySearchPicker, Auth
│   ├── lib/                      # Auth/JWT helpers, live serverless fallback, AQI engines, i18n, types
│   └── middleware.ts             # Edge route protection & role-based access control (RBAC)
├── public/images/                # VA orbital-swoosh logo, alpine login bg, orbital Earth horizon
├── backend/                      # Python FastAPI Backend (Render Free Web Service)
│   ├── main.py                   # REST API v1 (auth, google-sync, global city search, point air, 14 modules)
│   ├── database.py               # Supabase Supavisor IPv4 (:6543/:5432) + SQLite auto-configured engine
│   ├── models.py                 # 24 SQLAlchemy ORM tables
│   ├── aqi_engine.py             # Live Open-Meteo CAMS, 36 Indian hubs, global search, map-click reverse geocode
│   ├── ai_service.py             # Grounded AI engine + optional free Google Gemini 2.0 Flash support
│   ├── seed.py                   # Reference monitoring stations & starter data seeder
│   ├── requirements.txt          # Fast-install prebuilt Python wheels for Render Free Tier
│   ├── Dockerfile                # Optional container build
│   └── .env.example              # Render environment variable template
├── database/
│   ├── supabase_schema.sql       # Ready-to-run Supabase SQL Editor script (24 tables + indexes + RLS)
│   └── schema.sql                # Extended PostGIS/Timescale reference schema
├── vercel.json                   # Vercel Free-Tier config (Next.js + 60s API timeout for Render wake-up)
├── render.yaml                   # Render Free-Tier Blueprint (plan: free, Python 3.11.9)
├── .python-version               # Pins Python 3.11.9 on Render for fast binary wheels
├── .env.example                  # Complete environment variable template
├── next.config.mjs               # Next.js production config (allows *.vercel.app)
├── package.json                  # Frontend dependencies & scripts
└── DEPLOYMENT_ROADMAP.md         # This step-by-step free-tier deployment guide
```

---

## Step 0 — Prepare Two Shared Secrets & Push to GitHub (3 Minutes)

### 0.1 Generate two strong random secrets
Run this twice in your terminal (Mac/Linux/Git Bash/WSL) or PowerShell:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

*(No `openssl`? Run `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` twice.)*

Save both values in a temporary notepad — you will paste the **exact same pair** into both **Render** and **Vercel**:
- `AUTH_SECRET` = `<first-random-string>`
- `INTERNAL_API_SECRET` = `<second-random-string>`

### 0.2 Push `vayuverse-ai` to a Free GitHub Repository
1. Go to [https://github.com/new](https://github.com/new) and create a repository named **`vayuverse-ai`** (Private or Public — both work on free tiers).
2. Inside the extracted `vayuverse-ai` folder, run:

```bash
git init
git add .
git commit -m "Initial production release: VAYUVERSE AI"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/vayuverse-ai.git
git push -u origin main
```

*(Make sure `.env` and `.env.local` are **never** committed — `.gitignore` already excludes them.)*

---

## Step 1 — Deploy PostgreSQL Database on Supabase (Free Tier — 5 Minutes)

1. Go to [https://supabase.com](https://supabase.com) → sign in with GitHub → click **New project**.
2. Configure the project:
   - **Name**: `vayuverse-ai-db`
   - **Database Password**: Click **Generate a password** and **copy & save it immediately** *(tip: use only letters and numbers so you never have to URL-encode `@`, `#`, or `/` characters)*.
   - **Region**: Pick the region closest to your users (e.g., **`ap-south-1` Mumbai** or **`ap-southeast-1` Singapore**).
   - **Pricing Plan**: **Free ($0/month)** — includes 500 MB database + unlimited API requests.
3. Wait ~60 seconds for the database to finish provisioning.
4. **Create all 24 tables + enable Row Level Security**:
   - In the left sidebar, click **SQL Editor** → **New query**.
   - Open `database/supabase_schema.sql` from this project, copy its entire contents, paste into the editor, and click **Run**.
   - You should see **`Success. No rows returned`**. Check **Table Editor** — all 24 tables (`users`, `user_profiles`, `user_preferences`, `incident_reports`, etc.) are now live with RLS enabled.
5. **Copy the IPv4 Connection Pooler URI (CRITICAL for Render Free Tier!)**:
   - Click the **Connect** button at the top bar of your Supabase project dashboard.
   - Under **Connection String** → choose tab **`URI`** → set **Method** to **`Transaction pooler`** (Port **`6543`**).
   - Why? Supabase's *Direct connection* (`db.<ref>.supabase.co:5432`) is IPv6-only, while Render Free Tier uses IPv4. Supabase's **Transaction Pooler (`aws-0-<region>.pooler.supabase.com:6543`)** supports IPv4 natively, and `backend/database.py` is already pre-configured with `sslmode=require` and `prepare_threshold=None` for Supavisor port `6543`!
   - Copy the string and replace `[YOUR-PASSWORD]` with your real database password:
     ```text
     postgresql://postgres.xxxxxxxxxxxx:YOUR_DB_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
     ```
   - *(If your password contains special characters like `@`, `#`, `%`, or `:`, URL-encode them — e.g. `@` → `%40`, `#` → `%23`.)*

---

## Step 2 — Deploy FastAPI Backend on Render (Free Tier — 6 Minutes)

1. Go to [https://dashboard.render.com](https://dashboard.render.com) → sign in with GitHub (no credit card needed for Free Web Services).
2. Click **New +** → **Web Service** → connect your **`vayuverse-ai`** GitHub repository.
3. Fill in these exact settings:
   - **Name**: `vayuverse-ai-backend`
   - **Region**: **Singapore (Southeast Asia)** *(closest Render region to India & Supabase Mumbai/Singapore)*
   - **Branch**: `main`
   - **Root Directory**: *(leave blank — run from repository root)*
   - **Runtime**: **`Python 3`**
   - **Build Command**:
     ```bash
     pip install --upgrade pip && pip install -r backend/requirements.txt
     ```
   - **Start Command**:
     ```bash
     python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Instance Type**: Select **`Free`** (`$0 / month`, 512 MB RAM, 0.1 CPU).
4. Scroll down to **Environment Variables** and add these keys:

   | Key | Value |
   | :--- | :--- |
   | `PYTHON_VERSION` | `3.11.9` |
   | `DATABASE_URL` | `postgresql://postgres.<REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres` *(from Step 1)* |
   | `AUTH_SECRET` | `<exact first secret from Step 0>` |
   | `INTERNAL_API_SECRET` | `<exact second secret from Step 0>` |
   | `FRONTEND_URL` | `https://vayuverse-ai.vercel.app` *(update with your exact Vercel URL after Step 3)* |
   | `ALLOW_VERCEL_PREVIEWS` | `true` |
   | `ENABLE_DEMO_MODE` | `false` |

5. Under **Advanced** (optional): set **Health Check Path** to `/api/v1/health`.
6. Click **Deploy Web Service**. Wait ~2 minutes until the status badge turns green **`Live`**.
7. Copy your Render URL (e.g., `https://vayuverse-ai-backend.onrender.com`) and open:
   ```text
   https://vayuverse-ai-backend.onrender.com/api/v1/health
   ```
   Confirm it returns JSON with `"status": "ok"` and `"database_backend": "postgresql"`!

> *(Shortcut: You can also deploy via **Render → New + → Blueprint** and select `vayuverse-ai`; `render.yaml` pre-fills all settings on the Free plan and prompts you for the secret values.)*

---

## Step 3 — Deploy Next.js Frontend on Vercel (Free Hobby Tier — 5 Minutes)

1. Go to [https://vercel.com/new](https://vercel.com/new) → sign in with GitHub (**Hobby — Free** plan).
2. Click **Import** next to your **`vayuverse-ai`** GitHub repository.
3. Verify build settings (Vercel auto-detects these from `package.json` & `vercel.json`):
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./` *(repository root)*
   - **Build Command**: `npm run build`
   - **Output Directory**: *(leave default `.next`)*
4. Expand **Environment Variables** and add these keys (enabled for *Production, Preview, and Development*):

   | Key | Value |
   | :--- | :--- |
   | `FASTAPI_BACKEND_URL` | `https://vayuverse-ai-backend.onrender.com` *(your exact Render URL from Step 2, **no trailing slash**)* |
   | `AUTH_SECRET` | `<exact SAME AUTH_SECRET as Render>` |
   | `INTERNAL_API_SECRET` | `<exact SAME INTERNAL_API_SECRET as Render>` |
   | `ENABLE_DEMO_MODE` | `false` |

   *(You will add `APP_URL`, `NEXT_PUBLIC_APP_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` right after getting your Vercel URL in Step 4!)*

5. Click **Deploy**. Wait ~90 seconds for Vercel to finish building.
6. Copy your live production domain (for example: `https://vayuverse-ai.vercel.app`).
7. **Sync the exact Vercel URL on both platforms**:
   - In **Vercel → Project → Settings → Environment Variables**, add:
     - `APP_URL` = `https://YOUR-ACTUAL-PROJECT.vercel.app` *(no trailing slash)*
     - `NEXT_PUBLIC_APP_URL` = `https://YOUR-ACTUAL-PROJECT.vercel.app` *(no trailing slash)*
   - In **Render → `vayuverse-ai-backend` → Environment**, update:
     - `FRONTEND_URL` = `https://YOUR-ACTUAL-PROJECT.vercel.app` *(no trailing slash)* → Save.

---

## Step 4 — Enable "Sign in with Google" on Google Cloud Console (Free — 6 Minutes)

Google OAuth 2.0 is **100% free forever** and does **not** require enabling Google Cloud billing.

### 4.1 Create a Google Cloud Project
1. Open [https://console.cloud.google.com/](https://console.cloud.google.com/).
2. Click the project dropdown (top-left) → **New Project** → Name it **`VAYUVERSE AI`** → click **Create** and select it.

### 4.2 Configure OAuth Consent Screen (Google Auth Platform)
1. Navigate to **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding / Audience**).
2. Click **Get Started** (or select **External** user type → **Create**):
   - **App name**: `VAYUVERSE AI`
   - **User support email**: `<your Gmail address>`
   - **Audience**: **External** *(allows any Google account to sign in)*
   - **Authorized domains**: add `vercel.app` *(plus your custom domain later if you connect one)*
   - **App homepage link**: `https://YOUR-ACTUAL-PROJECT.vercel.app`
   - **Privacy policy link**: `https://YOUR-ACTUAL-PROJECT.vercel.app/privacy`
   - **Terms of service link**: `https://YOUR-ACTUAL-PROJECT.vercel.app/terms`
   - **Developer contact email**: `<your Gmail address>`
3. Under **Data Access / Scopes**: click **Add or remove scopes** and select only the 3 non-sensitive standard scopes (no paid security audit needed!):
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   Save.
4. Under **Audience**:
   - While testing, add your Gmail under **Test users** — OR click **Publish App → Confirm** so **any** Google account can sign in immediately *(because only `openid`, `email`, and `profile` are requested, Google requires zero paid verification!)*.

### 4.3 Create the OAuth 2.0 Client ID & Client Secret
1. Go to **APIs & Services → Credentials** (or **Google Auth Platform → Clients**).
2. Click **+ Create Credentials → OAuth client ID**.
3. Choose **Application type**: **`Web application`**.
4. **Name**: `VAYUVERSE AI Vercel Web Client`.
5. Under **Authorized JavaScript origins**, click **+ Add URI** and add:
   ```text
   https://YOUR-ACTUAL-PROJECT.vercel.app
   http://localhost:3000
   ```
6. Under **Authorized redirect URIs**, click **+ Add URI** and add these **exact** URLs (no trailing slash!):
   ```text
   https://YOUR-ACTUAL-PROJECT.vercel.app/api/auth/callback/google
   http://localhost:3000/api/auth/callback/google
   ```
7. Click **Create**. A modal appears with two values — copy both:
   - **Client ID** (ends in `.apps.googleusercontent.com`)
   - **Client Secret** (starts with `GOCSPX-...`)

### 4.4 Add Client ID & Secret to Vercel and Redeploy
1. Go to **Vercel → Your Project → Settings → Environment Variables** and add:

   | Key | Value |
   | :--- | :--- |
   | `GOOGLE_CLIENT_ID` | `1234567890-abcdefg.apps.googleusercontent.com` |
   | `GOOGLE_CLIENT_SECRET` | `GOCSPX-your-client-secret` |

   *(Security note: NEVER name the secret `NEXT_PUBLIC_GOOGLE_CLIENT_SECRET` — keep it strictly server-side as `GOOGLE_CLIENT_SECRET`.)*

2. Go to **Vercel → Deployments** → click the **`⋯`** menu on the latest deployment → click **Redeploy** (takes ~60 seconds).
3. Wait 1–2 minutes for Google to propagate the new Redirect URI, then open `https://YOUR-ACTUAL-PROJECT.vercel.app/login` and click **`continue with Google`** — you will authenticate with Google, automatically create your user row in **Supabase PostgreSQL** via **Render FastAPI**, land on `/onboarding`, and enter `/dashboard`!

---

## Step 5 — Optional 100% Free-Tier Add-Ons ($0/Month)

All three are completely optional — VAYUVERSE AI works out-of-the-box without them:

1. **Free Generative AI Replies (Google AI Studio — Gemini 2.0 Flash)**:
   - Visit [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API Key** (free, no billing required).
   - Add `GEMINI_API_KEY=<your-key>` in **Render → Environment** and save. The Dashboard AI Assistant automatically switches to live grounded Gemini 2.0 Flash while citing live city telemetry.
2. **Free Ground-Station Cross-Check (WAQI / AQICN)**:
   - Visit [https://aqicn.org/data-platform/token/](https://aqicn.org/data-platform/token/) → request a free token by email.
   - Add `WAQI_API_TOKEN=<your-token>` in **Render → Environment**. Any city or map click near a CPCB/SPCB regulatory ground monitor attaches a live `MEASURED` station reading alongside the Open-Meteo CAMS grid.
3. **Keep Render Free Backend Warm & Supabase Free Project Active**:
   - *Render Free Tier* spins down after 15 minutes of zero traffic (first request after sleep takes ~25–40s; our Vercel config already uses a 60s timeout + instant live Open-Meteo serverless fallback so live city search & map clicks never break).
   - *Supabase Free Tier* pauses projects after 7 days of zero database queries.
   - If you want zero cold starts, create a free account at [https://uptimerobot.com](https://uptimerobot.com) (50 free monitors) and add an HTTP monitor hitting `https://YOUR-API.onrender.com/api/v1/health` every 10–14 minutes.

---

## Step 6 — Final End-to-End Verification Checklist

- [ ] `https://YOUR-API.onrender.com/api/v1/health` returns `{"status":"ok","database_backend":"postgresql"}`.
- [ ] `https://YOUR-PROJECT.vercel.app/` loads with the exact **VA** logo, live 36-city Overall India meters & graphs, and **no** Demo Mode or landing map.
- [ ] `https://YOUR-PROJECT.vercel.app/login` displays the alpine snow-mountain frosted-glass card with `login`, `register`, and `continue with Google` (no Demo Mode).
- [ ] Clicking **`continue with Google`** completes real Google OAuth 2.0 + PKCE and saves your user in **Supabase → Table Editor → `users`**.
- [ ] Email registration (`/register`) & login (`/login`) create isolated user accounts stored in **Supabase**.
- [ ] Inside `/dashboard` and `/dashboard/live-air`:
  - Searching any city (e.g., `Jalandhar`, `Shimla`, `Kochi`, `Surat`, `Guwahati`, `London`, `Tokyo`) loads live air quality and updates all radial meters, 6 pollutant tabs, weather, and 24h/72h charts.
  - Clicking **anywhere on the live map** drops a live pin, resolves the locality name, and updates all graphs, meters, and recommendations immediately.

---

## Quick Troubleshooting Guide

| Symptom | Cause | Instant Fix |
| :--- | :--- | :--- |
| Google error `redirect_uri_mismatch` | Redirect URI in Google Cloud doesn't match `APP_URL` character-for-character | Set `APP_URL=https://YOUR-PROJECT.vercel.app` in Vercel and add `https://YOUR-PROJECT.vercel.app/api/auth/callback/google` in Google Cloud Credentials (no trailing `/`). |
| Google error `access_denied` (403: app in testing) | Signing in with a Gmail not in Test Users while consent screen is in Testing | In Google Cloud → **OAuth consent screen / Audience**, either add the email to **Test users** or click **Publish App**. |
| Render deploy error `Network is unreachable` to Supabase | Used Supabase Direct URI (`db.<ref>.supabase.co:5432`, IPv6-only) | Replace `DATABASE_URL` in Render with Supabase **Connect → Transaction pooler (`:6543`)** URI (`aws-0-...pooler.supabase.com:6543`). |
| Render error `password authentication failed` | Password in `DATABASE_URL` has raw `@`, `#`, `:`, or `/` | Reset Supabase DB password to alphanumeric characters (Settings → Database) or URL-encode special characters. |
| Logged in via Google, then redirected back to `/login` | `AUTH_SECRET` or `INTERNAL_API_SECRET` differs between Vercel and Render | Paste the **exact same** `AUTH_SECRET` and `INTERNAL_API_SECRET` on both Vercel and Render (no extra spaces/quotes) and redeploy. |
| First login after 20+ mins feels slow (~30s) | Render Free Tier waking up from 15-min idle sleep | Normal on Render Free plan — wait ~30s and it runs fast afterward (or add a free UptimeRobot ping on `/api/v1/health`). |

---

## Running Locally (Zero Cost)

```bash
# 1. Copy env template
cp .env.example .env.local

# 2. Install & start FastAPI backend (Terminal 1 — uses local SQLite automatically)
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 3. Install & start Next.js frontend (Terminal 2)
npm install
npm run dev
# Open http://localhost:3000
```
