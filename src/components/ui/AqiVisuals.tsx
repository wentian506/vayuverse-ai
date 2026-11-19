'use client';

import React, { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  LineChart as LineChartIcon,
  MapPin,
  Maximize2,
  Minus,
  Plus,
  Route,
  X,
} from 'lucide-react';
import DynamicVayuMap from '@/components/maps/VayuMap';
import { cn, formatShortHour } from '@/lib/utils';
import { ProvenanceBadge } from './VayuUI';
import { ProvenanceClass } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/* 1. Threshold Band Definitions (AQI-IN, AQI-US, PM2.5, PM10, CO, SO2, NO2, O3) */
/* -------------------------------------------------------------------------- */

export interface ScaleBand {
  label: string;
  min: number;
  max: number;
  color: string;
  heroGrad: string;
}

export const IN_AQI_BANDS: ScaleBand[] = [
  { label: 'Good', min: 0, max: 50, color: '#22C55E', heroGrad: 'from-[#166E38] via-[#279B48] to-[#1D7E3C]' },
  { label: 'Satisfactory', min: 50, max: 100, color: '#84CC16', heroGrad: 'from-[#2D6A23] via-[#4C8E2C] to-[#2F6822]' },
  { label: 'Moderate', min: 100, max: 200, color: '#EAB308', heroGrad: 'from-[#5A4514] via-[#8E6B1A] to-[#634B15]' },
  { label: 'Poor', min: 200, max: 300, color: '#F97316', heroGrad: 'from-[#682E17] via-[#A64821] to-[#6E3018]' },
  { label: 'Very Poor', min: 300, max: 400, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#8F3A5B] to-[#6B2B45]' },
  { label: 'Severe', min: 400, max: 500, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
];

export const US_AQI_BANDS: ScaleBand[] = [
  { label: 'Good', min: 0, max: 50, color: '#22C55E', heroGrad: 'from-[#166E38] via-[#279B48] to-[#1D7E3C]' },
  { label: 'Moderate', min: 50, max: 100, color: '#EAB308', heroGrad: 'from-[#5A4514] via-[#8E6B1A] to-[#634B15]' },
  { label: 'Poor', min: 100, max: 150, color: '#F97316', heroGrad: 'from-[#682E17] via-[#A64821] to-[#6E3018]' },
  { label: 'Unhealthy', min: 150, max: 200, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#913C5D] to-[#6D2C46]' },
  { label: 'Severe', min: 200, max: 300, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
  { label: 'Hazardous', min: 300, max: 500, color: '#DC2626', heroGrad: 'from-[#5A1520] via-[#942030] to-[#5E1622]' },
];

export type PollutantKey = 'pm25' | 'pm10' | 'co' | 'so2' | 'no2' | 'o3';

export interface PollutantMeta {
  key: PollutantKey;
  short: string;
  fullName: string;
  unit: string;
  altUnit?: string;
  toAltUnit?: (v: number) => number;
  cpcbLimit: string;
  whatIsIt: string;
  commonSources: string;
  protectionTip: string;
  bands: ScaleBand[];
  ticks: string[];
}

export const POLLUTANT_META: Record<PollutantKey, PollutantMeta> = {
  pm25: {
    key: 'pm25',
    short: 'PM2.5',
    fullName: 'Fine Particulate Matter (PM2.5)',
    unit: 'µg/m³',
    cpcbLimit: '60 µg/m³ (24h CPCB)',
    whatIsIt: 'Inhalable fine particles ≤ 2.5 micrometres formed by combustion, secondary aerosols, and stagnant winter boundary layers.',
    commonSources: 'Vehicular exhaust, biomass & waste burning, thermal generation, cooking smoke, and regional haze transport.',
    protectionTip: 'Shift strenuous workouts to afternoon mixing hours, run indoor HEPA filtration, and use a snug N95/FFP2 respirator outdoors during elevated spells.',
    bands: [
      { label: 'Good', min: 0, max: 30, color: '#22C55E', heroGrad: 'from-[#166E38] via-[#279B48] to-[#1D7E3C]' },
      { label: 'Moderate', min: 30, max: 60, color: '#84CC16', heroGrad: 'from-[#2D6A23] via-[#4C8E2C] to-[#2F6822]' },
      { label: 'Poor', min: 60, max: 90, color: '#F59E0B', heroGrad: 'from-[#683B14] via-[#9E5A1A] to-[#6B3C14]' },
      { label: 'Unhealthy', min: 90, max: 120, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#913C5D] to-[#6D2C46]' },
      { label: 'Severe', min: 120, max: 250, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
      { label: 'Hazardous', min: 250, max: 400, color: '#DC2626', heroGrad: 'from-[#5A1520] via-[#942030] to-[#5E1622]' },
    ],
    ticks: ['0', '30', '60', '90', '120', '250', '350+'],
  },
  pm10: {
    key: 'pm10',
    short: 'PM10',
    fullName: 'Coarse Particulate Matter (PM10)',
    unit: 'µg/m³',
    cpcbLimit: '100 µg/m³ (24h CPCB)',
    whatIsIt: 'Airborne coarse particles ≤ 10 micrometres dominated by resuspended road dust, construction grit, soil, and fly ash.',
    commonSources: 'Unpaved road dust, construction activity, windblown mineral dust, brake/tyre wear, and open burning ash.',
    protectionTip: 'Avoid dusty arterial corridors during rush hours, wet-mop indoor floors instead of dry sweeping, and keep street-facing windows shut.',
    bands: [
      { label: 'Good', min: 0, max: 50, color: '#22C55E', heroGrad: 'from-[#166E38] via-[#279B48] to-[#1D7E3C]' },
      { label: 'Moderate', min: 50, max: 100, color: '#84CC16', heroGrad: 'from-[#2D6A23] via-[#4C8E2C] to-[#2F6822]' },
      { label: 'Poor', min: 100, max: 250, color: '#F97316', heroGrad: 'from-[#683017] via-[#A34B20] to-[#6B3117]' },
      { label: 'Unhealthy', min: 250, max: 350, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#913C5D] to-[#6D2C46]' },
      { label: 'Severe', min: 350, max: 430, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
      { label: 'Hazardous', min: 430, max: 600, color: '#DC2626', heroGrad: 'from-[#5A1520] via-[#942030] to-[#5E1622]' },
    ],
    ticks: ['0', '50', '100', '250', '350', '430', '500+'],
  },
  co: {
    key: 'co',
    short: 'CO',
    fullName: 'Carbon Monoxide (CO)',
    unit: 'ppb',
    altUnit: 'µg/m³',
    toAltUnit: (ppb) => Math.round(ppb * 1.145),
    cpcbLimit: '2,000 µg/m³ (~1,745 ppb, 8h CPCB)',
    whatIsIt: 'Colourless, odourless gas produced by incomplete combustion of carbon-based fuels in traffic corridors and unvented stoves.',
    commonSources: 'Idling vehicles, congested intersections, diesel/petrol generators, biomass stoves, and smouldering waste.',
    protectionTip: 'Never run generators or charcoal stoves indoors, turn on kitchen exhaust while cooking, and enable car cabin recirculation in slow traffic.',
    bands: [
      { label: 'Good', min: 0, max: 1750, color: '#22C55E', heroGrad: 'from-[#1E7F34] via-[#3CA638] to-[#2B8F36]' },
      { label: 'Moderate', min: 1750, max: 8330, color: '#84CC16', heroGrad: 'from-[#347822] via-[#5BA32A] to-[#3A7D24]' },
      { label: 'Poor', min: 8330, max: 15000, color: '#F59E0B', heroGrad: 'from-[#683E14] via-[#9E601A] to-[#6B4014]' },
      { label: 'Unhealthy', min: 15000, max: 25000, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#913C5D] to-[#6D2C46]' },
      { label: 'Severe', min: 25000, max: 35000, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
      { label: 'Hazardous', min: 35000, max: 50000, color: '#DC2626', heroGrad: 'from-[#5A1520] via-[#942030] to-[#5E1622]' },
    ],
    ticks: ['0', '1750', '8330', '15000', '25000', '35000', '50000+'],
  },
  so2: {
    key: 'so2',
    short: 'SO₂',
    fullName: 'Sulphur Dioxide (SO₂)',
    unit: 'µg/m³',
    altUnit: 'ppb',
    toAltUnit: (ug) => Math.round((ug / 2.62) * 10) / 10,
    cpcbLimit: '80 µg/m³ (24h CPCB)',
    whatIsIt: 'Reactive trace gas emitted when sulphur-containing fuels (coal, heavy oil, brick kilns) are burned; also forms secondary sulphate PM2.5.',
    commonSources: 'Coal-fired power & industrial boilers, brick kilns, diesel machinery, and heavy freight corridors.',
    protectionTip: 'Keep windows closed when downwind of industrial plumes, cross-ventilate during clean daytime wind shifts, and check wind direction on Pollution Shadow.',
    bands: [
      { label: 'Good', min: 0, max: 40, color: '#22C55E', heroGrad: 'from-[#187A42] via-[#2AA158] to-[#1D7E45]' },
      { label: 'Moderate', min: 40, max: 80, color: '#84CC16', heroGrad: 'from-[#327524] via-[#54992C] to-[#357825]' },
      { label: 'Poor', min: 80, max: 380, color: '#F59E0B', heroGrad: 'from-[#683E14] via-[#9E601A] to-[#6B4014]' },
      { label: 'Unhealthy', min: 380, max: 800, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#913C5D] to-[#6D2C46]' },
      { label: 'Severe', min: 800, max: 1600, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
      { label: 'Hazardous', min: 1600, max: 2000, color: '#DC2626', heroGrad: 'from-[#5A1520] via-[#942030] to-[#5E1622]' },
    ],
    ticks: ['0', '40', '80', '380', '800', '1600', '1600+'],
  },
  no2: {
    key: 'no2',
    short: 'NO₂',
    fullName: 'Nitrogen Dioxide (NO₂)',
    unit: 'µg/m³',
    altUnit: 'ppb',
    toAltUnit: (ug) => Math.round((ug / 1.88) * 10) / 10,
    cpcbLimit: '80 µg/m³ (24h CPCB)',
    whatIsIt: 'Reddish-brown combustion gas closely tied to peak morning/evening road traffic and gas-burner flames indoors.',
    commonSources: 'Diesel & petrol traffic peaks, highway freight, backup generators, and unvented indoor gas cooking.',
    protectionTip: 'Prefer tree-buffered parallel streets over main highways for walking/cycling, and always run kitchen exhaust when using LPG/PNG burners.',
    bands: [
      { label: 'Good', min: 0, max: 40, color: '#22C55E', heroGrad: 'from-[#16744D] via-[#219C68] to-[#187A52]' },
      { label: 'Moderate', min: 40, max: 80, color: '#EAB308', heroGrad: 'from-[#5A4514] via-[#8E6B1A] to-[#634B15]' },
      { label: 'Poor', min: 80, max: 180, color: '#F97316', heroGrad: 'from-[#682E17] via-[#A64821] to-[#6E3018]' },
      { label: 'Unhealthy', min: 180, max: 280, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#913C5D] to-[#6D2C46]' },
      { label: 'Severe', min: 280, max: 400, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
      { label: 'Hazardous', min: 400, max: 550, color: '#DC2626', heroGrad: 'from-[#5A1520] via-[#942030] to-[#5E1622]' },
    ],
    ticks: ['0', '40', '80', '180', '280', '400', '400+'],
  },
  o3: {
    key: 'o3',
    short: 'O₃',
    fullName: 'Ground-Level Ozone (O₃)',
    unit: 'µg/m³',
    altUnit: 'ppb',
    toAltUnit: (ug) => Math.round((ug / 1.96) * 10) / 10,
    cpcbLimit: '100 µg/m³ (8h CPCB)',
    whatIsIt: 'Secondary photochemical pollutant created when sunlight reacts with NOx and VOCs — typically peaking on bright, warm afternoons.',
    commonSources: 'Photochemical reaction of traffic exhaust, solvent vapours, and industrial emissions under strong afternoon sunlight.',
    protectionTip: 'When ground-level O₃ peaks in mid-afternoon (13:00–17:00), schedule vigorous outdoor exercise in cooler morning or early evening windows.',
    bands: [
      { label: 'Good', min: 0, max: 50, color: '#22C55E', heroGrad: 'from-[#176E5A] via-[#1FA080] to-[#177560]' },
      { label: 'Moderate', min: 50, max: 100, color: '#84CC16', heroGrad: 'from-[#2D6A23] via-[#4C8E2C] to-[#2F6822]' },
      { label: 'Poor', min: 100, max: 168, color: '#F97316', heroGrad: 'from-[#682E17] via-[#A64821] to-[#6E3018]' },
      { label: 'Unhealthy', min: 168, max: 208, color: '#EC487F', heroGrad: 'from-[#4B2135] via-[#913C5D] to-[#6D2C46]' },
      { label: 'Severe', min: 208, max: 400, color: '#9333EA', heroGrad: 'from-[#3B1B59] via-[#6F2DA1] to-[#4B2070]' },
      { label: 'Hazardous', min: 400, max: 600, color: '#DC2626', heroGrad: 'from-[#5A1520] via-[#942030] to-[#5E1622]' },
    ],
    ticks: ['0', '50', '100', '168', '208', '400', '500+'],
  },
};

export function resolveBand(value: number, bands: ScaleBand[]): { band: ScaleBand; pct: number } {
  const v = Math.max(0, Number.isFinite(value) ? value : 0);
  const segWidth = 100 / bands.length;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (v <= b.max || i === bands.length - 1) {
      const span = Math.max(1, b.max - b.min);
      const frac = Math.min(1, Math.max(0, (v - b.min) / span));
      return { band: b, pct: Math.min(98.5, Math.max(1.5, i * segWidth + frac * segWidth)) };
    }
  }
  return { band: bands[0], pct: 2 };
}

/* -------------------------------------------------------------------------- */
/* 2. Iconic Indian Architectural Skyline Silhouette SVG                      */
/* -------------------------------------------------------------------------- */

export function IndianSkylineSvg({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 170"
      fill="currentColor"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('pointer-events-none w-full select-none', className)}
    >
      {/* Base horizon */}
      <rect x="0" y="160" width="1200" height="10" />
      {/* India Gate (left) */}
      <path d="M55 160V98h-6v-8h10v-8h48v8h10v8h-6v62H95v-38c0-10-6-16-12-16s-12 6-12 16v38H55z" />
      <rect x="135" y="128" width="42" height="32" rx="2" />
      <rect x="148" y="114" width="16" height="14" />
      {/* Heritage Temple Pavilion */}
      <path d="M205 160v-42h12v-14l16-14 16 14v14h16v-20l22-22 22 22v20h16v-14l16-14 16 14v14h12v42H205z" />
      {/* Taj Mahal Silhouette (center-left) */}
      <rect x="415" y="88" width="7" height="72" />
      <circle cx="418.5" cy="84" r="5" />
      <path d="M442 160v-46h24v-8c0-10 8-16 14-18 6 2 14 8 14 18v8h10v-14c0-24 18-40 31-52 13 12 31 28 31 52v14h10v-8c0-10 8-16 14-18 6 2 14 8 14 18v8h24v46H442z" />
      <rect x="533" y="34" width="4" height="16" />
      <rect x="646" y="88" width="7" height="72" />
      <circle cx="649.5" cy="84" r="5" />
      {/* Lotus Temple (center-right) */}
      <path d="M690 160c4-24 16-40 32-46-2 14 0 28 6 46h-38z" />
      <path d="M722 160c2-32 16-54 28-64 12 10 26 32 28 64h-56z" />
      <path d="M772 160c6-18 8-32 6-46 16 6 28 22 32 46h-38z" />
      {/* Charminar */}
      <path d="M842 160V76l6-12 6 12v32h52V76l6-12 6 12v84h-16v-28c0-12-9-20-22-20s-22 8-22 20v28h-16z" />
      {/* Qutub Minar */}
      <polygon points="952,160 960,42 972,42 980,160" />
      <rect x="956" y="72" width="20" height="4" />
      <rect x="954" y="104" width="24" height="4" />
      <rect x="952" y="132" width="28" height="4" />
      {/* Modern skyline right */}
      <rect x="1015" y="108" width="32" height="52" />
      <rect x="1055" y="92" width="28" height="68" />
      <rect x="1092" y="118" width="38" height="42" />
      <rect x="1140" y="102" width="30" height="58" />
      {/* Subtle flying birds */}
      <path d="M1010 56c4-4 8-4 11 0 3-4 7-4 11 0" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M1038 46c3-3 6-3 9 0 3-3 6-3 9 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Live Red Pulse Badge                                                    */
/* -------------------------------------------------------------------------- */

export function LivePulseBadge({ isLive = true, label }: { isLive?: boolean; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider shadow-sm',
        isLive
          ? 'bg-[#E53935] text-white shadow-red-900/40'
          : 'border border-amber-400/40 bg-amber-500/20 text-amber-200'
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', isLive ? 'bg-white animate-pulse' : 'bg-amber-300')} />
      {label || (isLive ? 'LIVE' : 'SAMPLE FALLBACK')}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. 6-Segment Horizontal Spectrum Scale Meter (image-3 & image-6 style)     */
/* -------------------------------------------------------------------------- */

export function SpectrumScaleBar({
  value,
  bands,
  ticks,
  compact = false,
  className = '',
}: {
  value: number;
  bands: ScaleBand[];
  ticks?: string[];
  compact?: boolean;
  className?: string;
}) {
  const { band, pct } = resolveBand(value, bands);
  const autoTicks = ticks || [...bands.map((b) => String(b.min)), `${bands[bands.length - 1].max}+`];

  return (
    <div className={cn('w-full select-none', className)}>
      {/* Category labels */}
      <div
        className={cn(
          'mb-1.5 grid text-center font-medium text-white/85',
          compact ? 'text-[9.5px]' : 'text-[10.5px] sm:text-xs'
        )}
        style={{ gridTemplateColumns: `repeat(${bands.length}, minmax(0, 1fr))` }}
      >
        {bands.map((b) => (
          <span
            key={b.label}
            className={cn('truncate px-0.5', b.label === band.label && 'font-bold text-white')}
          >
            {b.label}
          </span>
        ))}
      </div>

      {/* Segmented color bar + live indicator dot */}
      <div className="relative flex h-2 w-full overflow-visible rounded-full bg-black/25">
        {bands.map((b, i) => (
          <div
            key={b.label}
            className={cn(
              'h-full flex-1',
              i === 0 && 'rounded-l-full',
              i === bands.length - 1 && 'rounded-r-full'
            )}
            style={{ backgroundColor: b.color }}
          />
        ))}
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_12px_rgba(255,255,255,0.85)] transition-all duration-500"
          style={{ left: `${pct}%`, backgroundColor: band.color }}
          title={`${Math.round(value * 10) / 10} (${band.label})`}
        />
      </div>

      {/* Numeric scale ticks */}
      <div className="mt-1.5 flex justify-between font-mono text-[9.5px] text-white/75 sm:text-[10.5px]">
        {autoTicks.map((t, i) => (
          <span key={`${t}-${i}`}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Radial Speedometer / Arc Gauge Meter                                    */
/* -------------------------------------------------------------------------- */

export function RadialDialMeter({
  value,
  min = 0,
  max = 500,
  label,
  unit = '',
  statusText,
  color = '#21D4E8',
  deltaText,
  deltaGood = true,
  size = 'md',
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  unit?: string;
  statusText?: string;
  color?: string;
  deltaText?: string;
  deltaGood?: boolean;
  size?: 'sm' | 'md';
}) {
  const safeVal = Number.isFinite(value) ? value : 0;
  const ratio = Math.min(1, Math.max(0, (safeVal - min) / Math.max(1, max - min)));
  const r = 56;
  const halfCirc = Math.PI * r;
  const dashOffset = halfCirc * (1 - ratio);
  // Needle tip angle from 180° (left) to 0° (right)
  const angle = Math.PI * (1 - ratio);
  const cx = 72 + r * Math.cos(angle);
  const cy = 74 - r * Math.sin(angle);

  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/[0.08] bg-[#141C27]/90 p-4 text-center shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className={cn('relative mt-1', size === 'sm' ? 'w-36' : 'w-44')}>
        <svg viewBox="0 0 144 86" className="w-full overflow-visible">
          <path
            d="M 16 74 A 56 56 0 0 1 128 74"
            fill="none"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 16 74 A 56 56 0 0 1 128 74"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={halfCirc}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 0.45s ease, stroke 0.35s ease', filter: `drop-shadow(0 0 8px ${color}66)` }}
          />
          <circle
            cx={cx}
            cy={cy}
            r="5.5"
            fill="#ffffff"
            stroke={color}
            strokeWidth="3"
            style={{ transition: 'cx 0.45s ease, cy 0.45s ease' }}
          />
        </svg>
        <div className="absolute inset-x-0 bottom-0.5 flex flex-col items-center">
          <span className="font-display text-2xl font-bold leading-none text-white">
            {Number.isInteger(safeVal) ? safeVal : safeVal.toFixed(1)}
            {unit && <span className="ml-0.5 text-xs font-medium text-slate-400">{unit}</span>}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
        {statusText && (
          <span
            className="rounded-md px-2 py-0.5 text-[10.5px] font-bold"
            style={{ backgroundColor: `${color}24`, color }}
          >
            {statusText}
          </span>
        )}
        {deltaText && (
          <span
            className={cn(
              'rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold',
              deltaGood ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            )}
          >
            {deltaText}
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Interactive Increment / Decrement Stepper + Slider & Toggle Switch      */
/* -------------------------------------------------------------------------- */

export function StepperControl({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  formatValue,
  onChange,
  accentColor = '#3898FF',
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  formatValue?: (v: number) => string;
  onChange: (next: number) => void;
  accentColor?: string;
  hint?: string;
}) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 100) / 100));
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 100) / 100));
  const shown = formatValue ? formatValue(value) : `${value}${unit}`;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111822] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-200">{label}</p>
          {hint && <p className="text-[10.5px] text-slate-400">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={dec}
            disabled={value <= min}
            aria-label={`Decrease ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-35"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span
            className="min-w-[66px] rounded-lg px-2 py-1 text-center font-mono text-xs font-bold text-white"
            style={{ backgroundColor: `${accentColor}26`, border: `1px solid ${accentColor}55` }}
          >
            {shown}
          </span>
          <button
            type="button"
            onClick={inc}
            disabled={value >= max}
            aria-label={`Increase ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-35"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2.5 h-1.5 w-full cursor-pointer rounded-lg"
        style={{ accentColor }}
      />
    </div>
  );
}

export function SwitchControl({
  label,
  description,
  checked,
  onChange,
  accentColor = '#12BFA5',
  badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  accentColor?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition',
        checked ? 'border-white/25 bg-white/[0.07]' : 'border-white/[0.08] bg-[#111822] hover:border-white/15'
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white">{label}</span>
          {badge && (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold"
              style={{ backgroundColor: `${accentColor}28`, color: accentColor }}
            >
              {badge}
            </span>
          )}
        </div>
        {description && <p className="mt-0.5 text-[10.5px] text-slate-400">{description}</p>}
      </div>
      <span
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors"
        style={{ backgroundColor: checked ? accentColor : 'rgba(148,163,184,0.28)' }}
      >
        <span
          className={cn(
            'h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. Color-Coded Bar / Line Chart with Min/Max & What-If Overlay (image-4)   */
/* -------------------------------------------------------------------------- */

export interface ColoredChartPoint {
  label: string;
  fullTime?: string;
  value: number;
  simulated?: number;
}

export function ColorCodedAirChart({
  title,
  subtitle,
  cityLabel,
  metricLabel,
  unit = '',
  data,
  bands,
  defaultMode = 'bar',
  thresholdValue,
  thresholdLabel,
  simulatedLabel,
  rightSlot,
  height = 290,
}: {
  title: string;
  subtitle?: string;
  cityLabel: string;
  metricLabel: string;
  unit?: string;
  data: ColoredChartPoint[];
  bands: ScaleBand[];
  defaultMode?: 'bar' | 'line';
  thresholdValue?: number;
  thresholdLabel?: string;
  simulatedLabel?: string;
  rightSlot?: React.ReactNode;
  height?: number;
}) {
  const [chartMode, setChartMode] = useState<'bar' | 'line'>(defaultMode);

  const stats = useMemo(() => {
    if (!data.length) return null;
    let minPt = data[0];
    let maxPt = data[0];
    for (const pt of data) {
      if (pt.value < minPt.value) minPt = pt;
      if (pt.value > maxPt.value) maxPt = pt;
    }
    return {
      minPt,
      maxPt,
      minColor: resolveBand(minPt.value, bands).band.color,
      maxColor: resolveBand(maxPt.value, bands).band.color,
    };
  }, [data, bands]);

  const hasSimulated = data.some((d) => typeof d.simulated === 'number');

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#181F29]/95 p-5 sm:p-6 shadow-xl">
      {/* Header + Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400">{subtitle || `${metricLabel} Graph`}</p>
          <h3 className="font-display text-lg font-bold text-white sm:text-xl">{title}</h3>
          <p className="text-xs font-semibold text-[#4DA3FF]">{cityLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/15 bg-[#11161E] p-1">
            <button
              type="button"
              onClick={() => setChartMode('line')}
              aria-label="Line chart view"
              className={cn(
                'rounded-lg p-1.5 transition',
                chartMode === 'line' ? 'bg-[#3898FF] text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              <LineChartIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setChartMode('bar')}
              aria-label="Bar chart view"
              className={cn(
                'rounded-lg p-1.5 transition',
                chartMode === 'bar' ? 'bg-[#3898FF] text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              <BarChart2 className="h-4 w-4" />
            </button>
          </div>
          {rightSlot}
        </div>
      </div>

      {/* City Chip + Min / Max Pills (exact image-4 style) */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-[#121820] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            {cityLabel}
          </span>
          {hasSimulated && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-vayu-cyan/40 bg-vayu-cyan/10 px-2.5 py-1 text-[11px] font-semibold text-vayu-cyan">
              <span className="h-0.5 w-3.5 bg-vayu-cyan" />
              {simulatedLabel || 'Adjusted What-If Projection'}
            </span>
          )}
        </div>

        {stats && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#1B222D] px-3 py-1.5">
              <span
                className="rounded-lg px-2.5 py-1 font-display text-sm font-bold text-white"
                style={{ backgroundColor: stats.minColor }}
              >
                {Math.round(stats.minPt.value * 10) / 10}
              </span>
              <div className="text-[11px] leading-tight">
                <p className="font-semibold text-emerald-400">↓ Min. {metricLabel}</p>
                <p className="text-slate-400">at {stats.minPt.label}</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#1B222D] px-3 py-1.5">
              <span
                className="rounded-lg px-2.5 py-1 font-display text-sm font-bold text-white"
                style={{ backgroundColor: stats.maxColor }}
              >
                {Math.round(stats.maxPt.value * 10) / 10}
              </span>
              <div className="text-[11px] leading-tight">
                <p className="font-semibold text-rose-400">↑ Max. {metricLabel}</p>
                <p className="text-slate-400">at {stats.maxPt.label}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart Canvas */}
      <div className="mt-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} barCategoryGap="18%">
            <defs>
              <linearGradient id="vayuDynamicArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EC487F" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3898FF" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} minTickGap={22} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              contentStyle={{
                backgroundColor: '#1B2330',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '12px',
                fontSize: '12px',
                color: '#fff',
              }}
              labelStyle={{ color: '#F8FAFC', fontWeight: 700, marginBottom: 4 }}
              itemStyle={{ color: '#E2E8F0' }}
              formatter={(val: unknown, name: unknown) => [
                `${val}${unit ? ` ${unit}` : ''}`,
                String(name),
              ]}
            />
            {chartMode === 'bar' ? (
              <Bar dataKey="value" name={`${cityLabel} (${metricLabel})`} radius={[4, 4, 0, 0]}>
                {data.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={resolveBand(entry.value, bands).band.color} />
                ))}
              </Bar>
            ) : (
              <Area
                type="monotone"
                dataKey="value"
                name={`${cityLabel} (${metricLabel})`}
                stroke="#EC487F"
                strokeWidth={2.6}
                fill="url(#vayuDynamicArea)"
              />
            )}
            {hasSimulated && (
              <Line
                type="monotone"
                dataKey="simulated"
                name={simulatedLabel || 'What-If Adjusted'}
                stroke="#21D4E8"
                strokeWidth={2.6}
                dot={false}
                strokeDasharray="5 3"
              />
            )}
            {typeof thresholdValue === 'number' && (
              <ReferenceLine
                y={thresholdValue}
                stroke="#FACC15"
                strokeDasharray="5 4"
                strokeWidth={1.8}
                label={{
                  value: thresholdLabel || `Threshold: ${thresholdValue}`,
                  fill: '#FACC15',
                  fontSize: 11,
                  position: 'insideTopRight',
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. Horizontal Multi-Window Trend & Rise/Fall Summary (image-5 style)       */
/* -------------------------------------------------------------------------- */

export function HorizontalTrendAnalysis({
  title,
  cityLabel,
  metricLabel,
  unit = '',
  hourlyPoints,
  bands,
}: {
  title: string;
  cityLabel: string;
  metricLabel: string;
  unit?: string;
  hourlyPoints: { time: string; value: number }[];
  bands: ScaleBand[];
}) {
  // Group genuine retrieved hourly points into 6-hour atmospheric windows for Rise/Fall comparison
  const windows = useMemo(() => {
    if (hourlyPoints.length < 12) return [];
    const chunkSize = Math.max(4, Math.floor(hourlyPoints.length / 7));
    const out: { label: string; avg: number; deltaPct: number | null; color: string }[] = [];
    for (let i = 0; i < hourlyPoints.length; i += chunkSize) {
      const slice = hourlyPoints.slice(i, i + chunkSize);
      if (slice.length < 2) continue;
      const avg = Math.round((slice.reduce((a, b) => a + b.value, 0) / slice.length) * 10) / 10;
      const prev = out.length > 0 ? out[out.length - 1].avg : null;
      const deltaPct = prev && prev > 0 ? Math.round(((avg - prev) / prev) * 100) : null;
      const tStart = formatShortHour(slice[0].time);
      const dTag = slice[0].time.slice(5, 10);
      out.push({
        label: `${dTag} ${tStart}`,
        avg,
        deltaPct,
        color: resolveBand(avg, bands).band.color,
      });
    }
    return out.slice(0, 7);
  }, [hourlyPoints, bands]);

  const bars = hourlyPoints.slice(-36);
  const maxBar = Math.max(1, ...bars.map((b) => b.value));
  const overallChange =
    windows.length >= 2 && windows[0].avg > 0
      ? Math.round(((windows[windows.length - 1].avg - windows[0].avg) / windows[0].avg) * 100)
      : 0;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#181F29]/95 p-5 sm:p-6 shadow-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold text-white sm:text-xl">{title}</h3>
          <p className="text-xs font-semibold text-[#4DA3FF]">{cityLabel}</p>
        </div>
        <ProvenanceBadge type="MODEL FORECAST" compact />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left: Dense Horizontal Spectrum Bars (image-5 aesthetic) */}
        <div className="rounded-xl border border-white/[0.06] bg-[#131922] p-4 lg:col-span-8">
          <p className="mb-2.5 font-mono text-[10.5px] uppercase tracking-wider text-slate-400">
            Hourly {metricLabel} Intensity Distribution (Last &amp; Upcoming Hours)
          </p>
          <div className="space-y-1">
            {bars.map((b, idx) => {
              const widthPct = Math.max(6, Math.min(100, (b.value / maxBar) * 100));
              const col = resolveBand(b.value, bands).band.color;
              return (
                <div key={`${b.time}-${idx}`} className="group flex items-center gap-2">
                  <span className="w-11 shrink-0 font-mono text-[9px] text-slate-500 group-hover:text-slate-200">
                    {idx % 4 === 0 ? formatShortHour(b.time) : ''}
                  </span>
                  <div className="h-2 flex-1 rounded-r bg-white/[0.03]">
                    <div
                      className="h-full rounded-r transition-all duration-300 group-hover:brightness-125"
                      style={{ width: `${widthPct}%`, backgroundColor: col }}
                      title={`${b.time}: ${b.value} ${unit}`}
                    />
                  </div>
                  <span className="hidden w-10 text-right font-mono text-[9.5px] text-slate-400 group-hover:inline">
                    {Math.round(b.value)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Window-by-Window Rise / Fall Breakdown (image-5 right panel) */}
        <div className="flex flex-col justify-between rounded-xl border border-white/[0.06] bg-[#1E2633] p-4 lg:col-span-4">
          <div>
            <p className="font-display text-sm font-bold text-white">Multi-Window {metricLabel} Trends</p>
            <div className="mt-3 space-y-2.5">
              {windows.map((w) => {
                const maxW = Math.max(1, ...windows.map((x) => x.avg));
                const wPct = Math.max(18, Math.round((w.avg / maxW) * 100));
                return (
                  <div key={w.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="w-20 shrink-0 font-mono text-[10.5px] text-slate-300">{w.label}</span>
                    <div className="flex-1">
                      <div
                        className="h-3.5 rounded-sm transition-all"
                        style={{ width: `${wPct}%`, backgroundColor: w.color }}
                      />
                    </div>
                    <span className="w-10 text-right font-mono text-xs font-bold text-white">{w.avg}</span>
                    <span className="w-16 text-right text-[10.5px] font-semibold">
                      {w.deltaPct === null ? (
                        <span className="text-slate-500">Base</span>
                      ) : w.deltaPct > 0 ? (
                        <span className="inline-flex items-center text-rose-400">
                          +{w.deltaPct}% <ArrowUpRight className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-emerald-400">
                          {w.deltaPct}% <ArrowDownRight className="h-3 w-3" />
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-3 text-xs">
            <p className="text-slate-400">Net Trajectory Across Retrieved Horizon</p>
            <div className="mt-1 flex items-center justify-between font-bold">
              <span className="text-white">{overallChange > 0 ? `+${overallChange}%` : `${overallChange}%`}</span>
              <span className={overallChange <= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                {overallChange <= 0 ? `↘ Fall (Improving ${metricLabel})` : `↗ Rise (Watch Peak Hours)`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 9. Dynamic Reactive Action & Impact Roadmap Card                           */
/* -------------------------------------------------------------------------- */

export interface RoadmapStep {
  phase: string;
  title: string;
  detail: string;
  impact?: string;
  status?: 'active' | 'recommended' | 'caution';
}

export function DynamicRoadmapCard({
  title = 'Dynamic Action Roadmap',
  headline,
  accentColor = '#21D4E8',
  steps,
  provenance = 'ESTIMATED',
}: {
  title?: string;
  headline: string;
  accentColor?: string;
  steps: RoadmapStep[];
  provenance?: ProvenanceClass;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-[#161E29]/95 p-5 sm:p-6 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accentColor}22`, color: accentColor }}
          >
            <Route className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-bold text-white sm:text-lg">{title}</h3>
            <p className="text-xs text-slate-300">{headline}</p>
          </div>
        </div>
        <ProvenanceBadge type={provenance} compact />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, idx) => {
          const badgeCol =
            s.status === 'caution' ? '#F97316' : s.status === 'active' ? '#22C55E' : accentColor;
          return (
            <div
              key={`${s.phase}-${idx}`}
              className="relative flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#10161F] p-3.5 transition"
              style={{ borderTopWidth: '2px', borderTopColor: badgeCol }}
            >
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider" style={{ color: badgeCol }}>
                    0{idx + 1} · {s.phase}
                  </span>
                  <CheckCircle2 className="h-3.5 w-3.5" style={{ color: badgeCol }} />
                </div>
                <p className="mt-1.5 font-display text-sm font-bold text-white">{s.title}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-slate-300">{s.detail}</p>
              </div>
              {s.impact && (
                <p
                  className="mt-2.5 inline-block self-start rounded-md px-2 py-0.5 font-mono text-[10px] font-bold"
                  style={{ backgroundColor: `${badgeCol}20`, color: badgeCol }}
                >
                  {s.impact}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 10. Compact AQI Bubble Map Preview Card (image-1, image-3, image-6 style)  */
/* -------------------------------------------------------------------------- */

export interface CityBubbleItem {
  city: string;
  lat: number;
  lon: number;
  aqi: number;
  category: string;
  color: string;
  pm25?: number | null;
}

const BUBBLE_SLOTS: [number, number][] = [
  [26, 28],
  [54, 44],
  [36, 70],
  [68, 24],
  [22, 58],
  [66, 68],
  [46, 18],
  [78, 48],
];

export function MiniAqiMapCard({
  activeCity,
  cities,
  onSelectCity,
  onPickCoordinates,
  center = [30.901, 75.857],
  className = '',
}: {
  activeCity: string;
  cities: CityBubbleItem[];
  onSelectCity?: (city: string) => void;
  onPickCoordinates?: (lat: number, lon: number) => void;
  center?: [number, number];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        className={cn(
          'relative flex min-h-[250px] flex-col justify-between overflow-hidden rounded-3xl border border-white/15 p-4 shadow-xl',
          'bg-gradient-to-br from-[#F6E4EA] via-[#EFC2D2] to-[#E57399]',
          className
        )}
      >
        {/* Subtle stylized road grid SVG */}
        <svg
          viewBox="0 0 240 280"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-35"
          aria-hidden="true"
        >
          <path d="M0 40 L240 95 M0 130 L240 70 M30 0 L95 280 M155 0 L110 280 M0 210 L240 185 M190 0 L220 280" stroke="#94a3b8" strokeWidth="2" fill="none" />
          <path d="M10 85 Q120 120 235 35 M45 275 Q115 160 230 140" stroke="#f59e0b" strokeWidth="2.5" strokeOpacity="0.55" fill="none" />
        </svg>

        {/* Top AQI Map Expand Pill */}
        <div className="relative z-10 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#161D26]/90 px-3 py-1.5 text-xs font-bold text-white shadow-lg backdrop-blur transition hover:scale-105"
          >
            <span className="text-[#3898FF]">AQI</span>
            <span>Map</span>
            <Maximize2 className="h-3.5 w-3.5 text-slate-300" />
          </button>
        </div>

        {/* Live Color-Coded City AQI Bubbles */}
        <div className="relative z-10 my-2 h-40 w-full">
          {cities.slice(0, 8).map((c, idx) => {
            const [top, left] = BUBBLE_SLOTS[idx % BUBBLE_SLOTS.length];
            const isSelected = c.city === activeCity;
            return (
              <button
                key={c.city}
                type="button"
                onClick={() => (onSelectCity ? onSelectCity(c.city) : setExpanded(true))}
                title={`${c.city}: Live AQI ${c.aqi} (${c.category})`}
                style={{ top: `${top}%`, left: `${left}%`, backgroundColor: c.color }}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full font-mono text-[11px] font-bold text-white shadow-md transition hover:scale-115 hover:z-20',
                  isSelected && 'h-11 w-11 ring-3 ring-white shadow-xl z-20'
                )}
              >
                {c.aqi}
              </button>
            );
          })}
        </div>

        {/* Bottom Location Label */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="relative z-10 inline-flex items-center gap-1.5 text-left text-sm font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)]"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{activeCity}</span>
        </button>
      </div>

      {/* Fullscreen Interactive OpenStreetMap Modal */}
      {expanded && (
        <div
          className="fixed inset-0 z-[9500] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl rounded-3xl border border-white/15 bg-[#141B24] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white">
                  Interactive Live Air Quality Map — {activeCity}
                </h3>
                <p className="text-xs text-slate-400">
                  Click any city bubble or click anywhere on the map to load real-time AQI, 6 pollutants, weather &amp; graphs for that spot.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close map"
                className="rounded-xl border border-white/15 bg-white/5 p-2 text-slate-300 hover:bg-white/15 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <DynamicVayuMap
              center={center}
              zoom={6}
              height={460}
              scrollWheelZoom
              pickedLocation={center}
              clickHint="Click anywhere on the map to check live air quality & update dashboard graphs"
              onMapClick={(lat, lon) => {
                if (onPickCoordinates) {
                  onPickCoordinates(lat, lon);
                  setExpanded(false);
                }
              }}
              onMarkerClick={(m) => {
                if (onSelectCity) {
                  onSelectCity(m.id);
                  setExpanded(false);
                }
              }}
              markers={cities.map((c) => ({
                id: c.city,
                lat: c.lat,
                lon: c.lon,
                title: `${c.city} — AQI ${c.aqi} (${c.category})`,
                subtitle: `PM2.5: ${c.pm25 ?? '—'} µg/m³ · Open-Meteo CAMS Regional Feed`,
                badge: 'MODEL FORECAST + NAQI EST.',
                value: String(c.aqi),
                color: c.color,
                kind: 'city',
              }))}
            />
          </div>
        </div>
      )}
    </>
  );
}
