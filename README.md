# VAYUVERSE AI — Predictive Air Intelligence Platform

Full-stack environmental air intelligence platform combining real-time national & global air quality telemetry, interactive per-pollutant dashboards, universal city search, a click-anywhere live air map, 72-hour pollution trajectory modelling, grounded AI guidance, and secure Google OAuth 2.0 + PKCE authentication.

## Live Data Sources (100% Free, Real-Time, Transparently Labelled)
- **Open-Meteo Air Quality API (Copernicus CAMS)** — Real-time PM2.5, PM10, CO, NO₂, SO₂, O₃, US AQI, European AQI, UV Index, Dust, AOD + 48h history & 72h hourly forecasts for any coordinate worldwide (`MODEL FORECAST`).
- **Open-Meteo Meteorological Forecast API (ECMWF IFS / NOAA GFS)** — Real-time temperature, apparent temperature, humidity, wind speed & compass direction, cloud cover, and surface pressure (`MODEL FORECAST`).
- **CPCB Indian National AQI (NAQI-IN) & US EPA Breakpoint Engines** — Deterministic pollutant sub-index calculation and category classification (`ESTIMATED`).
- **Open-Meteo Global Geocoding + BigDataCloud / OpenStreetMap Nominatim** — Live search for any city, town, or district across India & worldwide, plus reverse-geocoding when clicking anywhere on the dashboard live map.
- **Leaflet + OpenStreetMap / CARTO Tiles** — Dark AQI & Street Map toggleable interactive map with zero paid map keys.
- **Optional Free Add-Ons** — `GEMINI_API_KEY` (Google AI Studio Free Tier for live Gemini 2.0 Flash AI replies) and `WAQI_API_TOKEN` (World Air Quality Index free token for regulatory ground-station overlay).

## 100% Free-Tier Production Stack ($0/Month)
- **Frontend**: **Vercel** (Hobby Free) — Next.js 14, TypeScript, Tailwind CSS, Recharts, Framer Motion, Leaflet (`vercel.json` included)
- **Backend**: **Render** (Free Web Service) — Python 3.11 FastAPI + SQLAlchemy 2.0 (`render.yaml` & `.python-version` included)
- **Database**: **Supabase** (Free PostgreSQL + IPv4 Transaction Pooler) — 24 normalized tables with RLS (`database/supabase_schema.sql` included)
- **Google Sign-In**: **Google Cloud Console** — OAuth 2.0 Web Client ID with PKCE (`S256`) & CSRF `state` verification (`/api/auth/google` & `/api/auth/callback/google`)

See **[`DEPLOYMENT_ROADMAP.md`](./DEPLOYMENT_ROADMAP.md)** for the complete copy-paste deployment walkthrough.

## Quick Local Start

```bash
cp .env.example .env.local

# Terminal 1 — FastAPI backend (auto-creates local SQLite DB)
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Next.js frontend
npm install
npm run dev
```

Open `http://localhost:3000`.
