'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Calendar, Lock, Megaphone, Radio, Send } from 'lucide-react';
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
import { cn, formatIstTime } from '@/lib/utils';

interface Zone {
  id: string;
  zone_name: string;
  zone_type: string;
  capacity: number;
  lat: number;
  lon: number;
  sensor_status: string;
  pm25: number | null;
  co2_ppm: number | null;
  temp_c: number | null;
  ventilation_state: string;
  is_demo: boolean;
}

export default function VayuCampusPage() {
  const { selectedCity, toast } = useApp();
  const [data, setData] = useState<{
    can_manage_campus: boolean;
    user_role: string;
    institution: { name: string; type: string; city: string; lat: number; lon: number; demo_notice: string };
    outdoor_live: { city: string; indian_aqi: number; category: string; pm25: number | null };
    zones: Zone[];
    outdoor_planner: { slot: string; hour: number; forecast_pm25: number; recommendation: string }[];
    nearby_incidents: { id: string; category: string; area_label: string; status: string; severity: string }[];
    advisories: { id: string; author_name: string; audience: string; title: string; message: string; action_type: string; created_at: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [advForm, setAdvForm] = useState({
    audience: 'Parents, Students & Faculty',
    action_type: 'schedule_adjustment',
    title: '',
    message: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/campus?city=${encodeURIComponent(selectedCity)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Could not load campus intelligence.');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading VAYU Campus');
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    load();
  }, [load]);

  const publishAdvisory = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/campus/advisories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(advForm),
    });
    const d = await res.json();
    if (!res.ok) {
      toast('error', 'Permission denied', d.detail || 'Not authorized.');
      return;
    }
    setAdvForm({ ...advForm, title: '', message: '' });
    toast('success', 'Campus advisory published', 'Logged to institutional action history.');
    load();
  };

  if (loading && !data) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBanner message={error || 'Unavailable'} onRetry={load} />;

  const mapMarkers: MapMarkerItem[] = data.zones.map((z) => ({
    id: z.id,
    lat: z.lat,
    lon: z.lon,
    title: z.zone_name,
    subtitle: `${z.ventilation_state} · Status: ${z.sensor_status} · CO2: ${z.co2_ppm ?? '—'} ppm`,
    badge: z.is_demo ? 'DEMO CAMPUS SENSOR' : 'CAMPUS NODE',
    value: z.pm25 != null ? String(Math.round(z.pm25)) : '—',
    color: z.sensor_status === 'unmonitored' ? '#64748B' : (z.pm25 ?? 0) <= 30 ? '#12BFA5' : '#F97316',
    kind: 'campus',
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAYU Campus — Institutional Air Guardian"
        subtitle={`${data.institution.name} · Classroom air quality, outdoor PE planner, sensor status, and parent/student communications.`}
        badge="ADVANCED"
        provenance="MEASURED"
      />

      <FeatureInteractiveStudio variant="campus" />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-950/20 p-3.5 text-xs text-amber-100">
        <div className="flex items-center gap-2">
          <TierBadge tier="DEMO" />
          <span>{data.institution.demo_notice}</span>
        </div>
        <span className="font-mono text-vayu-cyan">
          Live {data.outdoor_live.city} Outdoor: NAQI {data.outdoor_live.indian_aqi} ({data.outdoor_live.category})
        </span>
      </div>

      {/* Classroom & Zone Monitoring Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.zones.map((z) => (
          <div key={z.id} className="vayu-card-hover p-5 text-xs space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-white">{z.zone_name}</h2>
              <span
                className={cn(
                  'shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase',
                  z.sensor_status === 'online'
                    ? 'bg-vayu-teal/15 text-vayu-teal'
                    : z.sensor_status === 'needs_calibration'
                      ? 'bg-amber-500/15 text-amber-300'
                      : 'bg-slate-500/20 text-slate-300'
                )}
              >
                <Radio className="h-2.5 w-2.5" /> {z.sensor_status.replace('_', ' ')}
              </span>
            </div>
            {z.pm25 != null ? (
              <div className="flex items-baseline gap-4">
                <div>
                  <span className="font-display text-2xl font-bold text-white">{z.pm25}</span>
                  <span className="ml-1 text-slate-400">µg/m³ PM2.5</span>
                </div>
                <div className="text-slate-300">CO2: <strong>{z.co2_ppm}</strong> ppm</div>
              </div>
            ) : (
              <p className="py-2 text-slate-400 italic">Unmonitored hall — sensor installation queued.</p>
            )}
            <p className="text-[11px] text-slate-400">
              <Building2 className="mr-1 inline h-3 w-3 text-vayu-cyan" />
              Cap. {z.capacity} · {z.ventilation_state}
            </p>
          </div>
        ))}
      </section>

      {/* Campus Map + Outdoor Activity Planner */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-5 lg:col-span-6">
          <h2 className="mb-3 font-display text-base font-bold text-white">Interactive Campus Zone Map</h2>
          <DynamicVayuMap center={[data.institution.lat, data.institution.lon]} zoom={15} height={320} markers={mapMarkers} />
        </div>

        <div className="vayu-card p-6 lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
              <Calendar className="h-4 w-4 text-vayu-teal" /> Outdoor Activity &amp; Sports Planner ({data.outdoor_live.city})
            </h2>
            <ProvenanceBadge type="MODEL FORECAST" compact />
          </div>
          <div className="space-y-2.5">
            {data.outdoor_planner.map((s) => (
              <div key={s.slot} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#071224] p-3.5 text-xs">
                <div>
                  <p className="font-semibold text-white">{s.slot}</p>
                  <p className="font-mono text-[11px] text-slate-400">Forecast PM2.5: {s.forecast_pm25} µg/m³</p>
                </div>
                <span
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold',
                    s.forecast_pm25 <= 45
                      ? 'bg-vayu-teal/15 text-vayu-teal'
                      : s.forecast_pm25 <= 80
                        ? 'bg-amber-500/15 text-amber-200'
                        : 'bg-orange-500/20 text-orange-200'
                  )}
                >
                  {s.recommendation}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-3">
            <p className="text-xs font-semibold text-white">Surrounding Campus Incident Feed</p>
            <div className="mt-1.5 space-y-1 text-[11px] text-slate-400">
              {data.nearby_incidents.length === 0 ? (
                <p>No active incidents logged in {data.outdoor_live.city}.</p>
              ) : (
                data.nearby_incidents.slice(0, 3).map((inc) => (
                  <p key={inc.id}>
                    • [{inc.status}] {inc.category.replace('_', ' ')} near {inc.area_label}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Administrative Action History & Communications Composer */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-7 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Megaphone className="h-5 w-5 text-vayu-cyan" /> Parent/Student Communications &amp; Action History
          </h2>
          <div className="space-y-3">
            {data.advisories.map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 bg-[#071224] p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="font-mono text-vayu-cyan">{a.audience} · {a.action_type.replace('_', ' ')}</span>
                  <span>{formatIstTime(a.created_at)}</span>
                </div>
                <p className="mt-1 font-display text-sm font-bold text-white">{a.title}</p>
                <p className="mt-1 text-slate-300 leading-relaxed">{a.message}</p>
                <p className="mt-2 text-[10.5px] text-slate-500">Logged by {a.author_name}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="vayu-card p-6 lg:col-span-5">
          <h2 className="font-display text-lg font-bold text-white">Publish Campus Advisory</h2>
          {data.can_manage_campus ? (
            <form onSubmit={publishAdvisory} className="mt-3 space-y-3 text-xs">
              <select value={advForm.audience} onChange={(e) => setAdvForm({ ...advForm, audience: e.target.value })} className="vayu-select w-full text-xs">
                <option>Parents, Students &amp; Faculty</option>
                <option>Athletics &amp; PE Coaches</option>
                <option>Facilities &amp; Operations</option>
              </select>
              <input
                required
                minLength={4}
                value={advForm.title}
                onChange={(e) => setAdvForm({ ...advForm, title: e.target.value })}
                placeholder="Advisory headline..."
                className="vayu-input text-xs"
              />
              <textarea
                required
                minLength={10}
                rows={3}
                value={advForm.message}
                onChange={(e) => setAdvForm({ ...advForm, message: e.target.value })}
                placeholder="Clear, calm guidance on indoor classrooms, schedule timing, and ventilation..."
                className="vayu-input text-xs"
              />
              <button type="submit" className="vayu-btn-primary w-full text-xs">
                <Send className="h-3.5 w-3.5" /> Publish Official Notice
              </button>
            </form>
          ) : (
            <div className="mt-4 rounded-xl border border-white/10 bg-[#071224] p-4 text-xs text-slate-300 space-y-2">
              <p className="flex items-center gap-1.5 font-semibold text-white">
                <Lock className="h-4 w-4 text-vayu-cyan" /> Role-Protected Administrative Action
              </p>
              <p className="text-slate-400">
                Your current role is <strong>{data.user_role}</strong>. Publishing official campus-wide parent/student broadcasts requires the <strong>Campus Administrator</strong> or <strong>Moderator</strong> category (editable in My Profile for campus pilot testing).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
