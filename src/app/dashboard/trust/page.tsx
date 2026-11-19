'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Database, FileCheck2, ShieldCheck } from 'lucide-react';
import { ErrorBanner, LoadingSkeleton, PageHeader, ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { ProvenanceClass } from '@/lib/types';
import { formatIstTime } from '@/lib/utils';

export default function TrustSourcesPage() {
  const { selectedCity } = useApp();
  const [data, setData] = useState<{
    classifications: { code: ProvenanceClass; description: string }[];
    live_feed_audit: Record<string, unknown>;
    models: {
      code: string;
      provider: string;
      version: string;
      spatial_resolution_km: number;
      max_horizon_hours: number;
      uncertainty_profile: string;
      limitations: string;
    }[];
    sensor_validation_summary: Record<string, number>;
    ai_audit_trail: {
      id: string;
      module: string;
      trigger: string;
      summary: string;
      provenance: ProvenanceClass;
      model_used: string;
      created_at: string;
    }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/trust?city=${encodeURIComponent(selectedCity)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Could not load transparency ledger.');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load Trust & Sources');
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBanner message={error || 'Unavailable'} onRetry={load} />;

  const feed = data.live_feed_audit;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trust, Sources & Explainable AI Audit Trail"
        subtitle="Inspect every upstream data provider, freshness timestamp, sensor validation status, forecast model version, uncertainty band, and recommendation log."
        badge="MVP"
        provenance="MEASURED"
      />

      {/* 5 Canonical Data Classifications */}
      <section className="vayu-card p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <ShieldCheck className="h-5 w-5 text-vayu-teal" /> Canonical VAYUVERSE Data Classifications
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {data.classifications.map((c) => (
            <div key={c.code} className="rounded-xl border border-white/10 bg-[#071224] p-4 text-xs space-y-2">
              <ProvenanceBadge type={c.code} />
              <p className="leading-relaxed text-slate-300">{c.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Ingestion Audit + Community Sensor Validation */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-8 space-y-2.5 text-xs">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Database className="h-5 w-5 text-vayu-cyan" /> Active Environmental Data Feed ({String(feed.city)})
          </h2>
          <div className="grid gap-2.5 sm:grid-cols-2 text-slate-300 pt-1">
            <p><strong>Air Quality Source:</strong> {String(feed.air_quality_source)}</p>
            <p><strong>Weather Source:</strong> {String(feed.weather_source)}</p>
            <p><strong>Measurement Timestamp:</strong> {formatIstTime(String(feed.observed_time_ist))}</p>
            <p><strong>Data Freshness:</strong> <span className="text-vayu-teal">{String(feed.freshness_status)}</span></p>
            <p><strong>Pollutants Retrieved:</strong> {(feed.pollutants_retrieved as string[]).join(', ')}</p>
            <p><strong>Spatial Resolution:</strong> {String(feed.spatial_resolution)}</p>
            <p><strong>License &amp; Attribution:</strong> {String(feed.license)}</p>
            <p><strong>Direct CPCB Connector:</strong> {String(feed.cpcb_direct_status)}</p>
          </div>
        </div>

        <div className="vayu-card p-6 lg:col-span-4 space-y-3 text-xs">
          <h2 className="font-display text-lg font-bold text-white">Sensor Validation Summary</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#071224] p-3">
              <span className="text-slate-400">Calibrated</span>
              <p className="font-display text-2xl font-bold text-vayu-teal">{data.sensor_validation_summary.calibrated}</p>
            </div>
            <div className="rounded-xl bg-[#071224] p-3">
              <span className="text-slate-400">Needs Check</span>
              <p className="font-display text-2xl font-bold text-amber-300">{data.sensor_validation_summary.needs_calibration}</p>
            </div>
            <div className="rounded-xl bg-[#071224] p-3">
              <span className="text-slate-400">Anomaly Flagged</span>
              <p className="font-display text-2xl font-bold text-red-400">{data.sensor_validation_summary.anomaly_flagged}</p>
            </div>
            <div className="rounded-xl bg-[#071224] p-3">
              <span className="text-slate-400">Total Nodes</span>
              <p className="font-display text-2xl font-bold text-white">{data.sensor_validation_summary.total_community_nodes}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Registered Models & Uncertainty */}
      <section className="vayu-card p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <Cpu className="h-5 w-5 text-vayu-purple" /> Registered Forecast &amp; Calculation Models
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {data.models.map((m) => (
            <div key={m.code} className="rounded-2xl border border-white/10 bg-[#071224] p-4 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-vayu-cyan">{m.code}</span>
                <span className="font-mono text-[10.5px] text-slate-400">{m.version} · Horizon {m.max_horizon_hours}h</span>
              </div>
              <p className="font-semibold text-white">{m.provider}</p>
              <p className="text-slate-300"><strong>Uncertainty:</strong> {m.uncertainty_profile}</p>
              <p className="text-slate-400"><strong>Disclosed Limitations:</strong> {m.limitations}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Explainable AI Audit Trail */}
      <section className="vayu-card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <FileCheck2 className="h-5 w-5 text-vayu-cyan" /> Your Personal Explainable AI &amp; Recommendation Audit Trail
        </h2>
        {data.ai_audit_trail.length === 0 ? (
          <p className="text-xs text-slate-400">
            Run a query in AI Assistant, approve a Daily Replanner shift, or save a Future Me scenario to populate your live explanation ledger.
          </p>
        ) : (
          <div className="space-y-2.5">
            {data.ai_audit_trail.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-[#071224] p-4 text-xs space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">{r.module} — “{r.trigger}”</span>
                  <ProvenanceBadge type={r.provenance} compact />
                </div>
                <p className="text-slate-300 line-clamp-2">{r.summary}</p>
                <p className="font-mono text-[10.5px] text-slate-500">
                  Engine: {r.model_used} · {formatIstTime(r.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
