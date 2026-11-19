'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, Compass, Droplets, Gauge, MapPin, RefreshCw, ShieldCheck, Thermometer, Wind } from 'lucide-react';
import {
  AnimatedNumber,
  AqiGauge,
  ErrorBanner,
  LoadingSkeleton,
  PageHeader,
  ProvenanceBadge,
  TierBadge,
} from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { InteractiveAirMapExplorer } from '@/components/maps/InteractiveAirMapExplorer';
import { CitySearchPicker } from '@/components/ui/CitySearchPicker';
import { LiveAirBundle } from '@/lib/types';
import { cn, formatIstTime, formatShortHour, getAqiStyle } from '@/lib/utils';

export default function LiveAirIntelligencePage() {
  const { selectedCity, selectedLocation, setSelectedCity } = useApp();
  const [bundle, setBundle] = useState<LiveAirBundle | null>(null);
  const [cityTable, setCityTable] = useState<Record<string, unknown>[]>([]);
  const [activePollutant, setActivePollutant] = useState<'pm25' | 'pm10' | 'no2' | 'o3'>('pm25');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ city: selectedCity });
      if (selectedLocation.lat != null && selectedLocation.lon != null) {
        qs.set('lat', String(selectedLocation.lat));
        qs.set('lon', String(selectedLocation.lon));
      }
      const [r1, r2] = await Promise.all([
        fetch(`/api/v1/air/live?${qs.toString()}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/v1/air/network', { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!r1.ok) throw new Error('Could not retrieve live environmental measurements.');
      setBundle(await r1.json());
      if (r2.ok) {
        const net = await r2.json();
        setCityTable(net.cities || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [selectedCity, selectedLocation.lat, selectedLocation.lon]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !bundle) return <LoadingSkeleton rows={3} />;
  if (error || !bundle) return <ErrorBanner message={error || 'Feed unavailable'} onRetry={load} />;

  const cur = bundle.current;
  const pol = cur.pollutants;
  const wx = cur.weather;

  const subIndexChart = Object.entries(cur.sub_indices)
    .filter(([, v]) => v != null)
    .map(([name, value]) => ({ name, subIndex: value }));

  const pollutantDetails = [
    { key: 'PM2.5', val: pol.pm25, unit: 'µg/m³', limit: '60 µg/m³ (24h CPCB)', desc: 'Fine inhalable particulate matter (≤2.5 µm) from combustion and secondary aerosols.' },
    { key: 'PM10', val: pol.pm10, unit: 'µg/m³', limit: '100 µg/m³ (24h CPCB)', desc: 'Coarse thoracic particulate matter (≤10 µm) including road & construction dust.' },
    { key: 'NO2', val: pol.no2, unit: 'µg/m³', limit: '80 µg/m³ (24h CPCB)', desc: 'Nitrogen dioxide associated primarily with vehicular tailpipe and burner emissions.' },
    { key: 'O3', val: pol.o3, unit: 'µg/m³', limit: '100 µg/m³ (8h CPCB)', desc: 'Ground-level ozone formed photochemically during sunny afternoon hours.' },
    { key: 'SO2', val: pol.so2, unit: 'µg/m³', limit: '80 µg/m³ (24h CPCB)', desc: 'Sulphur dioxide linked to sulphur-bearing fuel combustion.' },
    { key: 'CO', val: pol.co_mg, unit: 'mg/m³', limit: '2.0 mg/m³ (8h CPCB)', desc: 'Carbon monoxide from incomplete fuel and biomass combustion.' },
  ];

  const historySeries = bundle.history_48h.map((h) => ({
    time: formatShortHour(h.time),
    pm25: h.pm25,
    pm10: h.pm10,
    no2: h.no2,
    o3: h.o3,
    aqi: h.indian_aqi,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Air Intelligence"
        subtitle="Indian National AQI (CPCB) sub-index decomposition, 48-hour pollutant history, boundary-layer meteorology, and full station/grid provenance."
        badge="MVP"
        provenance="MODEL FORECAST"
        actions={
          <>
            <CitySearchPicker variant="header" />
            <button type="button" onClick={load} className="vayu-btn-secondary text-xs">
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </>
        }
      />

      <InteractiveAirMapExplorer
        id="live-air-map"
        activeAir={bundle}
        onBundleLoaded={(b) => setBundle(b)}
      />

      <FeatureInteractiveStudio variant="live-air" />

      {bundle.is_demo_fallback && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-950/30 p-4 text-xs text-amber-200 flex items-center gap-2">
          <TierBadge tier="DEMO" />
          <span>{bundle.fallback_reason}</span>
        </div>
      )}

      {/* Hero AQI + Sub-Index Breakdown + Station Metadata */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-4 flex flex-col items-center text-center">
          <div className="flex w-full items-center justify-between">
            <span className="font-mono text-[11px] uppercase text-slate-400">{bundle.location.city}</span>
            <ProvenanceBadge type="ESTIMATED" compact />
          </div>
          <div className="my-4">
            <AqiGauge aqi={cur.indian_aqi} category={cur.category} size={180} />
          </div>
          <p className="text-xs text-slate-200">
            Dominant Pollutant: <strong className="text-vayu-cyan">{cur.dominant_pollutant}</strong>
            {cur.us_aqi != null && <span className="text-slate-400"> · US AQI ref: {cur.us_aqi}</span>}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-slate-300">{cur.advisory}</p>
        </div>

        <div className="vayu-card p-6 lg:col-span-4">
          <h2 className="font-display text-base font-bold text-white">CPCB Pollutant Sub-Indices</h2>
          <p className="mt-0.5 text-xs text-slate-400">Indian NAQI equals the highest individual pollutant sub-index.</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subIndexChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0A192F', border: '1px solid rgba(33,212,232,0.35)', borderRadius: '10px', fontSize: '12px' }}
                />
                <Bar dataKey="subIndex" name="Indian NAQI Sub-Index" fill="#21D4E8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="vayu-card p-6 lg:col-span-4 space-y-3 text-xs">
          <h2 className="font-display text-base font-bold text-white">Source, Freshness &amp; Station Context</h2>
          <div className="space-y-2.5 text-slate-300">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-vayu-cyan" />
              <div>
                <p className="font-semibold text-white">Nearest Reference Station</p>
                <p className="text-slate-400">{bundle.location.nearest_reference_station} ({bundle.location.station_operator})</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Compass className="mt-0.5 h-4 w-4 shrink-0 text-vayu-purple" />
              <div>
                <p className="font-semibold text-white">Model Grid Coordinates</p>
                <p className="font-mono text-[11px] text-slate-400">
                  {bundle.location.grid_lat.toFixed(3)}°N, {bundle.location.grid_lon.toFixed(3)}°E · Elev {bundle.location.elevation_m ?? '—'}m
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-vayu-teal" />
              <div>
                <p className="font-semibold text-white">Timestamp &amp; Freshness</p>
                <p className="text-slate-400">{formatIstTime(cur.observed_time_ist)} · <span className="text-vayu-teal">{cur.freshness_status}</span></p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
              <div>
                <p className="font-semibold text-white">Primary Data Source</p>
                <p className="text-slate-400">{bundle.provenance.air_quality_source}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{bundle.provenance.spatial_resolution}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Individual Pollutant Concentrations */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-white">Individual Pollutant Concentrations</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pollutantDetails.map((p) => (
            <div key={p.key} className="vayu-card-hover p-5">
              <div className="flex items-center justify-between">
                <span className="font-display text-base font-bold text-white">{p.key}</span>
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-300">
                  {p.limit}
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-bold text-vayu-cyan">
                  <AnimatedNumber value={p.val ?? null} decimals={p.key === 'CO' ? 2 : 1} />
                </span>
                <span className="text-xs text-slate-400">{p.unit}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 48-Hour Historical Pollutant Chart + Weather Context */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-white">48-Hour Pollutant History (µg/m³)</h2>
              <p className="text-xs text-slate-400">Diurnal accumulation and afternoon boundary-layer ventilation pattern.</p>
            </div>
            <div className="flex gap-1.5">
              {(['pm25', 'pm10', 'no2', 'o3'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActivePollutant(k)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-mono text-xs font-semibold uppercase transition',
                    activePollutant === k ? 'bg-vayu-electric text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  )}
                >
                  {k === 'pm25' ? 'PM2.5' : k}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historySeries} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} minTickGap={28} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0A192F', border: '1px solid rgba(33,212,232,0.35)', borderRadius: '10px', fontSize: '12px' }} />
                <Line type="monotone" dataKey={activePollutant} name={activePollutant.toUpperCase()} stroke="#12BFA5" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="vayu-card p-6 lg:col-span-4 space-y-4">
          <h2 className="font-display text-lg font-bold text-white">Meteorological Context</h2>
          <p className="text-xs text-slate-400">Source: {bundle.provenance.weather_source}</p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-white/10 bg-[#071224] p-3.5">
              <Thermometer className="h-4 w-4 text-amber-300" />
              <p className="mt-2 text-slate-400">Temperature</p>
              <p className="font-display text-xl font-bold text-white">{wx.temp_c}°C</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#071224] p-3.5">
              <Droplets className="h-4 w-4 text-vayu-electric" />
              <p className="mt-2 text-slate-400">Humidity</p>
              <p className="font-display text-xl font-bold text-white">{wx.humidity_pct}%</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#071224] p-3.5">
              <Wind className="h-4 w-4 text-vayu-teal" />
              <p className="mt-2 text-slate-400">Wind Vector</p>
              <p className="font-display text-xl font-bold text-white">{wx.wind_kph} km/h {wx.wind_compass}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#071224] p-3.5">
              <Gauge className="h-4 w-4 text-vayu-purple" />
              <p className="mt-2 text-slate-400">Pressure</p>
              <p className="font-display text-xl font-bold text-white">{wx.pressure_hpa ?? '—'} hPa</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            {(wx.wind_kph ?? 0) < 8
              ? 'Low wind speed (< 8 km/h) reduces horizontal dispersion, allowing local emissions to linger longer.'
              : 'Moderate surface breeze is actively aiding regional pollutant ventilation.'}
          </p>
        </div>
      </div>

      {/* National Multi-City Snapshot Table */}
      <section className="vayu-card p-6">
        <h2 className="font-display text-lg font-bold text-white">Indian Multi-City Air Comparison</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 font-mono text-[10.5px] uppercase text-slate-400">
              <tr>
                <th className="py-2.5 pr-4">City</th>
                <th className="py-2.5 pr-4">Indian NAQI</th>
                <th className="py-2.5 pr-4">Category</th>
                <th className="py-2.5 pr-4">PM2.5</th>
                <th className="py-2.5 pr-4">PM10</th>
                <th className="py-2.5 pr-4">Nearest Reference Station</th>
                <th className="py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-slate-200">
              {cityTable.map((row) => {
                const aqiNum = Number(row.indian_aqi || 0);
                const st = getAqiStyle(aqiNum);
                return (
                  <tr
                    key={String(row.city)}
                    onClick={() => setSelectedCity(String(row.city))}
                    className="cursor-pointer transition hover:bg-white/[0.04]"
                  >
                    <td className="py-3 pr-4 font-semibold text-white">{String(row.city)}</td>
                    <td className="py-3 pr-4 font-display text-sm font-bold" style={{ color: st.color }}>{aqiNum}</td>
                    <td className="py-3 pr-4">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10.5px] font-semibold', st.bg, st.text, st.border)}>
                        {String(row.category)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono">{String(row.pm25 ?? '—')} µg/m³</td>
                    <td className="py-3 pr-4 font-mono">{String(row.pm10 ?? '—')} µg/m³</td>
                    <td className="py-3 pr-4 text-slate-400">{String(row.nearest_station)}</td>
                    <td className="py-3 font-mono text-[11px] text-slate-400">{formatShortHour(String(row.observed_time_ist || ''))} IST</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
