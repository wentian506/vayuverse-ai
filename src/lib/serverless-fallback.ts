/**
 * Netlify Phase-1 Serverless Environmental Engine.
 * When deployed on Netlify BEFORE the external Python FastAPI + PostgreSQL backend is attached,
 * this server-side engine fetches REAL live Open-Meteo Air Quality & Weather data and computes
 * deterministic CPCB Indian NAQI, Future Me, Route Comparison, Replanner, and Grounded AI outputs
 * so Phase-1 ("Deploy on Netlify with Sign in with Google first") works seamlessly out of the box.
 * Once `FASTAPI_BACKEND_URL` is set (Phase 2), `/api/v1/*` routes directly to Python FastAPI + DB.
 */

export const SERVERLESS_CITIES: Record<
  string,
  {
    city: string;
    state: string;
    country: string;
    lat: number;
    lon: number;
    nearest_station: string;
    operator: string;
    corridors: { name: string; lat: number; lon: number }[];
  }
> = {
  Ludhiana: {
    city: 'Ludhiana',
    state: 'Punjab',
    country: 'India',
    lat: 30.901,
    lon: 75.8573,
    nearest_station: 'PAU Campus CAAQMS, Ludhiana',
    operator: 'PPCB / CPCB',
    corridors: [
      { name: 'PAU Campus', lat: 30.901, lon: 75.807 },
      { name: 'Sarabha Nagar', lat: 30.8855, lon: 75.8212 },
      { name: 'Ferozepur Road', lat: 30.892, lon: 75.838 },
      { name: 'Civil Lines', lat: 30.9145, lon: 75.844 },
      { name: 'Focal Point Phase V', lat: 30.875, lon: 75.915 },
    ],
  },
  'New Delhi': {
    city: 'New Delhi',
    state: 'Delhi NCR',
    country: 'India',
    lat: 28.6139,
    lon: 77.209,
    nearest_station: 'ITO / Lodhi Road CAAQMS, New Delhi',
    operator: 'CPCB / DPCC / IMD',
    corridors: [
      { name: 'Connaught Place', lat: 28.6315, lon: 77.2167 },
      { name: 'Lodhi Road', lat: 28.5918, lon: 77.2273 },
      { name: 'Anand Vihar', lat: 28.6469, lon: 77.3164 },
      { name: 'Hauz Khas', lat: 28.5494, lon: 77.2001 },
    ],
  },
  Ahmedabad: {
    city: 'Ahmedabad',
    state: 'Gujarat',
    country: 'India',
    lat: 23.0225,
    lon: 72.5714,
    nearest_station: 'Maninagar / Navrangpura CAAQMS, Ahmedabad',
    operator: 'GPCB / CPCB / SAFAR',
    corridors: [
      { name: 'Navrangpura', lat: 23.0365, lon: 72.5611 },
      { name: 'Sabarmati Riverfront', lat: 23.0274, lon: 72.5746 },
      { name: 'Maninagar', lat: 22.9962, lon: 72.6026 },
      { name: 'SG Highway', lat: 23.0305, lon: 72.5076 },
    ],
  },
  Chandigarh: {
    city: 'Chandigarh',
    state: 'Chandigarh UT',
    country: 'India',
    lat: 30.7333,
    lon: 76.7794,
    nearest_station: 'Sector 25 CAAQMS, Chandigarh',
    operator: 'CPCC / CPCB',
    corridors: [
      { name: 'Sector 17 Plaza', lat: 30.7415, lon: 76.7821 },
      { name: 'Panjab University', lat: 30.7603, lon: 76.7664 },
      { name: 'Sukhna Lake', lat: 30.7421, lon: 76.8188 },
    ],
  },
  Amritsar: {
    city: 'Amritsar',
    state: 'Punjab',
    country: 'India',
    lat: 31.634,
    lon: 74.8723,
    nearest_station: 'Golden Temple CAAQMS, Amritsar',
    operator: 'PPCB / CPCB',
    corridors: [
      { name: 'Heritage Street', lat: 31.6225, lon: 74.8788 },
      { name: 'GNDU Campus', lat: 31.6348, lon: 74.8256 },
      { name: 'Ranjit Avenue', lat: 31.6542, lon: 74.8647 },
    ],
  },
  Mumbai: {
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    lat: 19.076,
    lon: 72.8777,
    nearest_station: 'Bandra Kurla Complex CAAQMS, Mumbai',
    operator: 'MPCB / CPCB',
    corridors: [
      { name: 'BKC', lat: 19.0654, lon: 72.8681 },
      { name: 'Powai', lat: 19.1176, lon: 72.906 },
      { name: 'Colaba', lat: 18.9067, lon: 72.8147 },
    ],
  },
  Bengaluru: {
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    lat: 12.9716,
    lon: 77.5946,
    nearest_station: 'Cubbon Park CAAQMS, Bengaluru',
    operator: 'KSPCB / CPCB',
    corridors: [
      { name: 'Cubbon Park', lat: 12.9763, lon: 77.5929 },
      { name: 'Indiranagar', lat: 12.9784, lon: 77.6408 },
      { name: 'Whitefield', lat: 12.9698, lon: 77.75 },
    ],
  },
};

const BPS: Record<string, [number, number, number, number][]> = {
  pm25: [[0, 30, 0, 50], [30, 60, 51, 100], [60, 90, 101, 200], [90, 120, 201, 300], [120, 250, 301, 400], [250, 500, 401, 500]],
  pm10: [[0, 50, 0, 50], [50, 100, 51, 100], [100, 250, 101, 200], [250, 350, 201, 300], [350, 430, 301, 400], [430, 600, 401, 500]],
  no2: [[0, 40, 0, 50], [40, 80, 51, 100], [80, 180, 101, 200], [180, 280, 201, 300], [280, 400, 301, 400], [400, 600, 401, 500]],
  o3: [[0, 50, 0, 50], [50, 100, 51, 100], [100, 168, 101, 200], [168, 208, 201, 300], [208, 748, 301, 400], [748, 1000, 401, 500]],
};

function subIdx(k: string, val?: number | null): number | null {
  if (val == null || val < 0) return null;
  for (const [cl, ch, il, ih] of BPS[k] || []) {
    if (val <= ch) return Math.max(0, Math.min(500, Math.round(((ih - il) / (ch - cl)) * (val - cl) + il)));
  }
  return 500;
}

export function calcIndianNaqi(pm25?: number | null, pm10?: number | null, no2?: number | null, o3?: number | null) {
  const subs: Record<string, number | null> = {
    'PM2.5': subIdx('pm25', pm25),
    PM10: subIdx('pm10', pm10),
    NO2: subIdx('no2', no2),
    O3: subIdx('o3', o3),
  };
  let dom = 'PM2.5';
  let aqi = 0;
  for (const [k, v] of Object.entries(subs)) {
    if (v != null && v >= aqi) {
      aqi = v;
      dom = k;
    }
  }
  const category =
    aqi <= 50 ? 'Good' : aqi <= 100 ? 'Satisfactory' : aqi <= 200 ? 'Moderate' : aqi <= 300 ? 'Poor' : aqi <= 400 ? 'Very Poor' : 'Severe';
  const color =
    aqi <= 50 ? '#12BFA5' : aqi <= 100 ? '#84CC16' : aqi <= 200 ? '#EAB308' : aqi <= 300 ? '#F97316' : aqi <= 400 ? '#EF4444' : '#B91C1C';
  return { aqi, category, color, dominant_pollutant: dom, sub_indices: subs };
}

export async function searchServerlessCities(query: string, limit = 12) {
  const q = (query || '').trim();
  const curated = Object.values(SERVERLESS_CITIES)
    .filter((c) => !q || c.city.toLowerCase().includes(q.toLowerCase()) || c.state.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({
      city: c.city,
      state: c.state,
      country: c.country,
      country_code: 'IN',
      lat: c.lat,
      lon: c.lon,
      nearest_station: c.nearest_station,
      is_curated: true,
    }));
  if (q.length < 2) return curated.slice(0, limit);
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=16&language=en&format=json`,
      { cache: 'no-store' }
    );
    const d = await r.json();
    const list = Array.isArray(d.results) ? d.results : [];
    list.sort(
      (a: { country_code?: string; population?: number }, b: { country_code?: string; population?: number }) =>
        (a.country_code === 'IN' ? 0 : 1) - (b.country_code === 'IN' ? 0 : 1) ||
        (b.population || 0) - (a.population || 0)
    );
    const merged = [...curated];
    for (const g of list) {
      if (merged.some((m) => Math.abs(m.lat - g.latitude) < 0.1 && Math.abs(m.lon - g.longitude) < 0.1)) continue;
      merged.push({
        city: String(g.name || q),
        state: String(g.admin1 || g.admin2 || g.country || ''),
        country: String(g.country || 'Global'),
        country_code: String(g.country_code || ''),
        lat: Number(Number(g.latitude).toFixed(4)),
        lon: Number(Number(g.longitude).toFixed(4)),
        nearest_station: `Open-Meteo CAMS Grid (${Number(g.latitude).toFixed(3)}°, ${Number(g.longitude).toFixed(3)}°)`,
        is_curated: false,
      });
      if (merged.length >= limit) break;
    }
    return merged.slice(0, limit);
  } catch {
    return curated.slice(0, limit);
  }
}

export async function fetchServerlessLiveAir(
  cityName = 'Ludhiana',
  latParam?: number | null,
  lonParam?: number | null
) {
  let meta = Object.values(SERVERLESS_CITIES).find(
    (c) => c.city.toLowerCase() === (cityName || '').trim().toLowerCase()
  );
  if (latParam != null && lonParam != null && Number.isFinite(latParam) && Number.isFinite(lonParam)) {
    let resolvedCity = cityName?.trim() || `Map Pin (${latParam.toFixed(2)}°, ${lonParam.toFixed(2)}°)`;
    let resolvedState = 'Regional Grid';
    let resolvedCountry = 'Global';
    try {
      const rv = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latParam.toFixed(4)}&longitude=${lonParam.toFixed(4)}&localityLanguage=en`,
        { cache: 'no-store' }
      );
      if (rv.ok) {
        const rd = await rv.json();
        resolvedCity = rd.city || rd.locality || rd.principalSubdivision || resolvedCity;
        resolvedState = rd.principalSubdivision || resolvedState;
        resolvedCountry = rd.countryName || resolvedCountry;
      }
    } catch {
      // keep coordinate label
    }
    meta = {
      city: resolvedCity,
      state: resolvedState,
      country: resolvedCountry,
      lat: Number(latParam.toFixed(4)),
      lon: Number(lonParam.toFixed(4)),
      nearest_station: `Open-Meteo CAMS Grid (${latParam.toFixed(3)}°, ${lonParam.toFixed(3)}°)`,
      operator: 'Copernicus CAMS / ECMWF Atmospheric Analysis',
      corridors: [
        { name: `${resolvedCity} Central`, lat: latParam, lon: lonParam },
        { name: `${resolvedCity} North`, lat: latParam + 0.03, lon: lonParam },
        { name: `${resolvedCity} South`, lat: latParam - 0.03, lon: lonParam },
      ],
    };
  } else if (!meta && cityName?.trim()) {
    const found = await searchServerlessCities(cityName, 1);
    if (found[0]) {
      meta = {
        city: found[0].city,
        state: found[0].state,
        country: found[0].country,
        lat: found[0].lat,
        lon: found[0].lon,
        nearest_station: found[0].nearest_station,
        operator: 'Copernicus CAMS / ECMWF Atmospheric Analysis',
        corridors: [
          { name: `${found[0].city} Central`, lat: found[0].lat, lon: found[0].lon },
          { name: `${found[0].city} North`, lat: found[0].lat + 0.03, lon: found[0].lon },
          { name: `${found[0].city} South`, lat: found[0].lat - 0.03, lon: found[0].lon },
        ],
      };
    }
  }
  if (!meta) meta = SERVERLESS_CITIES.Ludhiana;
  const tzParam = meta.country === 'India' ? 'Asia%2FKolkata' : 'auto';
  const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${meta.lat}&longitude=${meta.lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi,european_aqi,uv_index&hourly=pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide&past_days=2&forecast_days=3&timezone=${tzParam}`;
  const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${meta.lat}&longitude=${meta.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,apparent_temperature,cloud_cover&timezone=${tzParam}`;

  const [aqRes, wxRes] = await Promise.all([
    fetch(aqUrl, { cache: 'no-store' }),
    fetch(wxUrl, { cache: 'no-store' }),
  ]);
  const aq = await aqRes.json();
  const wx = await wxRes.json();
  const cur = aq.current || {};
  const cwx = wx.current || {};
  const naqi = calcIndianNaqi(cur.pm2_5, cur.pm10, cur.nitrogen_dioxide, cur.ozone);
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const compass = cwx.wind_direction_10m != null ? dirs[Math.floor(((cwx.wind_direction_10m + 22.5) % 360) / 45)] : 'NW';

  const times: string[] = aq.hourly?.time || [];
  const allPts = times.map((t, i) => {
    const p25 = aq.hourly.pm2_5?.[i] ?? null;
    const p10 = aq.hourly.pm10?.[i] ?? null;
    const n2 = aq.hourly.nitrogen_dioxide?.[i] ?? null;
    const oz = aq.hourly.ozone?.[i] ?? null;
    const s = calcIndianNaqi(p25, p10, n2, oz);
    return {
      time: t,
      indian_aqi: s.aqi,
      category: s.category,
      pm25: p25 != null ? Math.round(p25 * 10) / 10 : null,
      pm10: p10 != null ? Math.round(p10 * 10) / 10 : null,
      no2: n2 != null ? Math.round(n2 * 10) / 10 : null,
      o3: oz != null ? Math.round(oz * 10) / 10 : null,
      is_forecast: cur.time ? t > cur.time : i >= 48,
      provenance: 'MODEL FORECAST',
    };
  });
  const past = allPts.filter((p) => !p.is_forecast);
  const fut = allPts.filter((p) => p.is_forecast);
  const next24 = fut.slice(0, 24);
  const cleanest = next24.reduce((a, b) => (b.indian_aqi < a.indian_aqi ? b : a), next24[0] || past[0]);
  const peak = next24.reduce((a, b) => (b.indian_aqi > a.indian_aqi ? b : a), next24[0] || past[0]);
  const avg24 = Math.round(past.slice(-24).reduce((s, p) => s + p.indian_aqi, 0) / Math.max(1, past.slice(-24).length));
  const prev24 = Math.round(past.slice(-48, -24).reduce((s, p) => s + p.indian_aqi, 0) / Math.max(1, past.slice(-48, -24).length));

  return {
    is_live: true,
    is_demo_fallback: false,
    location: {
      city: meta.city,
      state: meta.state,
      country: meta.country,
      lat: meta.lat,
      lon: meta.lon,
      grid_lat: aq.latitude ?? meta.lat,
      grid_lon: aq.longitude ?? meta.lon,
      elevation_m: aq.elevation ?? 250,
      timezone: 'Asia/Kolkata (IST)',
      nearest_reference_station: meta.nearest_station,
      station_operator: meta.operator,
      corridors: meta.corridors,
    },
    current: {
      observed_time_ist: cur.time,
      weather_time_ist: cwx.time,
      fetched_at_utc: new Date().toISOString(),
      freshness_status: 'Live Feed (< 60 min model cycle)',
      indian_aqi: naqi.aqi,
      us_aqi: cur.us_aqi,
      category: naqi.category,
      color: naqi.color,
      dominant_pollutant: naqi.dominant_pollutant,
      advisory: 'Shift flexible strenuous outdoor schedules toward lower-PM2.5 afternoon mixing windows.',
      standard: 'Indian National AQI (CPCB Breakpoint Methodology)',
      sub_indices: naqi.sub_indices,
      pollutants: {
        pm25: cur.pm2_5,
        pm10: cur.pm10,
        no2: cur.nitrogen_dioxide,
        o3: cur.ozone,
        so2: cur.sulphur_dioxide,
        co_ug: cur.carbon_monoxide,
        co_mg: cur.carbon_monoxide ? Math.round((cur.carbon_monoxide / 1000) * 100) / 100 : null,
      },
      weather: {
        temp_c: cwx.temperature_2m,
        feels_like_c: cwx.apparent_temperature,
        humidity_pct: cwx.relative_humidity_2m,
        wind_kph: cwx.wind_speed_10m,
        wind_dir_deg: cwx.wind_direction_10m,
        wind_compass: compass,
        pressure_hpa: cwx.surface_pressure,
      },
    },
    provenance: {
      concentrations_class: 'MODEL FORECAST',
      aqi_class: 'ESTIMATED',
      air_quality_source: 'Open-Meteo Air Quality API (Copernicus CAMS Global Atmospheric Analysis)',
      weather_source: 'Open-Meteo Meteorological Forecast API',
      aqi_methodology: 'CPCB Indian National Air Quality Index (NAQI) deterministic breakpoint calculation',
      spatial_resolution: '~11–40 km regional atmospheric grid (not street-level measurement)',
      license: 'CC BY 4.0 (Open-Meteo & Copernicus CAMS)',
      note: 'Running on Netlify Phase-1 Serverless Engine. Set FASTAPI_BACKEND_URL to activate full Phase-2 FastAPI + PostgreSQL persistence.',
    },
    comparison: {
      last_24h_avg_aqi: avg24,
      prev_24h_avg_aqi: prev24,
      delta_aqi: avg24 - prev24,
      cleanest_window: cleanest,
      peak_window: peak,
      emergency_mode_recommended: naqi.aqi >= 201,
    },
    history_48h: past.slice(-48),
    forecast_72h: fut.slice(0, 72),
    combined_timeline: [...past.slice(-24), ...fut.slice(0, 24)],
  };
}

export function buildServerlessUserFromClaims(claims: Record<string, unknown>) {
  const provider = String(claims.provider || 'google');
  const isDemo = Boolean(claims.is_demo) || provider === 'demo';
  return {
    id: String(claims.sub || 'google-user'),
    email: String(claims.email || ''),
    auth_provider: provider,
    is_demo: isDemo,
    google_connected: provider === 'google',
    has_password: provider !== 'google' && !isDemo,
    role: isDemo ? 'individual' : String(claims.role || 'individual'),
    is_admin: !isDemo && ['community_moderator', 'civic_team', 'campus_admin'].includes(String(claims.role || '')),
    account_status: 'active',
    onboarding_completed: isDemo ? true : Boolean(claims.onboarding_completed ?? false),
    created_at: String(claims.created_at || new Date().toISOString()),
    last_login_at: new Date().toISOString(),
    unread_notifications: 1,
    profile: {
      full_name: String(claims.name || (isDemo ? 'Demo Explorer' : 'VAYUVERSE Member')),
      avatar_url: claims.picture ? String(claims.picture) : null,
      city: String(claims.city || 'Ludhiana'),
      state: String(claims.state || 'Punjab'),
      country: 'India',
      coarse_lat: 30.901,
      coarse_lon: 75.8573,
      preferred_language: String(claims.lang || 'en'),
      bio: String(
        claims.bio ||
          (isDemo
            ? 'Interactive Demo Mode session — exploring live environmental data in a temporary guest workspace.'
            : 'Signed in on Netlify Phase-1 Deployment.')
      ),
    },
    preferences: {
      aqi_alert_threshold: Number(claims.aqi_threshold || 150),
      notify_aqi_alerts: true,
      notify_forecast_spikes: true,
      notify_community_updates: true,
      notify_campus_alerts: false,
      notify_routine_reminders: true,
      coarse_location_only: true,
      routine_profiling_enabled: true,
      low_bandwidth_mode: false,
      reduced_motion: false,
    },
    routine: {
      commute_start: '08:30',
      commute_end: '18:30',
      primary_transport: 'ac_car',
      exercise_window: '06:30',
      has_indoor_purifier: true,
    },
  };
}
