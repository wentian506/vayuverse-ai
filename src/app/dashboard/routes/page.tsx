'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BookmarkPlus, CheckCircle2, Clock, Navigation, Shield } from 'lucide-react';
import DynamicVayuMap from '@/components/maps/VayuMap';
import { ErrorBanner, PageHeader, ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { MapMarkerItem, MapPolylineItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Corridor {
  name: string;
  lat: number;
  lon: number;
}

interface RouteOption {
  id: string;
  name: string;
  color: string;
  distance_km: number;
  duration_min: number;
  corridor_pm25_est: number;
  corridor_indian_aqi: number;
  corridor_category: string;
  exposure_conc_hours: number;
  emissions_co2_g: number;
  data_coverage_pct: number;
  coverage_label: string;
  notes: string;
  geometry: [number, number][];
}

interface RouteResponse {
  city: string;
  origin: Corridor;
  destination: Corridor;
  departure_hour: number;
  matched_forecast_time: string;
  transport_label: string;
  regional_pm25: number;
  routes: RouteOption[];
  lowest_exposure_route_id: string;
  fastest_route_id: string;
  before_you_go_brief: string[];
  explanation: string;
  safety_disclaimer: string;
}

export default function RouteComparisonPage() {
  const { selectedCity, selectedLocation, toast } = useApp();
  const [corridors, setCorridors] = useState<Corridor[]>([]);
  const [originIdx, setOriginIdx] = useState(0);
  const [destIdx, setDestIdx] = useState(1);
  const [departureHour, setDepartureHour] = useState(9);
  const [transportMode, setTransportMode] = useState('ac_car');
  const [result, setResult] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ city: selectedCity });
    if (selectedLocation.lat != null && selectedLocation.lon != null) {
      qs.set('lat', String(selectedLocation.lat));
      qs.set('lon', String(selectedLocation.lon));
    }
    fetch(`/api/v1/cities/resolve?${qs.toString()}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const found = d.location;
        if (found?.corridors?.length >= 2) {
          setCorridors(found.corridors);
          setOriginIdx(0);
          setDestIdx(Math.min(2, found.corridors.length - 1));
        }
      })
      .catch(() => {});
  }, [selectedCity, selectedLocation.lat, selectedLocation.lon]);

  const compare = useCallback(
    async (save = false) => {
      if (corridors.length < 2) return;
      const orig = corridors[originIdx] || corridors[0];
      const dest = corridors[destIdx === originIdx ? (originIdx + 1) % corridors.length : destIdx];
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/routes/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            city: selectedCity,
            origin: orig,
            destination: dest,
            departure_hour: departureHour,
            transport_mode: transportMode,
            save,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || 'Could not compute route alternatives.');
        setResult(json);
        if (save) toast('success', 'Route comparison saved', 'Added to your profile scenarios.');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error comparing routes');
      } finally {
        setLoading(false);
      }
    },
    [corridors, originIdx, destIdx, selectedCity, departureHour, transportMode, toast]
  );

  useEffect(() => {
    if (corridors.length >= 2) {
      compare(false);
    }
  }, [corridors, compare]);

  const polylines: MapPolylineItem[] = result
    ? result.routes.map((r) => ({
        id: r.id,
        positions: r.geometry,
        color: r.color,
        weight: r.id === result.lowest_exposure_route_id ? 6 : 4,
        dashed: r.id !== result.lowest_exposure_route_id,
        label: `${r.name} · ${r.distance_km} km · ${r.duration_min} min · Est. ${r.exposure_conc_hours} µg·h/m³`,
      }))
    : [];

  const endpoints: MapMarkerItem[] = result
    ? [
        { id: 'orig', lat: result.origin.lat, lon: result.origin.lon, title: `Start: ${result.origin.name}`, value: 'A', color: '#21D4E8' },
        { id: 'dest', lat: result.destination.lat, lon: result.destination.lon, title: `Destination: ${result.destination.name}`, value: 'B', color: '#12BFA5' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Before-You-Go & Route Comparison"
        subtitle="Compare travel corridors across distance, duration, estimated pollution context, and regional data coverage before stepping out."
        badge="ADVANCED"
        provenance="ESTIMATED"
        actions={
          <button
            type="button"
            disabled={!result || loading}
            onClick={() => compare(true)}
            className="vayu-btn-secondary text-xs"
          >
            <BookmarkPlus className="h-3.5 w-3.5" /> Save Comparison
          </button>
        }
      />

      <FeatureInteractiveStudio variant="routes" />

      {/* Route Planner Inputs */}
      <div className="vayu-card p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Starting Location ({selectedCity})</label>
          <select value={originIdx} onChange={(e) => setOriginIdx(Number(e.target.value))} className="vayu-select w-full text-xs">
            {corridors.map((c, i) => (
              <option key={c.name} value={i}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Destination</label>
          <select value={destIdx} onChange={(e) => setDestIdx(Number(e.target.value))} className="vayu-select w-full text-xs">
            {corridors.map((c, i) => (
              <option key={c.name} value={i}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Departure Time (IST)</label>
          <select value={departureHour} onChange={(e) => setDepartureHour(Number(e.target.value))} className="vayu-select w-full text-xs">
            {Array.from({ length: 18 }, (_, i) => i + 5).map((h) => (
              <option key={h} value={h}>{`${h.toString().padStart(2, '0')}:00 IST`}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Travel Mode</label>
          <select value={transportMode} onChange={(e) => setTransportMode(e.target.value)} className="vayu-select w-full text-xs">
            <option value="ac_car">AC Car (Recirculate)</option>
            <option value="metro_ev">Metro / Electric Transit</option>
            <option value="city_bus">City Bus</option>
            <option value="two_wheeler">Two-Wheeler</option>
            <option value="cycling">Cycling</option>
            <option value="walking">Walking</option>
          </select>
        </div>
        <div className="flex items-end">
          <button type="button" onClick={() => compare(false)} disabled={loading} className="vayu-btn-primary w-full text-xs">
            <Navigation className="h-3.5 w-3.5" /> {loading ? 'Computing...' : 'Compare Corridors'}
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => compare(false)} />}

      {result && (
        <>
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="vayu-card p-5 lg:col-span-7">
              <DynamicVayuMap
                center={[
                  (result.origin.lat + result.destination.lat) / 2,
                  (result.origin.lon + result.destination.lon) / 2,
                ]}
                zoom={12}
                height={380}
                markers={endpoints}
                polylines={polylines}
              />
            </div>

            <div className="vayu-card p-6 lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-white">Before-You-Go Brief</h2>
                <ProvenanceBadge type="ESTIMATED" compact />
              </div>
              <p className="text-xs leading-relaxed text-slate-200">{result.explanation}</p>
              <ul className="space-y-2 text-xs text-slate-300">
                {result.before_you_go_brief.map((item) => (
                  <li key={item} className="flex items-start gap-2 rounded-xl border border-white/10 bg-[#071224] p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-vayu-teal" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-950/25 p-3 text-[11px] text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <span>{result.safety_disclaimer}</span>
              </div>
            </div>
          </div>

          {/* 3 Route Cards */}
          <div className="grid gap-4 lg:grid-cols-3">
            {result.routes.map((r) => {
              const isBest = r.id === result.lowest_exposure_route_id;
              return (
                <div
                  key={r.id}
                  className={cn(
                    'vayu-card p-5 space-y-3',
                    isBest && 'border-vayu-teal/50 shadow-glow-teal'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-white">{r.name}</h3>
                    {isBest && (
                      <span className="shrink-0 rounded-full bg-vayu-teal/20 px-2.5 py-0.5 font-mono text-[10px] font-bold text-vayu-teal">
                        LOWEST EST. EXPOSURE
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-[#071224] p-2.5">
                      <span className="text-[10px] text-slate-400">Distance</span>
                      <p className="font-display text-base font-bold text-white">{r.distance_km} km</p>
                    </div>
                    <div className="rounded-lg bg-[#071224] p-2.5">
                      <span className="flex items-center gap-1 text-[10px] text-slate-400"><Clock className="h-3 w-3" /> Time</span>
                      <p className="font-display text-base font-bold text-white">{r.duration_min} min</p>
                    </div>
                    <div className="rounded-lg bg-[#071224] p-2.5">
                      <span className="text-[10px] text-slate-400">Exp. Score</span>
                      <p className="font-display text-base font-bold" style={{ color: r.color }}>
                        {r.exposure_conc_hours}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300">
                    Corridor PM2.5 est.: <strong>{r.corridor_pm25_est} µg/m³</strong> (NAQI ~{r.corridor_indian_aqi}, {r.corridor_category}) · CO2e: {r.emissions_co2_g} g
                  </p>
                  <p className="text-xs text-slate-400">{r.notes}</p>
                  <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Shield className="h-3.5 w-3.5 text-vayu-cyan" /> Data coverage: {r.data_coverage_pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
