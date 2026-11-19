'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Fan,
  Home,
  Info,
  Plus,
  RotateCcw,
  Thermometer,
  Wind,
} from 'lucide-react';
import {
  ErrorBanner,
  LoadingSkeleton,
  PageHeader,
  ProvenanceBadge,
  TierBadge,
} from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { cn, formatIstTime, formatShortHour } from '@/lib/utils';

interface RoomCard {
  id: string;
  device_code: string;
  display_name: string;
  room_type: string;
  filter_device_name: string | null;
  filter_life_pct: number | null;
  is_demo_starter: boolean;
  status_label: string;
  latest_reading: {
    pm25: number | null;
    co2_ppm: number | null;
    temp_c: number | null;
    humidity_pct: number | null;
    provenance: 'MEASURED' | 'USER REPORTED';
    notes: string;
    recorded_at: string;
  } | null;
}

export default function VayuHomePage() {
  const { selectedCity, toast } = useApp();
  const [rooms, setRooms] = useState<RoomCard[]>([]);
  const [checklist, setChecklist] = useState<{ id: string; label: string; done: boolean }[]>([]);
  const [survey, setSurvey] = useState({
    cooking_fuel: 'lpg_with_exhaust',
    incense_frequency: 'rarely',
    road_proximity: 'within_200m',
    dampness: 'none',
    purifier_count: 1,
  });
  const [findings, setFindings] = useState<string[]>([]);
  const [ventAdvisor, setVentAdvisor] = useState<{
    guidance: string;
    disclaimer: string;
    best_3_hours: { time: string; outdoor_pm25: number; outdoor_aqi: number }[];
  } | null>(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Forms
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [readingForm, setReadingForm] = useState({ pm25: '22', co2_ppm: '610', temp_c: '23', humidity_pct: '48', notes: '' });
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDevice, setNewRoomDevice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/home?city=${encodeURIComponent(selectedCity)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load VAYU Home.');
      setRooms(data.rooms || []);
      setChecklist(data.ventilation_checklist || []);
      if (data.survey?.cooking_fuel) setSurvey(data.survey);
      setFindings(data.survey_findings || []);
      setVentAdvisor(data.ventilation_advisor || null);
      setDisclaimer(data.core_disclaimer || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading VAYU Home');
    } finally {
      setLoading(false);
    }
  }, [selectedCity]);

  useEffect(() => {
    load();
  }, [load]);

  const submitManualReading = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoomId) return;
    const res = await fetch(`/api/v1/home/rooms/${activeRoomId}/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        pm25: Number(readingForm.pm25),
        co2_ppm: readingForm.co2_ppm ? Number(readingForm.co2_ppm) : null,
        temp_c: readingForm.temp_c ? Number(readingForm.temp_c) : null,
        humidity_pct: readingForm.humidity_pct ? Number(readingForm.humidity_pct) : null,
        entry_method: 'manual',
        notes: readingForm.notes,
      }),
    });
    if (res.ok) {
      toast('success', 'Indoor reading logged', 'Tagged transparently as USER REPORTED.');
      setActiveRoomId(null);
      load();
    }
  };

  const addRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const res = await fetch('/api/v1/home/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        display_name: newRoomName,
        room_type: 'custom',
        filter_device_name: newRoomDevice || null,
        filter_life_pct: newRoomDevice ? 100 : null,
      }),
    });
    if (res.ok) {
      setNewRoomName('');
      setNewRoomDevice('');
      toast('success', 'Room added to VAYU Home');
      load();
    }
  };

  const toggleItem = async (id: string) => {
    const res = await fetch(`/api/v1/home/checklist/${id}/toggle`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const d = await res.json();
      setChecklist(d.ventilation_checklist);
    }
  };

  const saveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/home/survey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(survey),
    });
    if (res.ok) {
      const d = await res.json();
      setFindings(d.survey_findings);
      toast('success', 'Indoor-air diagnosis updated');
    }
  };

  const resetFilter = async (roomId: string) => {
    const res = await fetch(`/api/v1/home/rooms/${roomId}/reset-filter`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      toast('success', 'Filter life reset to 100%', 'Recorded in your Action-to-Impact Ledger.');
      load();
    }
  };

  if (loading && rooms.length === 0) return <LoadingSkeleton rows={2} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAYU Home — Indoor Air Intelligence"
        subtitle="Room-by-room indoor tracking, manual reading logs, ventilation timing, indoor source diagnostics, and filter care."
        badge="ADVANCED"
        provenance="USER REPORTED"
      />

      <FeatureInteractiveStudio variant="home" />

      <div className="flex items-start gap-2.5 rounded-xl border border-vayu-cyan/30 bg-vayu-cyan/10 p-4 text-xs text-slate-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-vayu-cyan" />
        <span>{disclaimer}</span>
      </div>

      {/* Room-by-Room Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rooms.map((r) => {
          const lr = r.latest_reading;
          return (
            <div key={r.id} className="vayu-card-hover flex flex-col justify-between p-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-white">
                    <Home className="h-4 w-4 text-vayu-cyan" /> {r.display_name}
                  </h2>
                  {r.is_demo_starter && <TierBadge tier="DEMO" />}
                </div>
                <p className="mt-1 text-xs font-semibold text-vayu-teal">{r.status_label}</p>

                {lr ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-display text-3xl font-bold text-white">{lr.pm25}</span>
                      <span className="text-xs text-slate-400">µg/m³ PM2.5</span>
                    </div>
                    <p className="font-mono text-[11px] text-slate-400">
                      CO2: {lr.co2_ppm ?? '—'} ppm · <Thermometer className="inline h-3 w-3" /> {lr.temp_c ?? '—'}°C · {lr.humidity_pct ?? '—'}%
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <ProvenanceBadge type={lr.provenance} compact />
                      <span className="text-[10px] text-slate-500">{formatIstTime(lr.recorded_at).split(',')[0]}</span>
                    </div>
                  </div>
                ) : (
                  <div className="my-5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3 text-center text-xs text-slate-400">
                    No indoor sensor connected. Never estimated from outdoor AQI.
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setActiveRoomId(activeRoomId === r.id ? null : r.id)}
                className="vayu-btn-secondary mt-4 w-full py-1.5 text-xs"
              >
                + Log Manual Reading
              </button>
            </div>
          );
        })}
      </section>

      {/* Inline Manual Reading Form */}
      {activeRoomId && (
        <form onSubmit={submitManualReading} className="vayu-card border-vayu-cyan/40 p-5 space-y-4">
          <h3 className="font-display text-base font-bold text-white">
            Enter Indoor Monitor Reading — {rooms.find((x) => x.id === activeRoomId)?.display_name}
          </h3>
          <div className="grid gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">PM2.5 (µg/m³) *</label>
              <input type="number" step="0.1" min={0} required value={readingForm.pm25} onChange={(e) => setReadingForm({ ...readingForm, pm25: e.target.value })} className="vayu-input text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">CO2 (ppm)</label>
              <input type="number" min={350} value={readingForm.co2_ppm} onChange={(e) => setReadingForm({ ...readingForm, co2_ppm: e.target.value })} className="vayu-input text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">Temp (°C)</label>
              <input type="number" step="0.1" value={readingForm.temp_c} onChange={(e) => setReadingForm({ ...readingForm, temp_c: e.target.value })} className="vayu-input text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">Humidity (%)</label>
              <input type="number" value={readingForm.humidity_pct} onChange={(e) => setReadingForm({ ...readingForm, humidity_pct: e.target.value })} className="vayu-input text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">Context Note</label>
              <input value={readingForm.notes} onChange={(e) => setReadingForm({ ...readingForm, notes: e.target.value })} placeholder="After HEPA 30m" className="vayu-input text-xs" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setActiveRoomId(null)} className="vayu-btn-secondary text-xs">Cancel</button>
            <button type="submit" className="vayu-btn-primary text-xs">Save Room Reading</button>
          </div>
        </form>
      )}

      {/* Ventilation Advisor + Checklist */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
              <Wind className="h-5 w-5 text-vayu-teal" /> Ventilation Window Advisor &amp; Checklist
            </h2>
          </div>
          {ventAdvisor && (
            <div className="rounded-xl border border-vayu-teal/30 bg-vayu-teal/10 p-4 text-xs">
              <p className="font-semibold text-white">{ventAdvisor.guidance}</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {ventAdvisor.best_3_hours.map((w) => (
                  <span key={w.time} className="rounded-lg bg-[#071224] px-2.5 py-1 font-mono text-[11px] text-vayu-teal">
                    {formatShortHour(w.time)} IST · {w.outdoor_pm25} µg/m³
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {checklist.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => toggleItem(it.id)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left text-xs transition',
                  it.done ? 'border-vayu-teal/35 bg-vayu-teal/10 text-slate-300' : 'border-white/10 bg-[#071224] text-slate-200'
                )}
              >
                <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', it.done ? 'text-vayu-teal' : 'text-slate-500')} />
                <span className={cn(it.done && 'line-through opacity-80')}>{it.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Indoor Source Investigation Questionnaire */}
        <div className="vayu-card p-6 lg:col-span-6 space-y-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <ClipboardList className="h-5 w-5 text-vayu-cyan" /> Indoor-Air Investigation Questionnaire
          </h2>
          <form onSubmit={saveSurvey} className="grid gap-3 sm:grid-cols-2 text-xs">
            <div>
              <label className="mb-1 block text-slate-400">Cooking &amp; Exhaust Setup</label>
              <select value={survey.cooking_fuel} onChange={(e) => setSurvey({ ...survey, cooking_fuel: e.target.value })} className="vayu-select w-full text-xs">
                <option value="induction">Electric / Induction</option>
                <option value="lpg_with_exhaust">LPG / PNG with Chimney/Exhaust</option>
                <option value="lpg_no_exhaust">LPG / PNG without Exhaust Fan</option>
                <option value="biomass">Solid Fuel / Biomass</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Indoor Incense / Coils / Candles</label>
              <select value={survey.incense_frequency} onChange={(e) => setSurvey({ ...survey, incense_frequency: e.target.value })} className="vayu-select w-full text-xs">
                <option value="never">Never</option>
                <option value="rarely">Occasionally</option>
                <option value="weekly">Several times a week</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Distance to Busy Arterial Road</label>
              <select value={survey.road_proximity} onChange={(e) => setSurvey({ ...survey, road_proximity: e.target.value })} className="vayu-select w-full text-xs">
                <option value="quiet_residential">Quiet Residential (&gt; 300 m)</option>
                <option value="within_200m">Within 50–300 m</option>
                <option value="adjacent_main_road">Directly Facing Main Road (&lt; 50 m)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Wall Dampness / Humidity</label>
              <select value={survey.dampness} onChange={(e) => setSurvey({ ...survey, dampness: e.target.value })} className="vayu-select w-full text-xs">
                <option value="none">Dry / Well Maintained</option>
                <option value="occasional_damp">Monsoon Damp Patches</option>
                <option value="visible_mould">Persistent Dampness / Mould</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="vayu-btn-primary text-xs">Update Source Diagnosis</button>
            </div>
          </form>

          <div className="space-y-2 border-t border-white/10 pt-3">
            <p className="text-xs font-semibold text-white">Tailored Indoor Guidance:</p>
            {findings.map((f) => (
              <p key={f} className="rounded-lg bg-[#071224] p-2.5 text-xs text-slate-300">• {f}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Filter & Device Care + Add Room */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-7 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
              <Fan className="h-5 w-5 text-vayu-purple" /> Filter &amp; Device Care
            </h2>
            <span className="font-mono text-[10px] text-purple-300">Manual Tracker Active · Smart IoT Auto-Sync Coming Soon</span>
          </div>
          <div className="space-y-2.5">
            {rooms.filter((r) => r.filter_device_name).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#071224] p-3.5 text-xs">
                <div className="flex-1">
                  <p className="font-semibold text-white">{r.filter_device_name} <span className="text-slate-400">({r.display_name})</span></p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn('h-full rounded-full', (r.filter_life_pct ?? 0) > 40 ? 'bg-vayu-teal' : 'bg-orange-400')}
                      style={{ width: `${r.filter_life_pct ?? 0}%` }}
                    />
                  </div>
                </div>
                <span className="font-mono font-bold text-white">{r.filter_life_pct}%</span>
                <button type="button" onClick={() => resetFilter(r.id)} className="vayu-btn-secondary px-2.5 py-1.5 text-[11px]">
                  <RotateCcw className="h-3 w-3" /> Mark Cleaned
                </button>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={addRoom} className="vayu-card p-6 lg:col-span-5 space-y-3">
          <h2 className="font-display text-lg font-bold text-white">Add Another Room</h2>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Room Name *</label>
            <input required value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="e.g., Kids' Room or Parents' Bedroom" className="vayu-input text-xs" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Purifier / Exhaust Device (Optional)</label>
            <input value={newRoomDevice} onChange={(e) => setNewRoomDevice(e.target.value)} placeholder="e.g., True HEPA H13 Unit" className="vayu-input text-xs" />
          </div>
          <button type="submit" className="vayu-btn-primary w-full text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Room
          </button>
        </form>
      </div>
    </div>
  );
}
