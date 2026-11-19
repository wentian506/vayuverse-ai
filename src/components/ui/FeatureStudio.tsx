'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Sliders } from 'lucide-react';
import { useApp } from '@/components/providers/AppProvider';
import { ProvenanceBadge } from '@/components/ui/VayuUI';
import {
  ColorCodedAirChart,
  DynamicRoadmapCard,
  IN_AQI_BANDS,
  IndianSkylineSvg,
  LivePulseBadge,
  RadialDialMeter,
  resolveBand,
  RoadmapStep,
  SpectrumScaleBar,
  StepperControl,
  SwitchControl,
  US_AQI_BANDS,
} from '@/components/ui/AqiVisuals';
import { LiveAirBundle } from '@/lib/types';
import { cn, computeUsAqi, formatShortHour } from '@/lib/utils';

export type FeatureStudioVariant =
  | 'live-air'
  | 'pollution-shadow'
  | 'future-me'
  | 'routes'
  | 'replanner'
  | 'home'
  | 'family'
  | 'campus'
  | 'community'
  | 'alerts';

interface VariantConfig {
  badge: string;
  accent: string;
  heroGrad: string;
  heroSubtitle: string;
  stepper1: { label: string; hint: string; min: number; max: number; step: number; init: number; unit: string };
  stepper2: { label: string; hint: string; min: number; max: number; step: number; init: number; unit: string };
  switch1: { label: string; desc: string; badge: string; init: boolean; factor: number };
  switch2: { label: string; desc: string; badge: string; init: boolean; factor: number };
  switch3: { label: string; desc: string; badge: string; init: boolean; factor: number };
  useForecast: boolean;
  compute: (args: {
    baseAqi: number;
    pm25: number;
    windKph: number;
    s1: number;
    s2: number;
    sw1: boolean;
    sw2: boolean;
    sw3: boolean;
    cleanHr: string;
    peakHr: string;
    city: string;
  }) => {
    multiplier: number;
    meter1: { label: string; value: number; max: number; unit: string; status: string; color: string; delta: string; good: boolean };
    meter2: { label: string; value: number; max: number; unit: string; status: string; color: string; delta: string; good: boolean };
    meter3: { label: string; value: number; max: number; unit: string; status: string; color: string; delta: string; good: boolean };
    threshold?: number;
    thresholdLabel?: string;
    chartTitle: string;
    simLabel: string;
    headline: string;
    steps: RoadmapStep[];
  };
}

const VARIANT_CONFIGS: Record<FeatureStudioVariant, VariantConfig> = {
  'live-air': {
    badge: 'EMERALD CORRIDOR TELEMETRY',
    accent: '#22C55E',
    heroGrad: 'from-[#0E4431] via-[#156A48] to-[#0D3B2C]',
    heroSubtitle: 'Step corridor buffer distance & ventilation minutes or toggle protective filters to test real-time street-to-room impact.',
    stepper1: { label: 'Green Buffer Setback', hint: 'Distance from main arterial traffic', min: 0, max: 300, step: 25, init: 100, unit: ' m' },
    stepper2: { label: 'Window Ventilation Time', hint: 'Minutes of natural cross-ventilation', min: 0, max: 120, step: 10, init: 30, unit: ' min' },
    switch1: { label: 'Park / Tree-Lined Side Street', desc: 'Avoid congested highway canyon', badge: '−14%', init: true, factor: 0.86 },
    switch2: { label: 'Ventilate Only at Cleanest Hour', desc: 'Restrict airing to peak mixing window', badge: '−18%', init: true, factor: 0.82 },
    switch3: { label: 'Wet-Dust Suppression Nearby', desc: 'Reduces coarse PM10 resuspension', badge: '−10%', init: false, factor: 0.9 },
    useForecast: false,
    compute: ({ baseAqi, pm25, s1, s2, sw1, sw2, sw3, cleanHr, peakHr, city }) => {
      const mult = Math.max(0.35, (1 - s1 * 0.0005 + (s2 - 30) * 0.0012) * (sw1 ? 0.86 : 1) * (sw2 ? 0.82 : 1) * (sw3 ? 0.9 : 1));
      const effAqi = Math.round(baseAqi * mult);
      const effPm25 = Math.round(pm25 * mult * 10) / 10;
      const ventScore = Math.min(100, Math.max(10, Math.round(100 - effAqi * 0.32 + (sw2 ? 14 : -6))));
      const delta = Math.round((mult - 1) * 100);
      return {
        multiplier: mult,
        meter1: { label: 'Corridor Effective AQI', value: effAqi, max: 450, unit: '', status: effAqi <= 100 ? 'Clean Corridor' : effAqi <= 200 ? 'Moderate' : 'Elevated', color: effAqi <= 100 ? '#22C55E' : effAqi <= 200 ? '#EAB308' : '#F97316', delta: `${delta > 0 ? '+' : ''}${delta}% vs arterial`, good: delta <= 0 },
        meter2: { label: 'Estimated Local PM2.5', value: effPm25, max: 250, unit: ' µg/m³', status: effPm25 <= 60 ? 'Within CPCB 24h' : 'Above 60 µg/m³', color: effPm25 <= 60 ? '#10B981' : '#EC487F', delta: `${s1}m setback`, good: effPm25 <= 60 },
        meter3: { label: 'Cross-Ventilation Index', value: ventScore, max: 100, unit: '/100', status: ventScore >= 65 ? 'Favourable' : 'Keep Brief', color: ventScore >= 65 ? '#22C55E' : '#F59E0B', delta: `${s2} min airing`, good: ventScore >= 60 },
        threshold: 100,
        thresholdLabel: 'Satisfactory AQI (100)',
        chartTitle: `${city} 24h Corridor AQI vs Buffered Intake`,
        simLabel: `Corridor-Adjusted AQI (${delta > 0 ? '+' : ''}${delta}%)`,
        headline: `At ${s1}m traffic setback and ${s2}m airing, effective corridor AQI in ${city} drops from ${baseAqi} → ${effAqi} (Ventilation Index ${ventScore}/100).`,
        steps: [
          { phase: 'CORRIDOR', title: sw1 ? `Tree-Buffered + ${s1}m Setback` : `Direct Roadside (${s1}m)`, detail: `Moving ${s1}m off primary traffic streams trims tailpipe NO₂ and resuspended PM10 exposure.`, impact: `${delta}% vs curb`, status: s1 >= 75 ? 'active' : 'caution' },
          { phase: 'VENTILATE', title: sw2 ? `Air Home ${s2}m at ${cleanHr}` : `Unscheduled ${s2}m Airing`, detail: `Open opposite windows for ${s2} min around ${cleanHr} and keep closed near ${peakHr}.`, impact: `Score ${ventScore}/100`, status: ventScore >= 60 ? 'active' : 'caution' },
          { phase: 'DUST CTRL', title: sw3 ? 'Wet-Mop & Dust Control ON' : 'Enable Damp Dust Control', detail: 'Wet-mopping balconies and entryways lowers coarse particle re-entrainment indoors.', impact: sw3 ? '−10% coarse load' : 'Recommended', status: sw3 ? 'active' : 'recommended' },
          { phase: 'MONITOR', title: 'Track Sub-Index Shifts', detail: `Estimated micro-corridor PM2.5 is ${effPm25} µg/m³ (CPCB 24h reference: 60 µg/m³).`, impact: `${effPm25} µg/m³ EST.`, status: effPm25 <= 60 ? 'active' : 'recommended' },
        ],
      };
    },
  },

  'pollution-shadow': {
    badge: 'VIOLET PLUME & DISPERSION LAB',
    accent: '#8B5CF6',
    heroGrad: 'from-[#28164F] via-[#462482] to-[#231445]',
    heroSubtitle: 'Increment forecast lead offset & wind-speed anomaly or switch atmospheric inversion conditions to stress-test 48h plume movement.',
    stepper1: { label: 'Wind Speed Shift', hint: 'Test calmer stagnation (−) or stronger breeze (+)', min: -50, max: 80, step: 10, init: 10, unit: '%' },
    stepper2: { label: 'Upwind Plume Intensity', hint: 'Regional transport contribution adjustment', min: -40, max: 60, step: 10, init: 0, unit: '%' },
    switch1: { label: 'Nighttime Thermal Inversion', desc: 'Shallow boundary layer traps surface PM', badge: '+22%', init: false, factor: 1.22 },
    switch2: { label: 'Pre-Spike Window Seal', desc: 'Close leeward intakes 2h before plume peak', badge: '−24%', init: true, factor: 0.76 },
    switch3: { label: 'Rain Washout Event', desc: 'Wet deposition scrubs suspended particulates', badge: '−32%', init: false, factor: 0.68 },
    useForecast: true,
    compute: ({ baseAqi, windKph, s1, s2, sw1, sw2, sw3, cleanHr, peakHr, city }) => {
      const mult = Math.max(0.28, (1 - s1 * 0.004 + s2 * 0.006) * (sw1 ? 1.22 : 1) * (sw2 ? 0.76 : 1) * (sw3 ? 0.68 : 1));
      const projAqi = Math.round(baseAqi * mult);
      const effWind = Math.max(1, Math.round(windKph * (1 + s1 / 100) * 10) / 10);
      const dispersion = Math.min(100, Math.max(8, Math.round(effWind * 4.5 + (sw3 ? 28 : 0) - (sw1 ? 24 : 0))));
      const delta = Math.round((mult - 1) * 100);
      return {
        multiplier: mult,
        meter1: { label: 'Plume-Adjusted AQI', value: projAqi, max: 500, unit: '', status: projAqi <= 150 ? 'Contained' : projAqi <= 280 ? 'Plume Watch' : 'Heavy Shadow', color: projAqi <= 150 ? '#22C55E' : projAqi <= 280 ? '#A855F7' : '#EC487F', delta: `${delta > 0 ? '+' : ''}${delta}% vs base`, good: delta <= 0 },
        meter2: { label: 'Effective Wind Speed', value: effWind, max: 40, unit: ' km/h', status: effWind >= 12 ? 'Active Mixing' : 'Stagnant', color: effWind >= 12 ? '#21D4E8' : '#F59E0B', delta: `${s1 > 0 ? '+' : ''}${s1}% wind`, good: effWind >= 10 },
        meter3: { label: 'Atmospheric Dispersion', value: dispersion, max: 100, unit: '/100', status: dispersion >= 60 ? 'Strong Clearing' : 'Trapped Layer', color: dispersion >= 60 ? '#10B981' : '#8B5CF6', delta: sw1 ? 'Inversion ON' : 'Normal Mix', good: dispersion >= 50 },
        chartTitle: `${city} 48h Forecast Plume Curve vs Dispersion Scenario`,
        simLabel: `Plume Scenario (${delta > 0 ? '+' : ''}${delta}%)`,
        headline: `At ${effWind} km/h modelled wind (${s1 >= 0 ? `+${s1}` : s1}%) and ${s2 >= 0 ? `+${s2}` : s2}% upwind flux, ${city} plume AQI projects to ${projAqi} (Dispersion ${dispersion}/100).`,
        steps: [
          { phase: 'PLUME WATCH', title: `Peak Shadow Near ${peakHr}`, detail: sw1 ? 'Active thermal inversion holds pollutants close to street level overnight and at dawn.' : 'Standard diurnal mixing lifts surface haze after late morning.', impact: `${projAqi} proj. AQI`, status: sw1 ? 'caution' : 'active' },
          { phase: 'WIND DRIFT', title: `${effWind} km/h Ventilation Flow`, detail: effWind < 10 ? 'Low breeze slows plume clearing — avoid downwind arterial intersections.' : 'Steady breeze accelerates corridor flushing during midday hours.', impact: `Dispersion ${dispersion}%`, status: effWind >= 10 ? 'active' : 'caution' },
          { phase: 'PRE-SEAL', title: sw2 ? 'Leeward Intakes Sealed Early' : 'Activate Pre-Spike Seal', detail: `Close upwind-facing windows 2 hours before ${peakHr} and reopen around ${cleanHr}.`, impact: sw2 ? '−24% indoor ingress' : 'Recommended', status: sw2 ? 'active' : 'recommended' },
          { phase: 'WASHOUT', title: sw3 ? 'Post-Rain Clean Window' : 'Dry Regime Protocol', detail: sw3 ? 'Wet deposition provides a sharp multi-hour clean-air window ideal for airing and errands.' : 'No rain scrubbing active — rely on afternoon convective mixing windows.', impact: sw3 ? '−32% washout' : 'Dry forecast', status: 'active' },
        ],
      };
    },
  },

  'future-me': {
    badge: 'MAGENTA HABIT & EXPOSURE TWIN',
    accent: '#EC4899',
    heroGrad: 'from-[#4A1538] via-[#7E2359] to-[#3E1230]',
    heroSubtitle: 'Dial weekly clean-commute days & mask adherence or flip home habits to project relative exposure reduction and CO₂ savings.',
    stepper1: { label: 'Clean Commute Days / Week', hint: 'Days using metro, cycling (clean hr), or WFH', min: 0, max: 7, step: 1, init: 4, unit: ' days' },
    stepper2: { label: 'Purifier Runtime / Day', hint: 'Hours running HEPA filtration at home', min: 0, max: 16, step: 2, init: 8, unit: ' hrs' },
    switch1: { label: 'N95 on High-AQI Days', desc: 'Consistent fit-checked respirator above AQI 150', badge: '−30%', init: true, factor: 0.7 },
    switch2: { label: 'Shift Exercise to Cleanest Hour', desc: 'Avoid dawn/dusk inversion workouts', badge: '−16%', init: true, factor: 0.84 },
    switch3: { label: 'Induction / Exhaust Cooking', desc: 'Cuts indoor PM2.5 & NO₂ cooking spikes', badge: '−12%', init: true, factor: 0.88 },
    useForecast: true,
    compute: ({ baseAqi, s1, s2, sw1, sw2, sw3, cleanHr, city }) => {
      const mult = Math.max(0.24, (1 - s1 * 0.03 - s2 * 0.015) * (sw1 ? 0.7 : 1) * (sw2 ? 0.84 : 1) * (sw3 ? 0.88 : 1));
      const effDose = Math.round(baseAqi * mult);
      const savedPct = Math.max(0, Math.round((1 - mult) * 100));
      const monthlyCo2Kg = Math.round((s1 * 4.2 * 1.45 + (sw3 ? 4.5 : 0)) * 10) / 10;
      return {
        multiplier: mult,
        meter1: { label: 'Personalised Effective AQI', value: effDose, max: 450, unit: '', status: `${savedPct}% Lower Load`, color: effDose <= 90 ? '#22C55E' : '#EC4899', delta: `−${savedPct}% vs unshielded`, good: true },
        meter2: { label: 'Exposure Reduction Meter', value: savedPct, max: 100, unit: '%', status: savedPct >= 45 ? 'High Protection' : 'Moderate Gain', color: '#10B981', delta: `${s1}d/wk + ${s2}h HEPA`, good: savedPct >= 35 },
        meter3: { label: 'Monthly CO₂ Avoided', value: monthlyCo2Kg, max: 60, unit: ' kg', status: 'Low-Carbon Habit', color: '#38BDF8', delta: `${s1 * 4} clean trips/mo`, good: monthlyCo2Kg >= 10 },
        chartTitle: `${city} Unshielded Forecast vs Your Future-Me Habit Curve`,
        simLabel: `Future-Me Exposure (−${savedPct}%)`,
        headline: `Your habit stack reduces relative pollution exposure by ~${savedPct}% (effective AQI ${baseAqi} → ${effDose}) and avoids ~${monthlyCo2Kg} kg CO₂/month (ESTIMATED, non-medical).`,
        steps: [
          { phase: 'MOBILITY', title: `${s1}/7 Clean Commute Days`, detail: `Shifting ${s1} days/week saves ~${monthlyCo2Kg} kg CO₂/month and cuts traffic-corridor exposure.`, impact: `${monthlyCo2Kg} kg CO₂/mo`, status: s1 >= 3 ? 'active' : 'recommended' },
          { phase: 'INDOOR AIR', title: `${s2}h HEPA + ${sw3 ? 'Clean Kitchen' : 'Standard Stove'}`, detail: `Running filtration ${s2}h/day with exhaust ventilation protects sleep and recovery hours.`, impact: `${s2}h filtered/day`, status: s2 >= 6 ? 'active' : 'recommended' },
          { phase: 'WORKOUT', title: sw2 ? `Aligned to ${cleanHr} Window` : 'Move Workout Off Dawn Peak', detail: 'Higher breathing rates during exercise amplify benefits of picking the cleanest hour.', impact: sw2 ? '−16% workout load' : 'Recommended', status: sw2 ? 'active' : 'caution' },
          { phase: '30-DAY TWIN', title: `−${savedPct}% Cumulative Load`, detail: 'Environmental exposure estimate only (not medical advice). Save below to track long-term.', impact: `−${savedPct}% EST.`, status: 'active' },
        ],
      };
    },
  },

  routes: {
    badge: 'TEAL MOBILITY & CORRIDOR MATRIX',
    accent: '#14B8A6',
    heroGrad: 'from-[#0D3E42] via-[#12686E] to-[#0B353A]',
    heroSubtitle: 'Step trip distance & departure shift or toggle cabin recirculation, metro switch, and green-detour routing.',
    stepper1: { label: 'One-Way Trip Distance', hint: 'Commute distance across the city', min: 2, max: 40, step: 2, init: 12, unit: ' km' },
    stepper2: { label: 'Departure Shift Off-Peak', hint: 'Minutes shifted away from peak congestion', min: 0, max: 120, step: 15, init: 30, unit: ' min' },
    switch1: { label: 'Green-Corridor Detour (+6 min)', desc: 'Parallel low-traffic tree-buffered road', badge: '−19%', init: true, factor: 0.81 },
    switch2: { label: 'Switch Solo Car → Metro / EV Bus', desc: 'Slashes per-passenger CO₂ & road intake', badge: '−24%', init: true, factor: 0.76 },
    switch3: { label: 'Cabin Recirculation / N95 Mask', desc: 'Blocks intersection exhaust bursts', badge: '−28%', init: false, factor: 0.72 },
    useForecast: true,
    compute: ({ baseAqi, s1, s2, sw1, sw2, sw3, cleanHr, city }) => {
      const mult = Math.max(0.26, (1 - s2 * 0.0015) * (sw1 ? 0.81 : 1) * (sw2 ? 0.76 : 1) * (sw3 ? 0.72 : 1));
      const routeAqi = Math.round(baseAqi * mult);
      const co2Grams = Math.round(s1 * (sw2 ? 38 : 168));
      const co2Saved = Math.max(0, s1 * 168 - co2Grams);
      const delta = Math.round((mult - 1) * 100);
      return {
        multiplier: mult,
        meter1: { label: 'In-Transit Effective AQI', value: routeAqi, max: 450, unit: '', status: routeAqi <= 110 ? 'Clean Commute' : 'Moderate Intake', color: '#14B8A6', delta: `${delta}% vs rush road`, good: true },
        meter2: { label: 'Trip Tailpipe Emissions', value: co2Grams, max: 4500, unit: ' g', status: sw2 ? 'Low-Carbon Mode' : 'Solo Vehicle', color: sw2 ? '#22C55E' : '#F59E0B', delta: co2Saved > 0 ? `−${co2Saved}g CO₂ saved` : 'Baseline CO₂', good: sw2 },
        meter3: { label: 'Route Cleanliness Score', value: Math.min(100, Math.max(15, Math.round((1 - mult) * 120 + 25))), max: 100, unit: '/100', status: `${s1} km · +${s2}m shift`, color: '#38BDF8', delta: sw1 ? 'Green detour' : 'Direct road', good: true },
        chartTitle: `${city} Departure-Hour AQI vs Optimised Commute Intake`,
        simLabel: `Optimised Route Intake (${delta}%)`,
        headline: `For a ${s1} km trip shifted +${s2} min off-peak, in-transit effective AQI drops ${baseAqi} → ${routeAqi} (${delta}%) with ${co2Grams}g CO₂ emitted.`,
        steps: [
          { phase: 'DEPARTURE', title: `Shift Departure by +${s2} min`, detail: `Avoiding peak bumper-to-bumper waves moves your ride closer to ${cleanHr} mixing conditions.`, impact: `+${s2}m off-peak`, status: s2 >= 30 ? 'active' : 'recommended' },
          { phase: 'ALIGNMENT', title: sw1 ? 'Green Secondary Corridor' : 'Main Arterial Highway', detail: 'Choosing a parallel secondary route avoids heavy diesel freight queues at signals.', impact: sw1 ? '−19% intake' : 'Toggle detour', status: sw1 ? 'active' : 'caution' },
          { phase: 'MODE', title: sw2 ? `Transit / EV (${co2Grams}g CO₂)` : `Private Vehicle (${co2Grams}g CO₂)`, detail: sw2 ? `Avoids ~${co2Saved}g CO₂ per ${s1} km trip compared to solo petrol driving.` : `Switching to metro/shared transit saves ~${Math.round(s1 * 130)}g CO₂ per trip.`, impact: `${co2Grams}g CO₂`, status: sw2 ? 'active' : 'recommended' },
          { phase: 'BARRIER', title: sw3 ? 'Recirculation / N95 Engaged' : 'Add Signal-Stop Shield', detail: 'Use AC recirculation inside vehicles or an N95 mask on open two-wheelers/walks.', impact: sw3 ? '−28% particulates' : 'Optional boost', status: sw3 ? 'active' : 'recommended' },
        ],
      };
    },
  },

  replanner: {
    badge: 'AMBER 24H ROUTINE OPTIMISER',
    accent: '#F59E0B',
    heroGrad: 'from-[#4F320D] via-[#845314] to-[#422A0B]',
    heroSubtitle: 'Step your exercise duration & schedule flexibility hours or toggle smart routine shifts to align your day with cleanest air.',
    stepper1: { label: 'Outdoor Activity Block', hint: 'Planned walk, run, errands, or field task', min: 15, max: 180, step: 15, init: 45, unit: ' min' },
    stepper2: { label: 'Schedule Shift Window', hint: 'Hours moved from morning peak to afternoon', min: 0, max: 8, step: 1, init: 4, unit: ' hrs' },
    switch1: { label: 'Move Cardio to Afternoon Window', desc: 'Swap early-dawn haze for peak mixing hour', badge: '−22%', init: true, factor: 0.78 },
    switch2: { label: 'Batch Outdoor Errands Together', desc: 'Single clean-hour trip instead of 3 outings', badge: '−14%', init: true, factor: 0.86 },
    switch3: { label: 'Indoor Backup Above Threshold', desc: 'Switch to indoor training if AQI > 200', badge: '−25%', init: false, factor: 0.75 },
    useForecast: true,
    compute: ({ baseAqi, s1, s2, sw1, sw2, sw3, cleanHr, peakHr, city }) => {
      const mult = Math.max(0.28, (1 - s2 * 0.025) * (sw1 ? 0.78 : 1) * (sw2 ? 0.86 : 1) * (sw3 ? 0.75 : 1));
      const slotAqi = Math.round(baseAqi * mult);
      const dayScore = Math.min(100, Math.max(20, Math.round(95 - (slotAqi / 400) * 55 - (s1 > 90 ? 12 : 0))));
      const saved = Math.round((1 - mult) * 100);
      return {
        multiplier: mult,
        meter1: { label: 'Replanned Slot AQI', value: slotAqi, max: 450, unit: '', status: `Best near ${cleanHr}`, color: '#F59E0B', delta: `−${saved}% vs peak`, good: true },
        meter2: { label: 'Day Alignment Score', value: dayScore, max: 100, unit: '/100', status: dayScore >= 70 ? 'Well Optimised' : 'Shift More', color: dayScore >= 70 ? '#22C55E' : '#F97316', delta: `+${s2}h shifted`, good: dayScore >= 65 },
        meter3: { label: 'Outdoor Exposure Budget', value: s1, max: 180, unit: ' min', status: s1 <= 60 ? 'Balanced' : 'Extended Block', color: '#38BDF8', delta: sw2 ? 'Batched 1 trip' : 'Split outings', good: s1 <= 75 },
        threshold: 150,
        thresholdLabel: 'Outdoor Caution (150)',
        chartTitle: `${city} Next 24h AQI vs Replanned Activity Exposure`,
        simLabel: `Replanned Routine (−${saved}%)`,
        headline: `Shifting your ${s1}-minute outdoor block by +${s2}h toward ${cleanHr} yields Day Alignment Score ${dayScore}/100 and ~${saved}% lower exposure.`,
        steps: [
          { phase: 'MORNING', title: `Skip ${peakHr} Inversion Peak`, detail: 'Keep vigorous movement indoors during early morning stagnation and ventilate later.', impact: 'Peak avoided', status: 'active' },
          { phase: 'MIDDAY', title: `${s1}m Activity at ${cleanHr}`, detail: sw1 ? `Your ${s1}m workout + batched errands sit inside today's cleanest boundary-layer window.` : `Enable Afternoon Swap to move your ${s1}m block to ${cleanHr}.`, impact: `Slot AQI ~${slotAqi}`, status: sw1 ? 'active' : 'caution' },
          { phase: 'ERRANDS', title: sw2 ? 'Errands Consolidated' : 'Consolidate Short Trips', detail: 'Combining groceries and pickups into one afternoon window trims repeated roadside exposure.', impact: sw2 ? '−14% exposure' : 'Recommended', status: sw2 ? 'active' : 'recommended' },
          { phase: 'FALLBACK', title: sw3 ? 'Indoor Backup Rule Armed' : 'Optional AQI > 200 Rule', detail: 'Auto-convert high-intensity outdoor sessions to filtered indoor space on poor air days.', impact: `Score ${dayScore}/100`, status: 'active' },
        ],
      };
    },
  },

  home: {
    badge: 'MINT INDOOR AIR & CADR TWIN',
    accent: '#10B981',
    heroGrad: 'from-[#0B4235] via-[#0F6E56] to-[#0A372C]',
    heroSubtitle: 'Increment room area & purifier CADR rate or flip window sealing, cooking exhaust, and incense/smoke controls to model indoor PM2.5.',
    stepper1: { label: 'Purifier Clean Air Rate (CADR)', hint: 'Higher fan speed cleans room volume faster', min: 0, max: 500, step: 50, init: 250, unit: ' m³/h' },
    stepper2: { label: 'Room Floor Area', hint: 'Bedroom or living room size', min: 10, max: 80, step: 5, init: 25, unit: ' m²' },
    switch1: { label: 'Seal Windows During Outdoor Peaks', desc: 'Reduces outdoor-to-indoor infiltration factor', badge: '−38%', init: true, factor: 0.62 },
    switch2: { label: 'Kitchen Chimney / Exhaust Fan ON', desc: 'Vents frying PM2.5 & burner NO₂ outdoors', badge: '−18%', init: true, factor: 0.82 },
    switch3: { label: 'Indoor Frying / Incense Active', desc: 'Simulates an indoor particulate emission spike', badge: '+35%', init: false, factor: 1.35 },
    useForecast: false,
    compute: ({ baseAqi, pm25, s1, s2, sw1, sw2, sw3, cleanHr, city }) => {
      const volume = s2 * 2.8;
      const ach = Math.round((s1 / Math.max(10, volume)) * 10) / 10;
      const cadrFactor = 1 / (1 + ach * 0.42);
      const mult = Math.max(0.12, cadrFactor * (sw1 ? 0.62 : 0.92) * (sw2 ? 0.82 : 1) * (sw3 ? 1.35 : 1));
      const inPm25 = Math.max(3, Math.round(pm25 * mult * 10) / 10);
      const inAqi = Math.max(8, Math.round(baseAqi * mult));
      const cleanTimeMin = s1 > 0 ? Math.max(8, Math.round((volume / s1) * 60 * 1.4)) : 120;
      return {
        multiplier: mult,
        meter1: { label: 'Estimated Indoor AQI', value: inAqi, max: 400, unit: '', status: inAqi <= 50 ? 'Clean Sanctuary' : inAqi <= 100 ? 'Satisfactory' : 'Boost CADR', color: inAqi <= 50 ? '#10B981' : inAqi <= 100 ? '#84CC16' : '#F59E0B', delta: `I/O ratio ${mult.toFixed(2)}`, good: inAqi <= 80 },
        meter2: { label: 'Estimated Indoor PM2.5', value: inPm25, max: 200, unit: ' µg/m³', status: `${ach} ACH turnover`, color: inPm25 <= 25 ? '#22C55E' : '#F97316', delta: `${s1} m³/h in ${s2} m²`, good: inPm25 <= 35 },
        meter3: { label: 'Room Clean-Down Time', value: cleanTimeMin, max: 120, unit: ' min', status: s1 === 0 ? 'Purifier OFF' : cleanTimeMin <= 25 ? 'Rapid Scrub' : 'Steady Scrub', color: '#38BDF8', delta: `${Math.round(volume)} m³ room`, good: cleanTimeMin <= 35 },
        threshold: 50,
        thresholdLabel: 'Good Indoor Target (50)',
        chartTitle: `${city} Outdoor AQI vs Modelled Indoor Room Curve`,
        simLabel: `Indoor Room AQI (I/O ${mult.toFixed(2)})`,
        headline: `A ${s1} m³/h purifier in a ${s2} m² room delivers ${ach} air changes/hr — bringing outdoor AQI ${baseAqi} down to ~${inAqi} indoors (~${inPm25} µg/m³ PM2.5) in ~${cleanTimeMin} min.`,
        steps: [
          { phase: 'FILTRATION', title: `${s1} m³/h CADR (${ach} ACH)`, detail: ach >= 4 ? `Strong sizing for ${s2} m² — cleans room air in ~${cleanTimeMin} minutes.` : `Step CADR upward toward ${Math.round(volume * 4.5)} m³/h to hit ≥4.5 ACH for ${s2} m².`, impact: `~${cleanTimeMin}m clean-down`, status: ach >= 3.5 ? 'active' : 'recommended' },
          { phase: 'ENVELOPE', title: sw1 ? 'Sealed Now · Air at ' + cleanHr : 'Windows Open to Haze', detail: `Keep gaps closed during peaks and briefly purge stale CO₂ for 15 min around ${cleanHr}.`, impact: `I/O ${mult.toFixed(2)}`, status: sw1 ? 'active' : 'caution' },
          { phase: 'KITCHEN', title: sw2 ? 'Exhaust Hood Running' : 'Turn On Kitchen Exhaust', detail: 'Run exhaust during cooking and for 10 minutes after turning off burners.', impact: sw2 ? '−18% indoor PM' : 'Recommended', status: sw2 ? 'active' : 'caution' },
          { phase: 'SOURCES', title: sw3 ? 'Indoor Smoke Spike Active!' : 'Zero Indoor Smoke Sources', detail: sw3 ? 'Active frying/incense raises indoor particles sharply — step CADR up and vent kitchen.' : 'Keeping indoor combustion off preserves clean sleep-room air overnight.', impact: `${inPm25} µg/m³ EST.`, status: sw3 ? 'caution' : 'active' },
        ],
      };
    },
  },

  family: {
    badge: 'CORAL HOUSEHOLD GUARDIAN',
    accent: '#F43F5E',
    heroGrad: 'from-[#4E1428] via-[#881E3F] to-[#421122]',
    heroSubtitle: 'Adjust household AQI alert trigger & kids/elders outdoor limit or switch school-run masks, bedroom purifier, and caregiver digests.',
    stepper1: { label: 'Family Care Alert Threshold', hint: 'Trigger protective protocol above this AQI', min: 50, max: 300, step: 25, init: 125, unit: ' AQI' },
    stepper2: { label: 'Outdoor Play / Walk Cap', hint: 'Minutes during elevated-AQI days', min: 15, max: 150, step: 15, init: 45, unit: ' min' },
    switch1: { label: 'School-Run & Morning Walk Masks', desc: 'Kids & elders shielded during rush haze', badge: '−32%', init: true, factor: 0.68 },
    switch2: { label: 'Nighttime Bedroom Clean-Air Zone', desc: 'Filtered sleep room from 21:00–07:00', badge: '−22%', init: true, factor: 0.78 },
    switch3: { label: 'Shift Elder Walk to Afternoon', desc: 'Move off cold dawn inversion hours', badge: '−16%', init: true, factor: 0.84 },
    useForecast: true,
    compute: ({ baseAqi, s1, s2, sw1, sw2, sw3, cleanHr, city }) => {
      const mult = Math.max(0.25, (0.9 + (s2 - 45) * 0.002) * (sw1 ? 0.68 : 1) * (sw2 ? 0.78 : 1) * (sw3 ? 0.84 : 1));
      const famAqi = Math.round(baseAqi * mult);
      const shield = Math.min(100, Math.round((sw1 ? 34 : 8) + (sw2 ? 32 : 8) + (sw3 ? 24 : 6) + (s1 <= 150 ? 10 : 2)));
      const triggered = baseAqi >= s1;
      return {
        multiplier: mult,
        meter1: { label: 'Household Effective AQI', value: famAqi, max: 450, unit: '', status: triggered ? 'Care Protocol ON' : 'Standby Safe', color: famAqi <= 90 ? '#22C55E' : '#F43F5E', delta: `Trigger @ ${s1} AQI`, good: famAqi < s1 },
        meter2: { label: 'Family Shield Score', value: shield, max: 100, unit: '%', status: shield >= 75 ? 'All Protected' : 'Enable Toggles', color: shield >= 75 ? '#10B981' : '#F59E0B', delta: `${[sw1, sw2, sw3].filter(Boolean).length}/3 active`, good: shield >= 70 },
        meter3: { label: 'Safe Outdoor Play Cap', value: s2, max: 150, unit: ' min', status: `Best at ${cleanHr}`, color: '#38BDF8', delta: triggered ? 'Alert active' : 'Normal day', good: s2 <= 60 },
        threshold: s1,
        thresholdLabel: `Family Alert (${s1})`,
        chartTitle: `${city} Forecast AQI vs Shielded Household Exposure`,
        simLabel: `Household Shielded AQI (${famAqi})`,
        headline: `${city} live AQI (${baseAqi}) is ${triggered ? 'ABOVE' : 'below'} your ${s1} AQI household trigger — active family controls bring effective exposure down to ~${famAqi} (Shield ${shield}%).`,
        steps: [
          { phase: 'ALERT RULE', title: triggered ? `Protocol Active (>${s1} AQI)` : `Monitoring (<${s1} AQI)`, detail: `Caregiver alert threshold set at ${s1} AQI (non-medical protective check).`, impact: `Limit: ${s1} AQI`, status: triggered ? 'caution' : 'active' },
          { phase: 'SCHOOL RUN', title: sw1 ? 'Commute Masks Packed' : 'Pack Kids/Elder Masks', detail: 'Morning school-gate traffic combines dawn stagnation with idling bus exhaust.', impact: sw1 ? '−32% commute load' : 'Recommended', status: sw1 ? 'active' : 'caution' },
          { phase: 'PLAY & WALK', title: `${s2}m Window Near ${cleanHr}`, detail: sw3 ? `Elder walks and ${s2}m outdoor play aligned to warmest afternoon dispersion.` : 'Toggle afternoon walk shift to avoid early morning chill & haze.', impact: `${s2}m cap`, status: sw3 ? 'active' : 'recommended' },
          { phase: 'SLEEP ZONE', title: sw2 ? 'Clean Bedroom Mode 21:00' : 'Schedule Night Purifier', detail: 'Pre-clean shared sleeping spaces 45 minutes before bedtime.', impact: `Shield ${shield}%`, status: sw2 ? 'active' : 'recommended' },
        ],
      };
    },
  },

  campus: {
    badge: 'CERULEAN CAMPUS OPERATIONS',
    accent: '#0EA5E9',
    heroGrad: 'from-[#0C3554] via-[#0E5E8F] to-[#0A2C47]',
    heroSubtitle: 'Tune campus outdoor-sports AQI cutoff & classroom filtration share or toggle bus no-idling and indoor assembly advisories.',
    stepper1: { label: 'Outdoor Sports AQI Cutoff', hint: 'Move PE/athletics indoors above this AQI', min: 100, max: 350, step: 25, init: 175, unit: ' AQI' },
    stepper2: { label: 'Filtered Classrooms Share', hint: 'Percentage of rooms running HEPA/MERV-13', min: 0, max: 100, step: 10, init: 70, unit: '%' },
    switch1: { label: 'Move Morning Assembly Indoors', desc: 'Avoids 07:30–08:30 peak stagnation slot', badge: '−20%', init: true, factor: 0.8 },
    switch2: { label: 'School-Gate No-Idling Zone', desc: 'Cuts drop-off bus/car PM2.5 & CO plume', badge: '−15%', init: true, factor: 0.85 },
    switch3: { label: 'Wet-Sweep Grounds & Courts', desc: 'Controls playground PM10 dust before recess', badge: '−12%', init: false, factor: 0.88 },
    useForecast: true,
    compute: ({ baseAqi, s1, s2, sw1, sw2, sw3, cleanHr, city }) => {
      const mult = Math.max(0.28, (1 - s2 * 0.0032) * (sw1 ? 0.8 : 1) * (sw2 ? 0.85 : 1) * (sw3 ? 0.88 : 1));
      const campAqi = Math.round(baseAqi * mult);
      const readiness = Math.min(100, Math.round(s2 * 0.45 + (sw1 ? 22 : 0) + (sw2 ? 20 : 0) + (sw3 ? 13 : 0)));
      const sportsIndoor = baseAqi >= s1;
      return {
        multiplier: mult,
        meter1: { label: 'Campus Student Exposure AQI', value: campAqi, max: 450, unit: '', status: sportsIndoor ? 'Indoor Sports Mode' : 'Outdoor Permitted', color: '#0EA5E9', delta: `Cutoff ${s1} AQI`, good: campAqi <= 120 },
        meter2: { label: 'Campus Readiness Meter', value: readiness, max: 100, unit: '%', status: readiness >= 70 ? 'Protocol Green' : 'Upgrade Coverage', color: readiness >= 70 ? '#22C55E' : '#F59E0B', delta: `${s2}% rooms filtered`, good: readiness >= 65 },
        meter3: { label: 'Filtered Classroom Coverage', value: s2, max: 100, unit: '%', status: s2 >= 75 ? 'High Coverage' : 'Expanding', color: '#10B981', delta: sw2 ? 'No-idling ON' : 'Gate normal', good: s2 >= 60 },
        threshold: s1,
        thresholdLabel: `Sports Cutoff (${s1})`,
        chartTitle: `${city} Ambient Forecast vs Protected Campus Exposure`,
        simLabel: `Campus Exposure AQI (${campAqi})`,
        headline: `With ${s2}% filtered classrooms and ${s1} AQI sports cutoff, campus exposure averages ~${campAqi} AQI (Campus Readiness ${readiness}%).`,
        steps: [
          { phase: 'ASSEMBLY', title: sw1 ? 'Indoor Morning Briefing' : 'Review 08:00 Assembly', detail: 'Holding early briefings indoors protects students during morning boundary-layer peaks.', impact: sw1 ? '−20% morning load' : 'Recommended', status: sw1 ? 'active' : 'caution' },
          { phase: 'ATHLETICS', title: sportsIndoor ? `Indoor Gym Rule (>${s1})` : `Schedule PE Near ${cleanHr}`, detail: sportsIndoor ? `Ambient AQI (${baseAqi}) exceeds ${s1} — shift strenuous drills to filtered halls.` : `Best outdoor sports window sits around ${cleanHr}.`, impact: `Cutoff ${s1}`, status: sportsIndoor ? 'caution' : 'active' },
          { phase: 'CLASSROOMS', title: `${s2}% HEPA/MERV-13 Active`, detail: 'Prioritise junior classrooms, library, and medical/rest rooms for continuous filtration.', impact: `${s2}% covered`, status: s2 >= 60 ? 'active' : 'recommended' },
          { phase: 'GATE OPS', title: sw2 ? 'Zero-Idling Drop-Off Active' : 'Enforce Bus No-Idling', detail: 'Shutting off bus engines at pickup gates drops entrance CO and NO₂ spikes.', impact: `Readiness ${readiness}%`, status: sw2 ? 'active' : 'recommended' },
        ],
      };
    },
  },

  community: {
    badge: 'LIME CIVIC & SENSOR TRUST LAB',
    accent: '#84CC16',
    heroGrad: 'from-[#223F12] via-[#3B6D1B] to-[#1D3510]',
    heroSubtitle: 'Step minimum sensor trust filter & neighbourhood participation rate or toggle civic clean-air actions to estimate ward-level gains.',
    stepper1: { label: 'Sensor Trust Score Filter', hint: 'Minimum QA score for community nodes', min: 40, max: 95, step: 5, init: 75, unit: '%' },
    stepper2: { label: 'Ward Green-Pledge Adoption', hint: 'Share of households joining clean-air actions', min: 5, max: 80, step: 5, init: 35, unit: '%' },
    switch1: { label: 'Zero Open-Waste Burning Drive', desc: 'Rapid civic collection of dry leaves & waste', badge: '−16%', init: true, factor: 0.84 },
    switch2: { label: 'Construction Dust Netting & Mist', desc: 'Ward-level PM10 suppression compliance', badge: '−12%', init: true, factor: 0.88 },
    switch3: { label: 'Car-Free Market Evening Slot', desc: 'Pedestrian-only zone 17:00–20:00', badge: '−10%', init: false, factor: 0.9 },
    useForecast: false,
    compute: ({ baseAqi, s1, s2, sw1, sw2, sw3, city }) => {
      const adoptionScale = 0.4 + (s2 / 100) * 0.8;
      const rawDrop = ((sw1 ? 0.16 : 0) + (sw2 ? 0.12 : 0) + (sw3 ? 0.1 : 0)) * adoptionScale;
      const mult = Math.max(0.5, 1 - rawDrop);
      const wardAqi = Math.round(baseAqi * mult);
      const dropPct = Math.round(rawDrop * 100);
      return {
        multiplier: mult,
        meter1: { label: 'Modelled Ward AQI', value: wardAqi, max: 450, unit: '', status: `−${dropPct}% Local Gain`, color: '#84CC16', delta: `${s2}% participation`, good: dropPct >= 10 },
        meter2: { label: 'Network QA Confidence', value: s1, max: 100, unit: '%', status: s1 >= 75 ? 'Verified Tier' : 'Includes Flagged', color: s1 >= 75 ? '#22C55E' : '#F59E0B', delta: 'Humidity-checked', good: s1 >= 70 },
        meter3: { label: 'Civic Participation Meter', value: s2, max: 100, unit: '%', status: `${[sw1, sw2, sw3].filter(Boolean).length}/3 drives live`, color: '#14B8A6', delta: `−${dropPct}% hotspot PM`, good: s2 >= 25 },
        chartTitle: `${city} Baseline 24h AQI vs Modelled Community Action Curve`,
        simLabel: `Ward Action Curve (−${dropPct}%)`,
        headline: `At ${s2}% neighbourhood adoption and ≥${s1}% sensor QA trust, collective civic actions trim local hotspot load by an estimated ~${dropPct}% (${baseAqi} → ${wardAqi}).`,
        steps: [
          { phase: 'SENSOR QA', title: `Filter Nodes ≥ ${s1}% Trust`, detail: 'Cross-checks low-cost PM sensors against humidity spikes and nearby reference trends.', impact: `${s1}% min trust`, status: s1 >= 70 ? 'active' : 'caution' },
          { phase: 'WASTE DRIVE', title: sw1 ? 'Compost & Leaf Collection ON' : 'Launch Zero-Burn Drive', detail: 'Preventing evening leaf/waste smouldering removes sharp hyperlocal PM2.5 bursts.', impact: sw1 ? 'Active drive' : 'High impact', status: sw1 ? 'active' : 'recommended' },
          { phase: 'DUST BARRIER', title: sw2 ? 'Site Mist & Covers Active' : 'Audit Road/Site Dust', detail: 'Covering loose aggregate and damp-sweeping cuts ward PM10 near active builds.', impact: sw2 ? 'Active drive' : 'Recommended', status: sw2 ? 'active' : 'recommended' },
          { phase: 'CLEAN ZONE', title: `${s2}% Pledge Participation`, detail: `Combined civic effect estimated at −${dropPct}% on local micro-corridor peaks.`, impact: `−${dropPct}% EST.`, status: 'active' },
        ],
      };
    },
  },

  alerts: {
    badge: 'GOLD THRESHOLD SENTINEL',
    accent: '#EAB308',
    heroGrad: 'from-[#4A3A0E] via-[#7E6215] to-[#3E300B]',
    heroSubtitle: 'Step your personal AQI trigger & advance warning lead-time or toggle spike, clean-window, and quiet-hour filters to preview alert hits.',
    stepper1: { label: 'Personal AQI Trigger Line', hint: 'Alert fires whenever forecast crosses this line', min: 50, max: 400, step: 25, init: 150, unit: ' AQI' },
    stepper2: { label: 'Forecast Lead Warning', hint: 'Hours ahead of a predicted spike to notify', min: 1, max: 12, step: 1, init: 3, unit: ' hrs' },
    switch1: { label: 'Notify Clean Ventilation Windows', desc: 'Ping when AQI dips into day’s lowest slot', badge: 'CLEAN', init: true, factor: 0.88 },
    switch2: { label: 'Rapid +40 AQI Spike Detector', desc: 'Early warning before evening traffic build-up', badge: 'EARLY', init: true, factor: 0.9 },
    switch3: { label: 'Quiet Hours Digest (22:00–06:30)', desc: 'Batch non-emergency overnight alerts', badge: 'CALM', init: true, factor: 0.96 },
    useForecast: true,
    compute: ({ baseAqi, s1, s2, sw1, sw2, sw3, cleanHr, peakHr, city }) => {
      const margin = s1 - baseAqi;
      const mult = (sw1 ? 0.88 : 1) * (sw2 ? 0.9 : 1);
      const responsiveness = Math.min(100, Math.round(55 + s2 * 3 + (sw1 ? 12 : 0) + (sw2 ? 12 : 0)));
      return {
        multiplier: mult,
        meter1: { label: 'Active Trigger Threshold', value: s1, max: 450, unit: ' AQI', status: margin < 0 ? 'TRIGGERED NOW' : `${margin} AQI headroom`, color: margin < 0 ? '#EF4444' : '#EAB308', delta: `Live: ${baseAqi} AQI`, good: margin >= 0 },
        meter2: { label: 'Early-Warning Lead Time', value: s2, max: 12, unit: ' hrs', status: `Before ${peakHr} peak`, color: '#38BDF8', delta: sw2 ? 'Spike detector ON' : 'Threshold only', good: s2 >= 2 },
        meter3: { label: 'Sentinel Coverage Score', value: responsiveness, max: 100, unit: '%', status: sw3 ? 'Quiet Hours ON' : '24/7 Instant', color: '#22C55E', delta: sw1 ? `Clean ping @ ${cleanHr}` : 'Spikes only', good: true },
        threshold: s1,
        thresholdLabel: `Alert Trigger (${s1})`,
        chartTitle: `${city} 48h Forecast vs Your ${s1} AQI Alert Line`,
        simLabel: `Early-Action Exposure`,
        headline: `Your sentinel fires ${s2}h before AQI crosses ${s1} (currently ${margin < 0 ? `${Math.abs(margin)} AQI ABOVE threshold` : `${margin} AQI below threshold`}) with clean-window ping near ${cleanHr}.`,
        steps: [
          { phase: 'THRESHOLD', title: `Trigger Set at ${s1} AQI`, detail: `Yellow dashed line on the chart marks exact hours in ${city} that exceed ${s1} AQI.`, impact: margin < 0 ? 'Above line now' : 'Below line now', status: margin < 0 ? 'caution' : 'active' },
          { phase: 'LEAD TIME', title: `${s2}h Pre-Spike Head Start`, detail: `Gives you ${s2} hours before ${peakHr} to close windows and pre-run indoor filtration.`, impact: `${s2}h advance`, status: 'active' },
          { phase: 'CLEAN PING', title: sw1 ? `Ventilation Ping @ ${cleanHr}` : 'Enable Clean-Window Ping', detail: 'Positive alerts tell you when outdoor air drops low enough for fresh air and errands.', impact: sw1 ? 'Enabled' : 'Off', status: sw1 ? 'active' : 'recommended' },
          { phase: 'FATIGUE CTRL', title: sw3 ? 'Overnight Digest 22:00–06:30' : 'All-Hours Notifications', detail: 'Prevents alert fatigue while still letting severe emergency spikes break through.', impact: `Score ${responsiveness}%`, status: 'active' },
        ],
      };
    },
  },
};

export function FeatureInteractiveStudio({ variant }: { variant: FeatureStudioVariant }) {
  const { selectedCity, selectedLocation, aqiStandard } = useApp();
  const cfg = VARIANT_CONFIGS[variant];

  const [air, setAir] = useState<LiveAirBundle | null>(null);
  const [s1, setS1] = useState(cfg.stepper1.init);
  const [s2, setS2] = useState(cfg.stepper2.init);
  const [sw1, setSw1] = useState(cfg.switch1.init);
  const [sw2, setSw2] = useState(cfg.switch2.init);
  const [sw3, setSw3] = useState(cfg.switch3.init);

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ city: selectedCity });
    if (selectedLocation.lat != null && selectedLocation.lon != null) {
      qs.set('lat', String(selectedLocation.lat));
      qs.set('lon', String(selectedLocation.lon));
    }
    fetch(`/api/v1/air/live?${qs.toString()}`, {
      cache: 'no-store',
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setAir(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selectedCity, selectedLocation.lat, selectedLocation.lon]);

  const bands = aqiStandard === 'US' ? US_AQI_BANDS : IN_AQI_BANDS;
  const baseAqi = useMemo(() => {
    if (!air) return 120;
    return aqiStandard === 'US'
      ? air.current.us_aqi ?? computeUsAqi(air.current.pollutants.pm25, air.current.pollutants.pm10)
      : air.current.indian_aqi;
  }, [air, aqiStandard]);

  const calc = useMemo(
    () =>
      cfg.compute({
        baseAqi,
        pm25: air?.current.pollutants.pm25 ?? 55,
        windKph: air?.current.weather.wind_kph ?? 9,
        s1,
        s2,
        sw1,
        sw2,
        sw3,
        cleanHr: formatShortHour(air?.comparison.cleanest_window?.time) || '14:00',
        peakHr: formatShortHour(air?.comparison.peak_window?.time) || '07:00',
        city: selectedCity,
      }),
    [cfg, baseAqi, air, s1, s2, sw1, sw2, sw3, selectedCity]
  );

  const chartData = useMemo(() => {
    if (!air) return [];
    const src = cfg.useForecast ? air.forecast_72h.slice(0, 36) : air.history_48h.slice(-24);
    return src.map((p) => {
      const v = aqiStandard === 'US' ? computeUsAqi(p.pm25, p.pm10) : p.indian_aqi;
      return {
        label: formatShortHour(p.time),
        value: v,
        simulated: Math.max(5, Math.round(v * calc.multiplier)),
      };
    });
  }, [air, cfg.useForecast, aqiStandard, calc.multiplier]);

  const reset = () => {
    setS1(cfg.stepper1.init);
    setS2(cfg.stepper2.init);
    setSw1(cfg.switch1.init);
    setSw2(cfg.switch2.init);
    setSw3(cfg.switch3.init);
  };

  return (
    <div className="space-y-5">
      {/* Feature-Distinct Skyline Header + Spectrum Scale Meter */}
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br p-6 shadow-2xl',
          cfg.heroGrad
        )}
      >
        <IndianSkylineSvg className="absolute inset-x-0 bottom-0 h-24 text-black/20" />
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <LivePulseBadge isLive={air ? air.is_live : true} />
              <span
                className="rounded-md border border-white/25 bg-black/25 px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-wider text-white"
              >
                {cfg.badge}
              </span>
              <ProvenanceBadge type="ESTIMATED" compact />
            </div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset Controls
            </button>
          </div>

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <p className="max-w-2xl text-xs leading-relaxed text-white/90 sm:text-sm">
              {cfg.heroSubtitle}
            </p>
            <div className="shrink-0 rounded-2xl border border-white/25 bg-white/15 px-4 py-2 text-right backdrop-blur">
              <p className="text-[10.5px] text-white/80">{calc.meter1.label}</p>
              <p className="font-display text-2xl font-extrabold text-white">
                {calc.meter1.value}
                <span className="ml-1 text-xs font-medium text-white/80">
                  ({resolveBand(calc.meter1.value, bands).band.label})
                </span>
              </p>
            </div>
          </div>

          <SpectrumScaleBar
            value={calc.meter1.value}
            bands={bands}
            compact
          />
        </div>
      </div>

      {/* Tailored Radial Dial Meters + Interactive Steppers (−/+) & Switches */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#181F29] p-5 shadow-xl">
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-slate-300">
          <Sliders className="h-4 w-4" style={{ color: cfg.accent }} />
          <span>Interactive Feature Meters, Switches &amp; Increment/Decrement (− / +) Controls</span>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-3">
          {[calc.meter1, calc.meter2, calc.meter3].map((m) => (
            <RadialDialMeter
              key={m.label}
              size="sm"
              value={m.value}
              max={m.max}
              label={m.label}
              unit={m.unit}
              statusText={m.status}
              color={m.color}
              deltaText={m.delta}
              deltaGood={m.good}
            />
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <StepperControl
            label={cfg.stepper1.label}
            hint={cfg.stepper1.hint}
            value={s1}
            min={cfg.stepper1.min}
            max={cfg.stepper1.max}
            step={cfg.stepper1.step}
            unit={cfg.stepper1.unit}
            onChange={setS1}
            accentColor={cfg.accent}
          />
          <StepperControl
            label={cfg.stepper2.label}
            hint={cfg.stepper2.hint}
            value={s2}
            min={cfg.stepper2.min}
            max={cfg.stepper2.max}
            step={cfg.stepper2.step}
            unit={cfg.stepper2.unit}
            onChange={setS2}
            accentColor={cfg.accent}
          />
        </div>

        <div className="mt-3 grid gap-2.5 md:grid-cols-3">
          <SwitchControl
            label={cfg.switch1.label}
            description={cfg.switch1.desc}
            badge={cfg.switch1.badge}
            checked={sw1}
            onChange={setSw1}
            accentColor={cfg.accent}
          />
          <SwitchControl
            label={cfg.switch2.label}
            description={cfg.switch2.desc}
            badge={cfg.switch2.badge}
            checked={sw2}
            onChange={setSw2}
            accentColor={cfg.accent}
          />
          <SwitchControl
            label={cfg.switch3.label}
            description={cfg.switch3.desc}
            badge={cfg.switch3.badge}
            checked={sw3}
            onChange={setSw3}
            accentColor={cfg.accent}
          />
        </div>
      </div>

      {/* Live Reactive Color-Coded Bar/Line Graph + Dynamic Feature Roadmap */}
      {chartData.length > 0 && (
        <ColorCodedAirChart
          subtitle={`${cfg.badge} · Interactive Bar / Line Graph`}
          title={calc.chartTitle}
          cityLabel={selectedCity}
          metricLabel={`AQI-${aqiStandard}`}
          data={chartData}
          bands={bands}
          thresholdValue={calc.threshold}
          thresholdLabel={calc.thresholdLabel}
          simulatedLabel={calc.simLabel}
          height={245}
        />
      )}

      <DynamicRoadmapCard
        title="Interactive Feature Roadmap"
        headline={calc.headline}
        accentColor={cfg.accent}
        steps={calc.steps}
        provenance="ESTIMATED"
      />
    </div>
  );
}
