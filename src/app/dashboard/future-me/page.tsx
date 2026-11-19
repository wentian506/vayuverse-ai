'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BookmarkPlus, Calculator, Clock, Info, Leaf, Play, Sparkles } from 'lucide-react';
import { ErrorBanner, PageHeader, ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { cn } from '@/lib/utils';

interface ScenarioForm {
  label: string;
  departure_hour: number;
  duration_min: number;
  setting: string;
  transport_mode: string;
  activity_level: string;
  mask_type: string;
}

interface ScenarioResult {
  label: string;
  departure_hour: number;
  matched_forecast_time: string;
  duration_min: number;
  distance_km: number;
  transport_label: string;
  activity_label: string;
  mask_label: string;
  ambient_pm25: number;
  ambient_indian_aqi: number;
  micro_env_pm25: number;
  exposure_conc_hours: number;
  estimated_exposure_index_ug: number;
  emissions_co2_g: number;
  assumptions: {
    infiltration_factor: number;
    breathing_rate_m3_h: number;
    respirator_penetration_factor: number;
    emission_factor_g_km: number;
  };
}

interface CompareResponse {
  city: string;
  is_live_input: boolean;
  source_feed: string;
  scenario_a: ScenarioResult;
  scenario_b: ScenarioResult;
  comparison: {
    exposure_delta_pct: number;
    exposure_delta_ug: number;
    time_delta_min: number;
    emissions_delta_g: number;
    recommended: 'A' | 'B';
    summary: string;
  };
  formula_disclosure: string;
  non_medical_disclaimer: string;
}

const MODES = [
  ['walking', 'Walking (Outdoor)'],
  ['cycling', 'Cycling (Outdoor)'],
  ['two_wheeler', 'Two-Wheeler / Scooter'],
  ['auto_rickshaw', 'Auto-Rickshaw'],
  ['car_open', 'Car (Windows Open)'],
  ['ac_car', 'AC Car (Recirculate)'],
  ['city_bus', 'City Bus / Shared Transit'],
  ['metro_ev', 'Metro / AC Electric Transit'],
];

const ACTIVITIES = [
  ['resting', 'Resting / Seated Commute (0.60 m³/h)'],
  ['light', 'Light Activity / Errand (0.95 m³/h)'],
  ['moderate', 'Brisk Walk / Moderate Cycling (1.65 m³/h)'],
  ['vigorous', 'Running / Outdoor Sport (2.80 m³/h)'],
];

export default function FutureMePage() {
  const { selectedCity, toast } = useApp();

  const [scenarioA, setScenarioA] = useState<ScenarioForm>({
    label: 'Scenario A — 07:00 Two-Wheeler',
    departure_hour: 7,
    duration_min: 45,
    setting: 'outdoor',
    transport_mode: 'two_wheeler',
    activity_level: 'light',
    mask_type: 'none',
  });

  const [scenarioB, setScenarioB] = useState<ScenarioForm>({
    label: 'Scenario B — 14:00 Metro/EV + N95',
    departure_hour: 14,
    duration_min: 40,
    setting: 'outdoor',
    transport_mode: 'metro_ev',
    activity_level: 'resting',
    mask_type: 'n95_fitted',
  });

  const [result, setResult] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSimulation = useCallback(
    async (save = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v1/future-me/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            city: selectedCity,
            save,
            scenario_a: scenarioA,
            scenario_b: scenarioB,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Simulation failed.');
        setResult(data);
        if (save) {
          toast('success', 'Scenario saved to profile', 'Accessible in Reports & Analytics and My Profile.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Simulation error');
      } finally {
        setLoading(false);
      }
    },
    [selectedCity, scenarioA, scenarioB, toast]
  );

  useEffect(() => {
    runSimulation(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCity]);

  const renderScenarioEditor = (
    tag: 'A' | 'B',
    val: ScenarioForm,
    setVal: React.Dispatch<React.SetStateAction<ScenarioForm>>,
    accent: string
  ) => (
    <div className={cn('vayu-card p-5 space-y-3.5 border-t-2', accent)}>
      <div className="flex items-center justify-between">
        <span className="font-display text-base font-bold text-white">Scenario {tag}</span>
        <span className="font-mono text-xs text-slate-400">{val.departure_hour.toString().padStart(2, '0')}:00 IST</span>
      </div>

      <div>
        <label className="mb-1 block text-[11px] text-slate-400">Scenario Label</label>
        <input
          value={val.label}
          onChange={(e) => setVal({ ...val, label: e.target.value })}
          className="vayu-input text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">Departure Hour (0–23 IST)</label>
          <input
            type="number"
            min={0}
            max={23}
            value={val.departure_hour}
            onChange={(e) => setVal({ ...val, departure_hour: Number(e.target.value) })}
            className="vayu-input text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">Duration (minutes)</label>
          <input
            type="number"
            min={5}
            max={360}
            step={5}
            value={val.duration_min}
            onChange={(e) => setVal({ ...val, duration_min: Number(e.target.value) })}
            className="vayu-input text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">Environment Setting</label>
          <select
            value={val.setting}
            onChange={(e) => setVal({ ...val, setting: e.target.value })}
            className="vayu-select w-full text-xs"
          >
            <option value="outdoor">Outdoor / In-Transit</option>
            <option value="indoor_unfiltered">Indoor (Natural Ventilation)</option>
            <option value="indoor_hepa">Indoor (Closed + HEPA)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">Transport Mode</label>
          <select
            value={val.transport_mode}
            disabled={val.setting !== 'outdoor'}
            onChange={(e) => setVal({ ...val, transport_mode: e.target.value })}
            className="vayu-select w-full text-xs disabled:opacity-40"
          >
            {MODES.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">Activity Exertion</label>
          <select
            value={val.activity_level}
            onChange={(e) => setVal({ ...val, activity_level: e.target.value })}
            className="vayu-select w-full text-xs"
          >
            {ACTIVITIES.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-slate-400">Respirator Choice</label>
          <select
            value={val.mask_type}
            onChange={(e) => setVal({ ...val, mask_type: e.target.value })}
            className="vayu-select w-full text-xs"
          >
            <option value="none">None (1.00×)</option>
            <option value="cloth_surgical">Cloth / Basic Mask (0.72×)</option>
            <option value="n95_fitted">Fitted N95 / FFP2 (0.25×)</option>
          </select>
        </div>
      </div>
    </div>
  );

  const chartData = result
    ? [
        {
          metric: 'Exposure Index (µg)',
          ScenarioA: result.scenario_a.estimated_exposure_index_ug,
          ScenarioB: result.scenario_b.estimated_exposure_index_ug,
        },
        {
          metric: 'Micro-Env PM2.5',
          ScenarioA: result.scenario_a.micro_env_pm25,
          ScenarioB: result.scenario_b.micro_env_pm25,
        },
        {
          metric: 'Duration (min)',
          ScenarioA: result.scenario_a.duration_min,
          ScenarioB: result.scenario_b.duration_min,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Future Me — Personal Scenario Simulator"
        subtitle={`Compare departure times, transport modes, indoor vs outdoor routines, and duration using live ${selectedCity} hourly forecasts and deterministic physics assumptions.`}
        badge="MVP"
        provenance="ESTIMATED"
        actions={
          <>
            <button type="button" disabled={loading} onClick={() => runSimulation(false)} className="vayu-btn-primary text-xs">
              <Play className="h-3.5 w-3.5" /> {loading ? 'Calculating...' : 'Run Comparison'}
            </button>
            <button type="button" disabled={loading || !result} onClick={() => runSimulation(true)} className="vayu-btn-secondary text-xs">
              <BookmarkPlus className="h-3.5 w-3.5" /> Save Scenario
            </button>
          </>
        }
      />

      <FeatureInteractiveStudio variant="future-me" />

      {error && <ErrorBanner message={error} onRetry={() => runSimulation(false)} />}

      {/* Scenario Builders */}
      <div className="grid gap-5 lg:grid-cols-2">
        {renderScenarioEditor('A', scenarioA, setScenarioA, 'border-t-orange-400')}
        {renderScenarioEditor('B', scenarioB, setScenarioB, 'border-t-vayu-teal')}
      </div>

      {/* Results Panel */}
      {result && (
        <>
          <div className="vayu-card border-vayu-cyan/30 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-vayu-teal" />
                <h2 className="font-display text-lg font-bold text-white">
                  Lower-Exposure Option: Scenario {result.comparison.recommended}
                </h2>
              </div>
              <ProvenanceBadge type="ESTIMATED" />
            </div>
            <p className="mt-2 text-sm text-slate-200">{result.comparison.summary}</p>

            {/* 3 Key Trade-Off Cards */}
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-[#071224] p-4">
                <span className="text-xs text-slate-400">Estimated Exposure Shift (B vs A)</span>
                <p
                  className={cn(
                    'mt-1 font-display text-3xl font-bold',
                    result.comparison.exposure_delta_pct <= 0 ? 'text-vayu-teal' : 'text-orange-300'
                  )}
                >
                  {result.comparison.exposure_delta_pct > 0 ? '+' : ''}
                  {result.comparison.exposure_delta_pct}%
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {result.scenario_a.estimated_exposure_index_ug} → {result.scenario_b.estimated_exposure_index_ug} µg index
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#071224] p-4">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3.5 w-3.5 text-vayu-cyan" /> Time Trade-Off (B vs A)
                </span>
                <p className="mt-1 font-display text-3xl font-bold text-white">
                  {result.comparison.time_delta_min > 0 ? '+' : ''}
                  {result.comparison.time_delta_min} min
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {result.scenario_a.duration_min} min vs {result.scenario_b.duration_min} min
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#071224] p-4">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Leaf className="h-3.5 w-3.5 text-vayu-teal" /> Direct CO2e Trade-Off (Low-Emission Coach)
                </span>
                <p
                  className={cn(
                    'mt-1 font-display text-3xl font-bold',
                    result.comparison.emissions_delta_g <= 0 ? 'text-vayu-teal' : 'text-amber-300'
                  )}
                >
                  {result.comparison.emissions_delta_g > 0 ? '+' : ''}
                  {result.comparison.emissions_delta_g} g
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {result.scenario_a.emissions_co2_g} g vs {result.scenario_b.emissions_co2_g} g CO2e
                </p>
              </div>
            </div>

            {/* Visual Chart + Assumptions */}
            <div className="mt-6 grid gap-6 lg:grid-cols-12">
              <div className="h-64 lg:col-span-7">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="metric" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0A192F', border: '1px solid rgba(33,212,232,0.35)', borderRadius: '10px', fontSize: '12px' }}
                    />
                    <Bar dataKey="ScenarioA" name="Scenario A" fill="#F97316" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="ScenarioB" name="Scenario B" fill="#12BFA5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#060F1E] p-4 text-xs text-slate-300 space-y-2 lg:col-span-5">
                <p className="flex items-center gap-1.5 font-semibold text-white">
                  <Calculator className="h-4 w-4 text-vayu-cyan" /> Disclosed Calculation Assumptions
                </p>
                <p>
                  <strong>Scenario A:</strong> Ambient PM2.5 {result.scenario_a.ambient_pm25} µg/m³ × infiltration{' '}
                  {result.scenario_a.assumptions.infiltration_factor} × mask {result.scenario_a.assumptions.respirator_penetration_factor} × breathing{' '}
                  {result.scenario_a.assumptions.breathing_rate_m3_h} m³/h.
                </p>
                <p>
                  <strong>Scenario B:</strong> Ambient PM2.5 {result.scenario_b.ambient_pm25} µg/m³ × infiltration{' '}
                  {result.scenario_b.assumptions.infiltration_factor} × mask {result.scenario_b.assumptions.respirator_penetration_factor} × breathing{' '}
                  {result.scenario_b.assumptions.breathing_rate_m3_h} m³/h.
                </p>
                <p className="pt-1 font-mono text-[10.5px] text-slate-400">{result.formula_disclosure}</p>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-950/20 p-3 text-[11px] text-amber-100">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <span>{result.non_medical_disclaimer}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
