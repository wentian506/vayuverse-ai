'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Compass, Download, FileSpreadsheet, FileText, Leaf, Sparkles } from 'lucide-react';
import {
  ErrorBanner,
  LoadingSkeleton,
  PageHeader,
  ProvenanceBadge,
  TierBadge,
} from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { downloadTextFile, formatIstTime, formatShortHour } from '@/lib/utils';

const FUTURE_ROADMAP_ITEMS = [
  { title: 'Civic Case Tracker', desc: 'Formal SLA-tracked escalation connector between moderated community clusters and municipal pollution boards.' },
  { title: 'Clean-Air Place Directory', desc: 'Community-verified directory of HEPA-filtered libraries, transit lounges, and green low-traffic parks.' },
  { title: 'Clean-Air Digital Passport', desc: 'Portable, user-controlled environmental habit & verified low-emission mobility record.' },
  { title: 'Community Clean-Air Challenge', desc: 'Seasonal ward-level car-free and zero-burning collective impact leaderboards.' },
  { title: 'Pollution What-If Command Centre', desc: 'City-scale policy intervention sandbox modelling transit electrification and dust-control impacts.' },
  { title: 'Research & Open Export Workspace', desc: 'Anonymised, consent-gated PostGIS/TimescaleDB bulk datasets for academic atmospheric labs.' },
];

export default function ReportsAnalyticsPage() {
  const { toast } = useApp();
  const [data, setData] = useState<{
    generated_at_utc: string;
    city: string;
    provenance: Record<string, string>;
    air_history_48h: { time: string; indian_aqi: number; pm25: number | null; pm10: number | null }[];
    kpis: {
      last_24h_avg_aqi: number;
      prev_24h_avg_aqi: number;
      scenarios_saved: number;
      actions_completed: number;
      avg_exposure_reduction_pct: number;
      total_co2_avoided_g: number;
      citizen_reports_filed: number;
    };
    scenarios: { id: string; type: string; title: string; city: string; exposure_delta_pct: number; created_at: string }[];
    actions: { id: string; category: string; title: string; exposure_saved_pct: number; co2_saved_g: number; completed_at: string }[];
    my_incidents: { id: string; category: string; area_label: string; status: string; created_at: string }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/reports/summary', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Could not load analytics.');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to fetch reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = () => {
    if (!data) return;
    const header = 'timestamp_ist,indian_aqi_estimated,pm25_ug_m3,pm10_ug_m3,provenance,source\n';
    const rows = data.air_history_48h
      .map(
        (r) =>
          `${r.time},${r.indian_aqi},${r.pm25 ?? ''},${r.pm10 ?? ''},MODEL FORECAST,"${data.provenance.air_quality_source}"`
      )
      .join('\n');
    downloadTextFile(`vayuverse-air-history-${data.city.toLowerCase()}.csv`, header + rows, 'text/csv');
    toast('success', 'CSV report downloaded', 'Includes full provenance column.');
  };

  const exportEvidencePack = () => {
    if (!data) return;
    downloadTextFile(
      `vayuverse-evidence-pack-${data.city.toLowerCase()}.json`,
      JSON.stringify(data, null, 2),
      'application/json'
    );
    toast('success', 'AI Evidence Pack downloaded (JSON)', 'Contains provenance, history, actions & scenarios.');
  };

  if (loading && !data) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBanner message={error || 'Unavailable'} onRetry={load} />;

  const k = data.kpis;
  const chart = data.air_history_48h.map((h) => ({
    label: formatShortHour(h.time),
    aqi: h.indian_aqi,
    pm25: h.pm25,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports, Analytics & Impact Ledger"
        subtitle="Review your 48-hour air-quality history, saved exposure scenarios, completed protective actions, community contributions, and provenance-stamped exports."
        badge="ADVANCED"
        provenance="ESTIMATED"
        actions={
          <>
            <button type="button" onClick={exportCsv} className="vayu-btn-secondary text-xs">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Download CSV
            </button>
            <button type="button" onClick={exportEvidencePack} className="vayu-btn-primary text-xs">
              <Download className="h-3.5 w-3.5" /> Export Evidence Pack
            </button>
          </>
        }
      />

      {/* KPI Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="vayu-card p-4">
          <span className="text-xs text-slate-400">24h Mean NAQI ({data.city})</span>
          <p className="mt-1 font-display text-2xl font-bold text-white">{k.last_24h_avg_aqi}</p>
          <span className="text-[11px] text-slate-400">Prior 24h: {k.prev_24h_avg_aqi}</span>
        </div>
        <div className="vayu-card p-4">
          <span className="text-xs text-slate-400">Actions Logged</span>
          <p className="mt-1 font-display text-2xl font-bold text-vayu-teal">{k.actions_completed}</p>
          <span className="text-[11px] text-slate-400">Avg ~{k.avg_exposure_reduction_pct}% est. reduction</span>
        </div>
        <div className="vayu-card p-4">
          <span className="flex items-center gap-1 text-xs text-slate-400"><Leaf className="h-3.5 w-3.5 text-vayu-teal" /> Est. CO2e Avoided</span>
          <p className="mt-1 font-display text-2xl font-bold text-white">{k.total_co2_avoided_g} g</p>
          <span className="text-[11px] text-slate-400">Low-emission choices</span>
        </div>
        <div className="vayu-card p-4">
          <span className="text-xs text-slate-400">Saved Scenarios</span>
          <p className="mt-1 font-display text-2xl font-bold text-vayu-cyan">{k.scenarios_saved}</p>
          <span className="text-[11px] text-slate-400">Future Me &amp; Routes</span>
        </div>
        <div className="vayu-card p-4">
          <span className="text-xs text-slate-400">Citizen Reports</span>
          <p className="mt-1 font-display text-2xl font-bold text-vayu-purple">{k.citizen_reports_filed}</p>
          <span className="text-[11px] text-slate-400">Your contributions</span>
        </div>
      </div>

      {/* 48h Chart */}
      <div className="vayu-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-white">48-Hour Air-Quality &amp; PM2.5 History ({data.city})</h2>
            <p className="text-xs text-slate-400">Provenance: {data.provenance.air_quality_source}</p>
          </div>
          <ProvenanceBadge type="MODEL FORECAST" compact />
        </div>
        <div className="mt-4 h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} minTickGap={26} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: '#0A192F', border: '1px solid rgba(33,212,232,0.35)', borderRadius: '10px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="aqi" name="Indian NAQI" stroke="#3478F6" strokeWidth={2.4} dot={false} />
              <Line type="monotone" dataKey="pm25" name="PM2.5 (µg/m³)" stroke="#21D4E8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Action-to-Impact Ledger & Scenario History */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="vayu-card p-6 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Sparkles className="h-5 w-5 text-vayu-teal" /> Action-to-Impact Ledger
          </h2>
          {data.actions.length === 0 ? (
            <p className="text-xs text-slate-400">Complete actions on your Overview, Daily Replanner, or Community page to build your ledger.</p>
          ) : (
            data.actions.slice(0, 6).map((a) => (
              <div key={a.id} className="rounded-xl border border-white/10 bg-[#071224] p-3.5 text-xs">
                <p className="font-semibold text-white">{a.title}</p>
                <p className="mt-1 font-mono text-[11px] text-vayu-teal">
                  ~{a.exposure_saved_pct}% est. exposure saved {a.co2_saved_g > 0 ? `· ${a.co2_saved_g} g CO2e avoided` : ''} · {formatIstTime(a.completed_at)}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="vayu-card p-6 space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Compass className="h-5 w-5 text-vayu-cyan" /> Saved Scenario &amp; Route Comparisons
          </h2>
          {data.scenarios.length === 0 ? (
            <p className="text-xs text-slate-400">Click “Save Scenario” in Future Me or Route Comparison to track trade-offs here.</p>
          ) : (
            data.scenarios.slice(0, 6).map((s) => (
              <div key={s.id} className="rounded-xl border border-white/10 bg-[#071224] p-3.5 text-xs">
                <p className="font-semibold text-white">{s.title}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  {s.type.replace('_', ' ')} · Exposure Δ {s.exposure_delta_pct}% · {formatIstTime(s.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Future Product Architecture & Transparent Coming Soon Section */}
      <section className="vayu-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
              <FileText className="h-5 w-5 text-vayu-purple" /> VAYUVERSE Future Horizon Modules
            </h2>
            <p className="text-xs text-slate-400">
              Database schema and API extensibility are prepared; external civic &amp; partner integrations are transparently marked Coming Soon.
            </p>
          </div>
          <TierBadge tier="FUTURE" />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {FUTURE_ROADMAP_ITEMS.map((item) => (
            <div key={item.title} className="rounded-xl border border-vayu-purple/25 bg-vayu-purple/[0.06] p-4 text-xs">
              <p className="font-display text-sm font-bold text-white">{item.title}</p>
              <p className="mt-1 leading-relaxed text-slate-300">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
