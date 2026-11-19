'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileWarning, Info, ShieldCheck, Users } from 'lucide-react';
import DynamicVayuMap from '@/components/maps/VayuMap';
import {
  ErrorBanner,
  LoadingSkeleton,
  PageHeader,
  ProvenanceBadge,
  TierBadge,
} from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { MapMarkerItem } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function VayuCommunityPage() {
  const { selectedCity, toast } = useApp();
  const [data, setData] = useState<{
    tier_separation_notice: string;
    official_stations: { id: string; code: string; name: string; operator: string; city: string; lat: number; lon: number }[];
    community_sensors: {
      id: string;
      device_code: string;
      display_name: string;
      city: string;
      lat: number;
      lon: number;
      trust_score: number;
      validation_status: string;
      anomaly_flag: boolean;
      is_demo: boolean;
      pm25: number | null;
      pm10: number | null;
    }[];
    incidents: {
      id: string;
      category: string;
      severity: string;
      description: string;
      city: string;
      area_label: string;
      approx_lat: number;
      approx_lon: number;
      status: string;
      is_demo: boolean;
    }[];
    neighbourhood_tasks: { id: string; title: string; impact: string; co2_saved_g: number; completed: boolean }[];
  } | null>(null);
  const [layerFilter, setLayerFilter] = useState<'all' | 'official' | 'community' | 'incidents'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/community?city=${encodeURIComponent(selectedCity)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Could not load VAYU Community.');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Community data unavailable');
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    load();
  }, [load]);

  const completeTask = async (title: string, co2: number) => {
    const res = await fetch('/api/v1/community/tasks/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title, co2_saved_g: co2 }),
    });
    if (res.ok) {
      toast('success', 'Neighbourhood action logged!', 'Added to your community contribution ledger.');
      load();
    }
  };

  if (loading && !data) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBanner message={error || 'Unavailable'} onRetry={load} />;

  const markers: MapMarkerItem[] = [];
  if (layerFilter === 'all' || layerFilter === 'official') {
    data.official_stations.forEach((s) =>
      markers.push({
        id: s.id,
        lat: s.lat,
        lon: s.lon,
        title: s.name,
        subtitle: `Operator: ${s.operator} (${s.code})`,
        badge: 'OFFICIAL REFERENCE CAAQMS STATION',
        value: 'REF',
        color: '#21D4E8',
        kind: 'official',
      })
    );
  }
  if (layerFilter === 'all' || layerFilter === 'community') {
    data.community_sensors.forEach((c) =>
      markers.push({
        id: c.id,
        lat: c.lat,
        lon: c.lon,
        title: c.display_name,
        subtitle: `PM2.5: ${c.pm25 ?? '—'} µg/m³ · Trust Score: ${c.trust_score}/100 · Status: ${c.validation_status}`,
        badge: 'COMMUNITY LOW-COST SENSOR (DEMO)',
        value: c.pm25 != null ? String(Math.round(c.pm25)) : '—',
        color: c.anomaly_flag ? '#EF4444' : '#12BFA5',
        kind: 'community',
      })
    );
  }
  if (layerFilter === 'all' || layerFilter === 'incidents') {
    data.incidents.forEach((i) =>
      markers.push({
        id: i.id,
        lat: i.approx_lat,
        lon: i.approx_lon,
        title: `${i.category.replace('_', ' ').toUpperCase()} — ${i.area_label}`,
        subtitle: `Status: ${i.status} · ${i.description}`,
        badge: 'USER REPORTED INCIDENT (COARSE ~1 KM)',
        value: '!',
        color: '#F59E0B',
        kind: 'incident',
      })
    );
  }

  const focusStation = data.official_stations.find((s) => s.city === selectedCity) || data.official_stations[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAYU Community — Sensor Network & Local Action"
        subtitle="Explore registered community sensors separately from official monitoring stations, inspect data quality scores, and join neighbourhood clean-air tasks."
        badge="ADVANCED"
        provenance="MEASURED"
        actions={
          <Link href="/dashboard/incidents" className="vayu-btn-primary text-xs">
            <FileWarning className="h-3.5 w-3.5" /> Report Pollution Incident
          </Link>
        }
      />

      <FeatureInteractiveStudio variant="community" />

      <div className="flex items-start gap-2.5 rounded-xl border border-vayu-teal/30 bg-vayu-teal/10 p-4 text-xs text-slate-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-vayu-teal" />
        <span>{data.tier_separation_notice}</span>
      </div>

      {/* Interactive Community Map */}
      <div className="vayu-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-white">Multi-Tier Community Air Map</h2>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ['all', 'All Layers'],
                ['official', '● Official CAAQMS'],
                ['community', '◆ Community Sensors'],
                ['incidents', '▪ User Reports'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setLayerFilter(k)}
                className={cn(
                  'rounded-lg px-2.5 py-1 font-medium transition',
                  layerFilter === k ? 'bg-vayu-electric text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <DynamicVayuMap
          center={focusStation ? [focusStation.lat, focusStation.lon] : [30.901, 75.857]}
          zoom={11}
          height={370}
          markers={markers}
        />
      </div>

      {/* Sensor Trust & Anomaly Monitor */}
      <div className="vayu-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <ShieldCheck className="h-5 w-5 text-vayu-cyan" /> Community Sensor Trust &amp; Anomaly Monitor
          </h2>
          <TierBadge tier="DEMO" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 font-mono text-[10.5px] uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-3">Node ID</th>
                <th className="py-2 pr-3">Community Sensor (Non-Official Tier)</th>
                <th className="py-2 pr-3">City</th>
                <th className="py-2 pr-3">PM2.5</th>
                <th className="py-2 pr-3">Trust Score</th>
                <th className="py-2">Validation Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-slate-200">
              {data.community_sensors.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 pr-3 font-mono text-[11px] text-vayu-cyan">{s.device_code}</td>
                  <td className="py-3 pr-3 font-semibold text-white">{s.display_name}</td>
                  <td className="py-3 pr-3">{s.city}</td>
                  <td className="py-3 pr-3 font-mono">{s.pm25 ?? '—'} µg/m³</td>
                  <td className="py-3 pr-3 font-mono font-bold">{s.trust_score}/100</td>
                  <td className="py-3">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase',
                        s.anomaly_flag
                          ? 'bg-red-500/20 text-red-300'
                          : s.validation_status === 'calibrated'
                            ? 'bg-vayu-teal/15 text-vayu-teal'
                            : 'bg-amber-500/15 text-amber-300'
                      )}
                    >
                      {s.anomaly_flag && <AlertTriangle className="h-3 w-3" />}
                      {s.validation_status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Local Activity Feed + Neighbourhood Tasks */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">Local Incident Activity Feed</h2>
            <ProvenanceBadge type="USER REPORTED" compact />
          </div>
          {data.incidents.slice(0, 5).map((inc) => (
            <div key={inc.id} className="rounded-xl border border-white/10 bg-[#071224] p-3.5 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white capitalize">
                  {inc.category.replace('_', ' ')} · {inc.city}
                </span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] text-vayu-cyan">
                  {inc.status}
                </span>
              </div>
              <p className="text-slate-300">{inc.description}</p>
              <p className="text-[11px] text-slate-500">{inc.area_label}</p>
            </div>
          ))}
        </div>

        <div className="vayu-card p-6 lg:col-span-6 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Users className="h-5 w-5 text-vayu-teal" /> Neighbourhood Clean-Air Action Tasks
          </h2>
          {data.neighbourhood_tasks.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-[#071224] p-3.5 text-xs">
              <div>
                <p className={cn('font-semibold text-white', t.completed && 'line-through opacity-75')}>{t.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {t.impact} {t.co2_saved_g > 0 && `· ~${t.co2_saved_g} g CO2e avoided`}
                </p>
              </div>
              <button
                type="button"
                disabled={t.completed}
                onClick={() => completeTask(t.title, t.co2_saved_g)}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 font-semibold transition',
                  t.completed
                    ? 'bg-vayu-teal/20 text-vayu-teal'
                    : 'bg-vayu-electric text-white hover:brightness-110'
                )}
              >
                {t.completed ? (
                  <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Joined</span>
                ) : (
                  'Complete'
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
