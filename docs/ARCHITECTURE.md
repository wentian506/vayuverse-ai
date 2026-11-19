# VAYUVERSE AI — System Architecture & Transparency Specification

## 1. End-to-End Architecture

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser (Desktop / Tablet / Mobile — EN / HI / PA — Reduced Motion)     │
│ Next.js 14 App Router + React + Tailwind + Framer Motion + Recharts     │
│ + Leaflet/OpenStreetMap + Web Speech API                                │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS (Same-Origin Requests + HttpOnly Cookie)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Next.js Server Layer (Netlify Functions / Node Server)                  │
│ • middleware.ts            → JWT verification & RBAC route protection   │
│ • /api/auth/google         → OAuth 2.0 PKCE (S256) + CSRF state cookie  │
│ • /api/auth/callback/google→ Server-side token exchange + userinfo      │
│ • /api/v1/[...path]        → Injects Bearer JWT to FastAPI (Stage 2)    │
│                              or runs Open-Meteo serverless (Stage 1)    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ Server-to-Server HTTPS (Stage 2 / Local)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Python FastAPI Backend (backend/main.py)                                │
│ • Auth & Profile Service   → bcrypt, Google account link, export/delete │
│ • AQI & Scenario Engine    → CPCB NAQI sub-indices, Shadow, Future Me,  │
│   (backend/aqi_engine.py)    Routes, Replanner, Ventilation Advisor     │
│ • Grounded AI Service      → Claude API + deterministic fallback with   │
│   (backend/ai_service.py)    strict citation & non-medical guardrails   │
│ • Civic & Institutional    → Home, Family, Campus, Community, Incidents │
│ • RBAC Admin & Audit       → Moderation, Sensor Trust, Broadcasts, Logs │
└──────────────┬────────────────────────────────┬─────────────────────────┘
               │                                │
               ▼                                ▼
┌──────────────────────────────┐  ┌───────────────────────────────────────┐
│ PostgreSQL 16 + PostGIS      │  │ External APIs                         │
│ + TimescaleDB (schema.sql)   │  │ • Open-Meteo Air Quality (CAMS, live) │
│ (SQLite auto-fallback in dev)│  │ • Open-Meteo Weather Forecast (live)  │
│                              │  │ • OpenStreetMap Tiles (live)          │
│                              │  │ • Google OAuth 2.0 / OIDC (env-keyed) │
│                              │  │ • Anthropic Claude API (env-keyed)    │
└──────────────────────────────┘  └───────────────────────────────────────┘
```

## 2. Five Canonical Data Classifications

1. **`MEASURED`** — Direct physical sensor/station telemetry (official CPCB/PPCB CAAQMS stations, calibrated community nodes, manual home monitor entries).
2. **`MODEL FORECAST`** — Gridded numerical atmospheric and meteorological predictions (Open-Meteo CAMS regional ~11 km air quality & weather forecasts).
3. **`ESTIMATED`** — Deterministic calculations from `backend/aqi_engine.py` (Indian NAQI sub-index derivation from CAMS concentrations, relative route/routine exposure ratios, coarse CO2e savings).
4. **`USER REPORTED`** — Citizen pollution observations, home symptom/source audits, and manual room logs. Unverified until moderated.
5. **`AI SUMMARY`** — Natural-language responses generated exclusively from retrieved records above, accompanied by source citations and a machine-readable reasoning log.

## 3. Honest Disclosures & Assumptions

- **Live Environmental Feed:** Open-Meteo Air Quality & Weather APIs work immediately with zero API key, streaming real hourly pollutant concentrations and weather for Ludhiana, New Delhi, Chandigarh, Amritsar, Bengaluru, Mumbai, Kolkata, and Hyderabad. Because Open-Meteo provides gridded CAMS atmospheric model data rather than raw CPCB station hardware packets, raw pollutants are tagged `MODEL FORECAST` and derived Indian NAQI is tagged `ESTIMATED`. Direct CPCB CAAQMS station metadata (locations, operators, station codes) are mapped accurately, and a `CPCB_API_KEY` slot is ready in `.env.example`.
- **Labelled Demonstration Fixtures:** Until real IoT classroom/neighbourhood sensors and live citizen reports accumulate in a new installation, VAYU Campus classroom nodes, VAYU Community low-cost sensor nodes, and initial sample incident records carry `is_demo = true` and render a visible `DEMO FIXTURE` badge. They are never presented as live official measurements.
- **Google OAuth & Claude API:** Both integrations are 100% real server-side implementations with zero hardcoded secrets. Supplying `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` activates live Google sign-in immediately; supplying `ANTHROPIC_API_KEY` activates live Claude synthesis while falling back smoothly to the deterministic Grounded Evidence Engine when omitted.
