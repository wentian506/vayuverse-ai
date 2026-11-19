'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, Info, Layers, MapPin, Pause, Play, ShieldCheck } from 'lucide-react';
import DynamicVayuMap from '@/components/maps/VayuMap';
import { ErrorBanner, LoadingSkeleton, PageHeader, ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { MapMarkerItem } from '@/lib/types';
import { cn, formatIstTime } from '@/lib/utils';

interface ShadowCell {
  label: string;
  lat: number;
  lon: number;
  radius_m: number;
  pm25: number;
  pm10: number;
  no2: number;
  o3: number;
  indian_aqi: number;
  category: string;
  color: string;
  uncertainty_pct: number;
}

interface ShadowPayload {
  is_live: boolean;
  city: string;
  center: { lat: number; lon: number };
  horizon_hours: number;
  valid_time_ist: string;
  uncertainty_pct: number;
  confidence_tier: string;
  model: {
    name: string;
    version: string;
    spatial_resolution_km: number;
    grid_spacing_km: number;
    max_horizon_hours: number;
    precision_disclaimer: string;
  };
  nearest_reference: { name: string; operator: string; lat: number; lon: number };
  cells: ShadowCell[];
  data_gaps: { sector: string; gap_type: string; recommendation: string }[];
}

export default function PollutionShadowPage() {
  const { selectedCity, selectedLocation } = useApp();
  const [horizon, setHorizon] = useState(0);
  const [pollutant, setPollutant] = useState<'indian_aqi' | 'pm25' | 'pm10' | 'no2' | 'o3'>('pm25');
  const [playing, setPlaying] = useState(false);
  const [data, setData] = useState<ShadowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (h: number) => {
    setError(null);
    try {
      const qs = new URLSearchParams({
        city: selectedCity,
        horizon_hours: String(h),
      });
      if (selectedLocation.lat != null && selectedLocation.lon != null) {
        qs.set('lat', String(selectedLocation.lat));
        qs.set('lon', String(selectedLocation.lon));
      }
      const res = await fetch(`/api/v1/air/pollution-shadow?${qs.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Forecast grid unavailable.');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to fetch Pollution Shadow forecast.');
    } finally {
      setLoading(false);
    }
  }, [selectedCity, selectedLocation.lat, selectedLocation.lon]);

  useEffect(() => {
    setLoading(true);
    load(horizon);
  }, [load, horizon]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setHorizon((prev) => (prev + 3 > 69 ? 0 : prev + 3));
    }, 1500);
    return () => clearInterval(id);
  }, [playing]);

  if (loading && !data) return <LoadingSkeleton rows={2} />;
  if (error || !data) return <ErrorBanner message={error || 'Unavailable'} onRetry={() => load(horizon)} />;

  const circles: MapMarkerItem[] = data.cells.map((c, idx) => {
    const val = c[pollutant];
    const unit = pollutant === 'indian_aqi' ? 'NAQI' : 'µg/m³';
    return {
      id: `cell-${idx}`,
      lat: c.lat,
      lon: c.lon,
      radiusM: c.radius_m,
      fillOpacity: 0.26,
      color: c.color,
      badge: `MODEL FORECAST · +${data.horizon_hours}h (±${c.uncertainty_pct}%)`,
      title: c.label,
      value: `${pollutant.toUpperCase()}: ${val} ${unit}`,
      subtitle: `Indian NAQI ${c.indian_aqi} (${c.category}) · Regional cell (~${data.model.grid_spacing_km} km)`,
    };
  });

  const stationMarker: MapMarkerItem[] = [
    {
      id: 'ref-station',
      lat: data.nearest_reference.lat,
      lon: data.nearest_reference.lon,
      title: data.nearest_reference.name,
      subtitle: `Operator: ${data.nearest_reference.operator} · Solid pin marks reference monitoring location (distinct from dashed forecast cells).`,
      badge: 'OFFICIAL REFERENCE STATION LOCATION',
      value: 'REF',
      color: '#21D4E8',
      kind: 'official',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pollution Shadow — Regional Dispersion Forecast"
        subtitle="Explore 72-hour regional 3×3 atmospheric forecast cells alongside reference station locations, uncertainty bands, and data gap diagnostics."
        badge="ADVANCED"
        provenance="MODEL FORECAST"
      />

      <FeatureInteractiveStudio variant="pollution-shadow" />

      {/* Explicit Honesty & Resolution Banner */}
      <div className="rounded-xl border border-vayu-purple/35 bg-vayu-purple/10 p-4 text-xs text-slate-200 flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-300" />
        <p>
          <strong>Forecast vs Observation Distinction:</strong> Dashed translucent circles represent{' '}
          <span className="font-mono text-purple-200">MODEL FORECAST</span> regional grid cells (~{data.model.grid_spacing_km}–{data.model.spatial_resolution_km} km).{' '}
          {data.model.precision_disclaimer}
        </p>
      </div>

      {/* Controls Bar */}
      <div className="vayu-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold text-slate-300">Pollutant Layer:</span>
            {(
              [
                ['pm25', 'PM2.5'],
                ['pm10', 'PM10'],
                ['no2', 'NO2'],
                ['o3', 'O3'],
                ['indian_aqi', 'Indian NAQI'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPollutant(k)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                  pollutant === k
                    ? 'bg-vayu-electric text-white shadow-glow-electric'
                    : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:text-white'
                )}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-amber-200">
              Uncertainty: ±{data.uncertainty_pct}%
            </span>
            <span className="hidden text-slate-400 sm:inline">{data.confidence_tier}</span>
          </div>
        </div>

        {/* Interactive 72h Forecast Slider */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            className="vayu-btn-primary px-3.5 py-2 text-xs"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause' : 'Animate'}
          </button>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-white">
                <Clock className="h-3.5 w-3.5 text-vayu-cyan" />
                Forecast Horizon: +{data.horizon_hours}h ({formatIstTime(data.valid_time_ist)})
              </span>
              <span className="font-mono text-[11px] text-slate-400">0h → +71h</span>
            </div>
            <input
              type="range"
              min={0}
              max={71}
              step={1}
              value={horizon}
              onChange={(e) => {
                setPlaying(false);
                setHorizon(Number(e.target.value));
              }}
              aria-label="Forecast horizon slider in hours"
              className="w-full accent-vayu-cyan"
            />
          </div>
        </div>
      </div>

      {/* Map + Model & Legend Sidebar */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-5 lg:col-span-8">
          <DynamicVayuMap
            center={[data.center.lat, data.center.lon]}
            zoom={9}
            height={440}
            circles={circles}
            markers={stationMarker}
          />
          {/* Coverage Legend */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border-2 border-vayu-cyan bg-vayu-cyan/30" />
                Reference Station Pin
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full border border-dashed border-vayu-purple bg-vayu-purple/25" />
                Model Forecast Cell (~27 km)
              </span>
            </div>
            <ProvenanceBadge type="MODEL FORECAST" compact />
          </div>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <div className="vayu-card p-5 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 font-display text-base font-bold text-white">
              <ShieldCheck className="h-4 w-4 text-vayu-cyan" /> Model Metadata
            </div>
            <p className="text-slate-300"><strong>Provider:</strong> {data.model.name}</p>
            <p className="text-slate-300"><strong>Version:</strong> <span className="font-mono">{data.model.version}</span></p>
            <p className="text-slate-300"><strong>Native Resolution:</strong> ~{data.model.spatial_resolution_km} km regional grid</p>
            <p className="text-slate-300"><strong>Confidence Band:</strong> ±{data.uncertainty_pct}% ({data.confidence_tier})</p>
            <div className="pt-2 border-t border-white/10">
              <p className="flex items-center gap-1.5 font-semibold text-white">
                <MapPin className="h-3.5 w-3.5 text-vayu-teal" /> Nearest Observation Reference
              </p>
              <p className="mt-1 text-slate-400">{data.nearest_reference.name} ({data.nearest_reference.operator})</p>
            </div>
          </div>

          {/* Data Gap Finder (Advanced Feature) */}
          <div className="vayu-card p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 font-display text-base font-bold text-white">
              <Layers className="h-4 w-4 text-amber-300" /> Data Gap Finder
            </div>
            {data.data_gaps.map((g) => (
              <div key={g.sector} className="rounded-xl border border-white/10 bg-[#071224] p-3">
                <p className="flex items-center gap-1.5 font-semibold text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5" /> {g.sector}
                </p>
                <p className="mt-1 text-slate-300">{g.gap_type}</p>
                <p className="mt-1 text-[11px] text-slate-400">{g.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sector Grid Breakdown Table */}
      <div className="vayu-card p-6">
        <h2 className="font-display text-base font-bold text-white">9-Sector Regional Grid Readout (+{data.horizon_hours}h)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {data.cells.map((c) => (
            <div key={c.label} className="rounded-xl border border-white/10 bg-[#071224]/85 p-3.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{c.label}</span>
                <span className="font-display text-sm font-bold" style={{ color: c.color }}>NAQI {c.indian_aqi}</span>
              </div>
              <p className="mt-1.5 font-mono text-[11px] text-slate-400">
                PM2.5 {c.pm25} · PM10 {c.pm10} · NO2 {c.no2} · O3 {c.o3} µg/m³ (±{c.uncertainty_pct}%)
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
