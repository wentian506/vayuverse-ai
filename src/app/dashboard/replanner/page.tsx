'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarClock, Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { ErrorBanner, LoadingSkeleton, PageHeader, ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { cn, formatShortHour } from '@/lib/utils';

interface Block {
  id: string;
  time: string;
  title: string;
  duration_min: number;
  setting: string;
  transport: string;
  flexible: boolean;
  approved_shift?: boolean;
}

interface Suggestion {
  block_id: string;
  title: string;
  current_time: string;
  current_pm25: number;
  suggested_time: string;
  suggested_pm25: number;
  suggested_action: 'reschedule' | 'shift_indoor' | 'keep';
  suggested_setting: string;
  suggested_transport: string;
  transport_tip: string;
  estimated_reduction_pct: number;
  rationale: string;
  requires_approval: boolean;
}

export default function DailyReplannerPage() {
  const { selectedCity, toast } = useApp();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [curve, setCurve] = useState<{ label: string; pm25: number | null; aqi: number }[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newBlock, setNewBlock] = useState({
    title: '',
    time: '07:30',
    duration_min: 40,
    setting: 'outdoor',
    transport: 'walking',
    flexible: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/replanner?city=${encodeURIComponent(selectedCity)}`, {
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Could not load Daily Replanner.');
      setBlocks(json.blocks || []);
      setSuggestions(json.suggestions || []);
      setCurve(
        (json.hourly_curve || []).map((pt: { time: string; pm25: number | null; indian_aqi: number }) => ({
          label: formatShortHour(pt.time),
          pm25: pt.pm25,
          aqi: pt.indian_aqi,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load replanner');
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlock.title.trim()) return;
    const res = await fetch('/api/v1/replanner/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(newBlock),
    });
    if (res.ok) {
      setNewBlock({ ...newBlock, title: '' });
      toast('success', 'Activity added to schedule');
      load();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/v1/replanner/blocks/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      toast('info', 'Schedule item removed');
      load();
    }
  };

  const handleApprove = async (s: Suggestion) => {
    const res = await fetch('/api/v1/replanner/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        block_id: s.block_id,
        new_time: s.suggested_time,
        new_setting: s.suggested_setting,
        new_transport: s.suggested_transport,
        estimated_reduction_pct: s.estimated_reduction_pct,
      }),
    });
    if (res.ok) {
      toast('success', 'Schedule shift approved & applied', `${s.title} updated to ${s.suggested_time}.`);
      load();
    }
  };

  if (loading && blocks.length === 0) return <LoadingSkeleton rows={2} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Daily Replanner"
        subtitle={`Overlay your daily routine against ${selectedCity}’s 24-hour forecast PM2.5 curve. Suggested shifts never alter your schedule until you explicitly approve them.`}
        badge="MVP"
        provenance="ESTIMATED"
      />

      <FeatureInteractiveStudio variant="replanner" />

      {/* 24h Forecast PM2.5 Window Curve */}
      <div className="vayu-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-white">Upcoming 24-Hour Outdoor PM2.5 Curve ({selectedCity})</h2>
            <p className="text-xs text-slate-400">Dips indicate favourable slots for flexible outdoor workouts, errands, and cross-ventilation.</p>
          </div>
          <ProvenanceBadge type="MODEL FORECAST" compact />
        </div>
        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="rpFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#12BFA5" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#12BFA5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} minTickGap={24} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: '#0A192F', border: '1px solid rgba(18,191,165,0.4)', borderRadius: '10px', fontSize: '12px' }} />
              <Area type="monotone" dataKey="pm25" name="Forecast PM2.5 (µg/m³)" stroke="#12BFA5" strokeWidth={2.3} fill="url(#rpFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Schedule + Approval Recommendations */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: User Schedule + Add Form */}
        <div className="vayu-card p-6 lg:col-span-5 space-y-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <CalendarClock className="h-5 w-5 text-vayu-cyan" /> Your Daily Schedule
          </h2>
          <div className="space-y-2.5">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#071224] p-3.5 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-vayu-electric/20 px-2 py-0.5 font-mono font-bold text-vayu-cyan">{b.time}</span>
                    <span className="font-semibold text-white">{b.title}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {b.duration_min} min · {b.setting} · {b.transport.replace('_', ' ')} · {b.flexible ? 'Flexible' : 'Fixed time'}
                    {b.approved_shift && <span className="ml-2 text-vayu-teal font-semibold">✓ Replanned</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id)}
                  aria-label={`Delete ${b.title}`}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/15 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddBlock} className="border-t border-white/10 pt-4 space-y-3">
            <p className="text-xs font-semibold text-white">Add Routine Block</p>
            <input
              required
              value={newBlock.title}
              onChange={(e) => setNewBlock({ ...newBlock, title: e.target.value })}
              placeholder="e.g., Evening Park Run or Market Trip"
              className="vayu-input text-xs"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="time"
                value={newBlock.time}
                onChange={(e) => setNewBlock({ ...newBlock, time: e.target.value })}
                className="vayu-input text-xs"
              />
              <select
                value={newBlock.setting}
                onChange={(e) => setNewBlock({ ...newBlock, setting: e.target.value })}
                className="vayu-select text-xs"
              >
                <option value="outdoor">Outdoor</option>
                <option value="indoor">Indoor</option>
              </select>
              <select
                value={newBlock.transport}
                onChange={(e) => setNewBlock({ ...newBlock, transport: e.target.value })}
                className="vayu-select text-xs"
              >
                <option value="walking">Walking</option>
                <option value="cycling">Cycling</option>
                <option value="two_wheeler">Two-Wheeler</option>
                <option value="ac_car">AC Car</option>
                <option value="metro_ev">Metro / EV</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newBlock.flexible}
                onChange={(e) => setNewBlock({ ...newBlock, flexible: e.target.checked })}
              />
              Time is flexible (allow cleaner-window proposals)
            </label>
            <button type="submit" className="vayu-btn-primary w-full text-xs">
              <Plus className="h-3.5 w-3.5" /> Add to Schedule
            </button>
          </form>
        </div>

        {/* Right: Suggested Alternatives Awaiting User Approval */}
        <div className="vayu-card p-6 lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
              <Sparkles className="h-5 w-5 text-vayu-teal" /> Proposed Optimisations (Approval Required)
            </h2>
          </div>

          <div className="space-y-3">
            {suggestions
              .filter((s) => !dismissed[s.block_id])
              .map((s) => (
                <div
                  key={s.block_id}
                  className={cn(
                    'rounded-2xl border p-4 text-xs space-y-2.5',
                    s.requires_approval
                      ? 'border-vayu-cyan/35 bg-vayu-deep/55'
                      : 'border-white/10 bg-[#071224]/75'
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-white">{s.title}</span>
                    {s.requires_approval ? (
                      <span className="rounded-full bg-vayu-teal/20 px-2.5 py-0.5 font-mono text-[10px] font-bold text-vayu-teal">
                        ~{s.estimated_reduction_pct}% LOWER PM2.5
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-slate-300">
                        WELL TIMED
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200 leading-relaxed">{s.rationale}</p>
                  <p className="text-[11px] text-slate-400">
                    <strong>Transport note:</strong> {s.transport_tip}
                  </p>
                  {s.requires_approval && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                      <span className="font-mono text-[11px] text-vayu-cyan">
                        Proposal: {s.current_time} ({s.current_pm25} µg/m³) → {s.suggested_time} ({s.suggested_pm25} µg/m³ · {s.suggested_setting})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDismissed((d) => ({ ...d, [s.block_id]: true }))}
                          className="vayu-btn-secondary px-3 py-1.5 text-xs"
                        >
                          <X className="h-3.5 w-3.5" /> Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(s)}
                          className="vayu-btn-primary px-3.5 py-1.5 text-xs"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve &amp; Apply
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
