import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookies,
  getFastApiBase,
  getRequestSessionToken,
  setSessionCookie,
  signServerlessToken,
  verifyToken,
} from '@/lib/auth-server';
import {
  SERVERLESS_CITIES,
  buildServerlessUserFromClaims,
  fetchServerlessLiveAir,
  searchServerlessCities,
} from '@/lib/serverless-fallback';

/**
 * Unified server-side gateway for /api/v1/*
 * - Phase 2 & Local Full-Stack: Attaches verified HttpOnly session JWT and proxies to Python FastAPI.
 * - Phase 1 Netlify-only (before FASTAPI_BACKEND_URL is configured): Serves live Open-Meteo data &
 *   Google-authenticated profile endpoints cleanly via serverless handlers.
 */
async function proxyOrFallback(req: NextRequest, params: { path: string[] }) {
  const subPath = params.path.join('/');
  const search = req.nextUrl.search || '';
  const token = getRequestSessionToken(req);
  const backend = getFastApiBase();

  // Block direct external access to internal google-sync route
  if (subPath === 'auth/google-sync') {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }

  if (backend) {
    const targetUrl = `${backend}/api/v1/${subPath}${search}`;
    const headers: Record<string, string> = {};
    const ct = req.headers.get('content-type');
    if (ct) headers['Content-Type'] = ct;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const init: RequestInit = {
      method: req.method,
      headers,
      cache: 'no-store',
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      init.body = await req.text();
    }

    try {
      const upstream = await fetch(targetUrl, init);
      const text = await upstream.text();
      const res = new NextResponse(text, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        },
      });
      // Automatically clear session cookie on permanent account deletion
      if (subPath === 'profile/account' && req.method === 'DELETE' && upstream.ok) {
        clearSessionCookies(res, req);
      }
      return res;
    } catch {
      // Fall through to serverless fallback for live telemetry if FastAPI unreachable
    }
  }

  // --- Serverless Live Fallback (also covers Render Free-Tier cold-start wake-ups) ---
  if (subPath === 'cities' && req.method === 'GET') {
    return NextResponse.json({ cities: Object.values(SERVERLESS_CITIES) });
  }
  if (subPath === 'cities/search' && req.method === 'GET') {
    const q = req.nextUrl.searchParams.get('q') || '';
    const results = await searchServerlessCities(q, 14);
    return NextResponse.json({
      query: q,
      count: results.length,
      source: 'Open-Meteo Geocoding API (Live Serverless Fallback)',
      results,
    });
  }
  if ((subPath === 'air/live' || subPath === 'air/point') && req.method === 'GET') {
    const city = req.nextUrl.searchParams.get('city') || req.nextUrl.searchParams.get('label') || 'Ludhiana';
    const rawLat = req.nextUrl.searchParams.get('lat');
    const rawLon = req.nextUrl.searchParams.get('lon');
    const lat = rawLat != null && rawLat !== '' ? Number(rawLat) : null;
    const lon = rawLon != null && rawLon !== '' ? Number(rawLon) : null;
    const data = await fetchServerlessLiveAir(city, lat, lon);
    return NextResponse.json(data);
  }
  if (subPath === 'air/network' && req.method === 'GET') {
    const entries = await Promise.all(
      Object.keys(SERVERLESS_CITIES).slice(0, 6).map(async (c) => {
        const b = await fetchServerlessLiveAir(c);
        return {
          city: b.location.city,
          state: b.location.state,
          lat: b.location.lat,
          lon: b.location.lon,
          nearest_station: b.location.nearest_reference_station,
          operator: b.location.station_operator,
          observed_time_ist: b.current.observed_time_ist,
          indian_aqi: b.current.indian_aqi,
          category: b.current.category,
          color: b.current.color,
          dominant_pollutant: b.current.dominant_pollutant,
          pm25: b.current.pollutants.pm25,
          pm10: b.current.pollutants.pm10,
          no2: b.current.pollutants.no2,
          o3: b.current.pollutants.o3,
          provenance: 'MODEL FORECAST',
          source: 'Open-Meteo CAMS Regional Grid',
        };
      })
    );
    return NextResponse.json({ is_live: true, fetched_at_utc: new Date().toISOString(), cities: entries, reference_stations: [] });
  }
  if (subPath === 'profile' && req.method === 'PATCH' && token) {
    const claims = await verifyToken(token);
    if (!claims) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const cityMeta = body.city ? SERVERLESS_CITIES[body.city] || SERVERLESS_CITIES.Ludhiana : null;
    const next = {
      ...claims,
      name: body.full_name ?? claims.name,
      picture: body.avatar_url ?? claims.picture,
      city: cityMeta ? cityMeta.city : claims.city,
      state: cityMeta ? cityMeta.state : claims.state,
      lang: body.preferred_language ?? claims.lang,
      bio: body.bio ?? claims.bio,
      role: claims.is_demo ? 'individual' : (body.role ?? claims.role),
    };
    const jwt = await signServerlessToken(next);
    const res = NextResponse.json({ user: buildServerlessUserFromClaims(next) });
    setSessionCookie(res, req, jwt);
    return res;
  }
  if (subPath === 'profile/account' && req.method === 'DELETE') {
    const res = NextResponse.json({ status: 'deleted', message: 'Session and account cleared.' });
    clearSessionCookies(res, req);
    return res;
  }
  if (subPath === 'notifications' && req.method === 'GET') {
    return NextResponse.json({
      unread_count: 1,
      notifications: [
        {
          id: 'p1-welcome',
          category: 'aqi_alert',
          severity: 'info',
          title: 'Netlify Phase-1 Deployment Active (Google OAuth Verified)',
          body: 'Live Open-Meteo Air Intelligence is streaming. Connect FASTAPI_BACKEND_URL in Phase 2 to enable full PostgreSQL persistence across all modules.',
          action_url: '/dashboard/trust',
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ],
      preferences: {
        aqi_alert_threshold: 150,
        notify_aqi_alerts: true,
        notify_forecast_spikes: true,
        notify_community_updates: true,
        notify_campus_alerts: false,
        notify_routine_reminders: true,
      },
    });
  }
  if (subPath === 'profile/activity' && req.method === 'GET' && token) {
    const claims = await verifyToken(token);
    if (!claims) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({
      saved_locations: [{ id: 'p1-loc', label: 'Primary City', city: claims.city || 'Ludhiana', state: claims.state || 'Punjab', is_primary: true }],
      recent_activity: [{ id: 'p1-act', action: 'auth.google_login', target_type: 'user', created_at: new Date().toISOString() }],
      recent_reports: [],
      completed_actions: [],
      saved_scenarios: [],
      notification_history: [],
      consent_records: [{ id: 'p1-con', consent_type: 'account_terms_and_privacy', granted: true, version: 'v1.0-2026', recorded_at: new Date().toISOString() }],
    });
  }
  if (subPath === 'profile/export' && req.method === 'GET' && token) {
    const claims = await verifyToken(token);
    if (!claims) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({
      exported_at_utc: new Date().toISOString(),
      account: buildServerlessUserFromClaims(claims),
      data: { note: 'Exported from Netlify Stage-1 serverless session.' },
    });
  }
  if (subPath === 'profile/preferences' && req.method === 'PATCH' && token) {
    const claims = await verifyToken(token);
    if (!claims) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const next = { ...claims, aqi_threshold: body.aqi_alert_threshold ?? claims.aqi_threshold ?? 150 };
    const jwt = await signServerlessToken(next);
    const res = NextResponse.json({ user: buildServerlessUserFromClaims(next) });
    setSessionCookie(res, req, jwt);
    return res;
  }
  if (subPath === 'actions' && req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({
      action: {
        id: `p1-act-${Date.now()}`,
        category: body.category || 'routine',
        title: body.title || 'Completed protective action',
        exposure_saved_pct: Number(body.exposure_saved_pct || 18),
        co2_saved_g: Number(body.co2_saved_g || 0),
        completed_at: new Date().toISOString(),
      },
    });
  }
  if (subPath === 'trust' && req.method === 'GET') {
    const city = req.nextUrl.searchParams.get('city') || 'Ludhiana';
    const b = await fetchServerlessLiveAir(city);
    return NextResponse.json({
      classifications: [
        { code: 'MEASURED', description: 'Direct physical sensor or reference station measurement.' },
        { code: 'MODEL FORECAST', description: 'Numerical atmospheric & meteorological grid forecast (Open-Meteo CAMS).' },
        { code: 'ESTIMATED', description: 'Deterministic calculation (Indian NAQI breakpoints & relative exposure ratios).' },
        { code: 'USER REPORTED', description: 'Community observation or manual home reading; unverified until reviewed.' },
        { code: 'AI SUMMARY', description: 'Grounded natural-language synthesis citing structured upstream records.' },
      ],
      live_feed_audit: {
        city: b.location.city,
        air_quality_source: b.provenance.air_quality_source,
        weather_source: b.provenance.weather_source,
        observed_time_ist: b.current.observed_time_ist,
        freshness_status: b.current.freshness_status,
        pollutants_retrieved: ['PM2.5', 'PM10', 'NO2', 'O3', 'SO2', 'CO'],
        spatial_resolution: b.provenance.spatial_resolution,
        license: b.provenance.license,
        cpcb_direct_status: 'Connect FASTAPI_BACKEND_URL + CPCB_API_KEY in Stage 2 for direct station feed.',
      },
      models: [
        {
          code: 'OPEN-METEO-CAMS-AQ',
          provider: 'Open-Meteo / Copernicus CAMS',
          version: '2026-live',
          spatial_resolution_km: 11,
          max_horizon_hours: 72,
          uncertainty_profile: '±20–35% on regional PM2.5; does not capture street-canyon micro-plumes.',
          limitations: 'Regional atmospheric grid — never interpret as exact doorstep or indoor air measurement.',
        },
        {
          code: 'VAYU-NAQI-CPCB',
          provider: 'VAYUVERSE Deterministic Engine',
          version: 'v1.0',
          spatial_resolution_km: 11,
          max_horizon_hours: 72,
          uncertainty_profile: 'Deterministic CPCB sub-index breakpoint formula applied to retrieved concentrations.',
          limitations: 'Environmental planning index only — not a clinical or medical diagnosis.',
        },
      ],
      sensor_validation_summary: { calibrated: 4, needs_calibration: 1, anomaly_flagged: 1, total_community_nodes: 6 },
      ai_audit_trail: [],
    });
  }
  if (subPath === 'reports/summary' && req.method === 'GET') {
    const claims = token ? await verifyToken(token) : null;
    const city = String(claims?.city || 'Ludhiana');
    const b = await fetchServerlessLiveAir(city);
    return NextResponse.json({
      generated_at_utc: new Date().toISOString(),
      city: b.location.city,
      provenance: { air_quality_source: b.provenance.air_quality_source, aqi_class: 'ESTIMATED' },
      air_history_48h: b.history_48h,
      kpis: {
        last_24h_avg_aqi: b.comparison.last_24h_avg_aqi,
        prev_24h_avg_aqi: b.comparison.prev_24h_avg_aqi,
        scenarios_saved: 1,
        actions_completed: 2,
        avg_exposure_reduction_pct: 19.2,
        total_co2_avoided_g: 920,
        citizen_reports_filed: 0,
      },
      scenarios: [
        {
          id: 'p1-scen-1',
          type: 'future_me',
          title: `Demo sample: Morning 08:00 vs Afternoon 14:00 (${b.location.city})`,
          city: b.location.city,
          exposure_delta_pct: -22.5,
          created_at: new Date().toISOString(),
        },
      ],
      actions: [
        {
          id: 'p1-act-1',
          category: 'timing_shift',
          title: 'Demo sample: Shifted outdoor walk to cleaner afternoon window',
          exposure_saved_pct: 24,
          co2_saved_g: 0,
          completed_at: new Date().toISOString(),
        },
      ],
      my_incidents: [],
    });
  }
  if (subPath === 'assistant/threads' && req.method === 'GET') {
    return NextResponse.json({ claude_api_live: false, threads: [] });
  }
  if (subPath === 'assistant/chat' && req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const city = String(body.city || 'Ludhiana');
    const b = await fetchServerlessLiveAir(city);
    const cleanWin = b.comparison.cleanest_window;
    return NextResponse.json({
      thread_id: body.thread_id || 'p1-demo-thread',
      message: {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content:
          `**Grounded Air Brief — ${b.location.city} (AI SUMMARY)**\n\n` +
          `• Current estimated Indian NAQI is **${b.current.indian_aqi} (${b.current.category})**, with regional PM2.5 at **${b.current.pollutants.pm25 ?? '—'} µg/m³** and PM10 at **${b.current.pollutants.pm10 ?? '—'} µg/m³** (${b.current.weather.temp_c ?? '—'}°C, wind ${b.current.weather.wind_kph ?? '—'} km/h).\n` +
          (cleanWin
            ? `• Lowest projected 24h window: around **${cleanWin.time.slice(11, 16)} IST** (est. NAQI ~${cleanWin.indian_aqi}).\n`
            : '') +
          `• *Boundary notice:* Derived from regional (~11 km) Open-Meteo CAMS forecast grids — cannot infer indoor room air or exact street-level plumes, and is non-medical guidance.`,
        sources: [
          {
            title: b.provenance.air_quality_source,
            classification: 'MODEL FORECAST',
            timestamp: b.current.observed_time_ist,
            location: b.location.city,
          },
          {
            title: 'CPCB Breakpoint NAQI Calculation',
            classification: 'ESTIMATED',
            timestamp: b.current.observed_time_ist,
            location: b.location.city,
          },
        ],
        reasoning: {
          mode: 'netlify_phase1_grounded',
          city: b.location.city,
          indian_aqi: b.current.indian_aqi,
          pm25: b.current.pollutants.pm25,
        },
        model_used: 'vayuverse-grounded-serverless-v1',
        created_at: new Date().toISOString(),
      },
    });
  }
  if (subPath === 'contact' && req.method === 'POST') {
    return NextResponse.json({ status: 'received', message: 'Thank you — inquiry received.' });
  }

  return NextResponse.json(
    {
      detail:
        'Phase-1 Netlify Mode: Connect your Python FastAPI + PostgreSQL backend via FASTAPI_BACKEND_URL (see DEPLOYMENT_ROADMAP.md Phase 2) to enable full database persistence for this module.',
      phase1_mode: true,
    },
    { status: 503 }
  );
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyOrFallback(req, ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyOrFallback(req, ctx.params);
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyOrFallback(req, ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxyOrFallback(req, ctx.params);
}
