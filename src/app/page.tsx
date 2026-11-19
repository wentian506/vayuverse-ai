'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Cloud,
  Droplets,
  Eye,
  Gauge,
  Globe2,
  GraduationCap,
  HeartHandshake,
  Home,
  Layers,
  LineChart,
  MapPin,
  Maximize2,
  Menu,
  Play,
  Radar,
  RefreshCw,
  Route,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Users,
  Wind,
  X,
} from 'lucide-react';
import { ProvenanceBadge, VayuLogo } from '@/components/ui/VayuUI';
import {
  IN_AQI_BANDS,
  RadialDialMeter,
  resolveBand,
  SpectrumScaleBar,
  US_AQI_BANDS,
} from '@/components/ui/AqiVisuals';
import { useApp } from '@/components/providers/AppProvider';
import { LiveAirBundle } from '@/lib/types';
import { cn, computeUsAqi, formatIstTime, formatShortHour } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Types & India Regional Mapping                                             */
/* -------------------------------------------------------------------------- */

interface NetworkCityRecord {
  city: string;
  state: string;
  lat: number;
  lon: number;
  nearest_station?: string;
  operator?: string;
  observed_time_ist?: string;
  indian_aqi: number;
  category: string;
  color: string;
  dominant_pollutant?: string;
  pm25: number | null;
  pm10: number | null;
  no2?: number | null;
  o3?: number | null;
  provenance?: string;
  source?: string;
}

type IndiaRegion = 'All' | 'North' | 'West' | 'South' | 'East';

const CITY_REGION: Record<string, Exclude<IndiaRegion, 'All'>> = {
  Ludhiana: 'North',
  'New Delhi': 'North',
  Chandigarh: 'North',
  Amritsar: 'North',
  Jalandhar: 'North',
  Patiala: 'North',
  Jaipur: 'North',
  Lucknow: 'North',
  Noida: 'North',
  Gurugram: 'North',
  Shimla: 'North',
  Dehradun: 'North',
  Srinagar: 'North',
  Agra: 'North',
  Varanasi: 'North',
  Kanpur: 'North',
  Ahmedabad: 'West',
  Mumbai: 'West',
  Pune: 'West',
  Surat: 'West',
  Nagpur: 'West',
  Indore: 'West',
  Bhopal: 'West',
  Panaji: 'West',
  Bengaluru: 'South',
  Hyderabad: 'South',
  Chennai: 'South',
  Kochi: 'South',
  Coimbatore: 'South',
  Visakhapatnam: 'South',
  Kolkata: 'East',
  Patna: 'East',
  Ranchi: 'East',
  Raipur: 'East',
  Bhubaneswar: 'East',
  Guwahati: 'East',
};

const HOW_IT_WORKS_STEPS = [
  {
    id: 'observe',
    code: '01 · OBSERVE & INTERPRET',
    title: 'Ingest Live India & Global Air Telemetry',
    desc: 'Continuously pulls live PM2.5, PM10, CO, SO₂, NO₂, O₃, UV, wind, humidity, and temperature feeds across 36+ Indian hubs and any city worldwide — calculating both Indian CPCB NAQI and US EPA AQI.',
    metric: 'All Cities · 60s Live Sync',
    icon: Eye,
  },
  {
    id: 'predict',
    code: '02 · PREDICT 72H SHADOW',
    title: 'Forecast Plume Spikes & Clean Windows',
    desc: 'Maps upcoming 48–72 hour pollution trajectories, boundary-layer inversions, and wind drift so you spot the cleanest hour of the day before stepping out.',
    metric: '72h Predictive Horizon',
    icon: Radar,
  },
  {
    id: 'simulate',
    code: '03 · SIMULATE WITH METERS & SWITCHES',
    title: 'Flip Controls, Watch Graphs Respond',
    desc: 'Open any of 14 feature-themed dashboard views, toggle N95/HEPA/transit switches or tap − / + steppers, and see radial meters and graphs shift in real time.',
    metric: '14 Themed Interactive Views',
    icon: Sliders,
  },
  {
    id: 'act',
    code: '04 · ACT & VERIFY IMPACT',
    title: 'Follow Dynamic Roadmaps & Log Savings',
    desc: 'Turns every graph into a clear 4-step non-medical roadmap for you, your home, family, campus, or ward — with exportable briefings and provenance stamps.',
    metric: 'Provenance-Stamped Ledger',
    icon: ShieldCheck,
  },
];

const SCALE_CARDS = [
  {
    tag: 'INDIVIDUALS & COMMUTERS',
    title: 'Daily Exposure & Mobility',
    desc: '72h Pollution Shadow drift, Future Me habit twin, low-exposure route comparison, and 24-hour activity replanning aligned to your city’s cleanest air slot.',
    highlights: ['72h Plume Forecast', 'Route CO₂ & AQI Matrix', '24h Routine Replanner'],
    accent: '#F97316',
    gradient: 'radial-gradient(circle at 30% 25%, rgba(249,115,22,0.42), rgba(15,23,42,0.92) 62%, #070A10 100%)',
    icon: Route,
  },
  {
    tag: 'HOMES & HOUSEHOLDS',
    title: 'Indoor Sanctuary & Family Care',
    desc: 'Model room purifier CADR clean-down time, time cross-ventilation safely, and set custom household AQI alert lines for children, elders, and school runs.',
    highlights: ['Room CADR Digital Twin', 'Family Alert Steppers', 'Smart Ventilation Windows'],
    accent: '#3898FF',
    gradient: 'radial-gradient(circle at 50% 22%, rgba(56,152,255,0.45), rgba(14,32,58,0.92) 62%, #070A10 100%)',
    icon: HeartHandshake,
  },
  {
    tag: 'CAMPUSES & COMMUNITIES',
    title: 'School Readiness & Civic Trust',
    desc: 'Guide outdoor sports AQI cutoffs, classroom filtration coverage, community sensor QA confidence scoring, and constructive, moderated civic incident reports.',
    highlights: ['Campus Sports Cutoffs', 'Sensor QA Trust Meters', 'Civic Signal Reporting'],
    accent: '#10B981',
    gradient: 'radial-gradient(circle at 70% 25%, rgba(16,185,129,0.42), rgba(12,38,34,0.92) 62%, #070A10 100%)',
    icon: GraduationCap,
  },
];

/* -------------------------------------------------------------------------- */
/* Mouse-Tracking Glow Card (REDSUN dynamic spotlight effect)                 */
/* -------------------------------------------------------------------------- */

function SpotlightCard({
  children,
  className = '',
  glowColor = 'rgba(249, 115, 22, 0.22)',
}: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; active: boolean }>({
    x: 50,
    y: 50,
    active: false,
  });

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
      active: true,
    });
  };

  return (
    <div
      onMouseMove={onMove}
      onMouseLeave={() => setPos((p) => ({ ...p, active: false }))}
      className={cn(
        'group relative overflow-hidden rounded-3xl border border-white/[0.09] bg-[#0B0E15] transition-all duration-300 hover:border-[#F97316]/40',
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: pos.active ? 1 : 0,
          background: `radial-gradient(380px circle at ${pos.x}% ${pos.y}%, ${glowColor}, transparent 68%)`,
        }}
      />
      {/* Subtle warm inner rim */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Compact SVG Sparkline for Top KPI Cards                                    */
/* -------------------------------------------------------------------------- */

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 96 + 2;
      const y = 30 - ((v - min) / span) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 34" className="h-8 w-24 shrink-0 overflow-visible" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Landing Page                                                          */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
  const {
    user,
    aqiStandard,
    setAqiStandard,
    toast,
  } = useApp();

  const [mobileMenu, setMobileMenu] = useState(false);

  // Always-live Overall India + Spotlight City state
  const [network, setNetwork] = useState<NetworkCityRecord[]>([]);
  const [networkLive, setNetworkLive] = useState(true);
  const [spotlightCity, setSpotlightCity] = useState('New Delhi');
  const [spotlightAir, setSpotlightAir] = useState<LiveAirBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(60);

  // Interactive India Situation filters & chart modes
  const [regionFilter, setRegionFilter] = useState<IndiaRegion>('All');
  const [graphMode, setGraphMode] = useState<'cities' | 'regions' | 'hourly'>('cities');
  const [hourlyStyle, setHourlyStyle] = useState<'bar' | 'area'>('bar');

  // Interactive Dynamic Bento Card mini-controls
  const [miniMask, setMiniMask] = useState(true);
  const [miniHepa, setMiniHepa] = useState(true);
  const [miniCleanSlot, setMiniCleanSlot] = useState(false);
  const [activeSpace, setActiveSpace] = useState(0);
  const [activeHowStep, setActiveHowStep] = useState(0);

  // Connect With VAYUVERSE AI (IQAir image-7 style pill email connect)
  const [connectEmail, setConnectEmail] = useState('');
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const bands = aqiStandard === 'US' ? US_AQI_BANDS : IN_AQI_BANDS;

  const fetchIndiaNetwork = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/v1/air/network', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const list: NetworkCityRecord[] = json.cities || json.stations || [];
        setNetwork(list);
        setNetworkLive(Boolean(json.is_live ?? true));
        setCountdown(60);
      }
    } catch {
      // retain previous live snapshot
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSpotlightCity = useCallback(async (city: string) => {
    try {
      const res = await fetch(`/api/v1/air/live?city=${encodeURIComponent(city)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const json: LiveAirBundle = await res.json();
        setSpotlightAir(json);
      }
    } catch {
      // retain previous snapshot
    }
  }, []);

  useEffect(() => {
    fetchIndiaNetwork();
  }, [fetchIndiaNetwork]);

  useEffect(() => {
    fetchSpotlightCity(spotlightCity);
  }, [spotlightCity, fetchSpotlightCity]);

  // Continuous 60-second live refresh loop
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchIndiaNetwork(true);
          fetchSpotlightCity(spotlightCity);
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [fetchIndiaNetwork, fetchSpotlightCity, spotlightCity]);

  // Enrich all 11 Indian cities with active AQI standard, region & color band
  const enrichedCities = useMemo(() => {
    return network.map((c) => {
      const aqi =
        aqiStandard === 'US' ? computeUsAqi(c.pm25, c.pm10) : c.indian_aqi;
      const band = resolveBand(aqi, bands).band;
      const region = CITY_REGION[c.city] || 'North';
      return {
        ...c,
        displayAqi: aqi,
        displayCategory: band.label,
        displayColor: band.color,
        region,
      };
    });
  }, [network, aqiStandard, bands]);

  // Compute Overall India National Metrics, Distribution & Regional Summaries
  const indiaStats = useMemo(() => {
    if (!enrichedCities.length) {
      return {
        avgAqi: 0,
        avgPm25: 0,
        avgPm10: 0,
        avgNo2: 0,
        cleanest: null as (typeof enrichedCities)[0] | null,
        peak: null as (typeof enrichedCities)[0] | null,
        acceptableCount: 0,
        acceptablePct: 0,
        total: 0,
        lastObserved: null as string | null,
        bandCounts: bands.map((b) => ({ ...b, count: 0 })),
        regions: [] as { region: Exclude<IndiaRegion, 'All'>; avgAqi: number; avgPm25: number; avgPm10: number; count: number; color: string; label: string }[],
      };
    }

    const total = enrichedCities.length;
    const avgAqi = Math.round(
      enrichedCities.reduce((acc, c) => acc + c.displayAqi, 0) / total
    );
    const pm25List = enrichedCities.map((c) => c.pm25).filter((v): v is number => v != null);
    const pm10List = enrichedCities.map((c) => c.pm10).filter((v): v is number => v != null);
    const no2List = enrichedCities.map((c) => c.no2).filter((v): v is number => v != null);

    const avgPm25 = pm25List.length
      ? Math.round((pm25List.reduce((a, b) => a + b, 0) / pm25List.length) * 10) / 10
      : 0;
    const avgPm10 = pm10List.length
      ? Math.round((pm10List.reduce((a, b) => a + b, 0) / pm10List.length) * 10) / 10
      : 0;
    const avgNo2 = no2List.length
      ? Math.round((no2List.reduce((a, b) => a + b, 0) / no2List.length) * 10) / 10
      : 0;

    const sorted = [...enrichedCities].sort((a, b) => a.displayAqi - b.displayAqi);
    const cleanest = sorted[0];
    const peak = sorted[sorted.length - 1];

    const moderateCap = aqiStandard === 'US' ? 100 : 200;
    const acceptableCount = enrichedCities.filter((c) => c.displayAqi <= moderateCap).length;
    const acceptablePct = Math.round((acceptableCount / total) * 100);

    const bandCounts = bands.map((b, idx) => {
      const count = enrichedCities.filter((c) => {
        if (idx === 0) return c.displayAqi <= b.max;
        if (idx === bands.length - 1) return c.displayAqi > b.min;
        return c.displayAqi > b.min && c.displayAqi <= b.max;
      }).length;
      return { ...b, count };
    });

    const regionOrder: Exclude<IndiaRegion, 'All'>[] = ['North', 'West', 'South', 'East'];
    const regions = regionOrder
      .map((reg) => {
        const sub = enrichedCities.filter((c) => c.region === reg);
        if (!sub.length) return null;
        const rAqi = Math.round(sub.reduce((s, c) => s + c.displayAqi, 0) / sub.length);
        const rPm25 =
          Math.round(
            (sub.reduce((s, c) => s + (c.pm25 ?? 0), 0) / sub.length) * 10
          ) / 10;
        const rPm10 =
          Math.round(
            (sub.reduce((s, c) => s + (c.pm10 ?? 0), 0) / sub.length) * 10
          ) / 10;
        const rb = resolveBand(rAqi, bands).band;
        return {
          region: reg,
          avgAqi: rAqi,
          avgPm25: rPm25,
          avgPm10: rPm10,
          count: sub.length,
          color: rb.color,
          label: rb.label,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      avgAqi,
      avgPm25,
      avgPm10,
      avgNo2,
      cleanest,
      peak,
      acceptableCount,
      acceptablePct,
      total,
      lastObserved: enrichedCities[0]?.observed_time_ist || null,
      bandCounts,
      regions,
    };
  }, [enrichedCities, aqiStandard, bands]);

  const filteredCities = useMemo(() => {
    const base =
      regionFilter === 'All'
        ? enrichedCities
        : enrichedCities.filter((c) => c.region === regionFilter);
    return [...base].sort((a, b) => b.displayAqi - a.displayAqi);
  }, [enrichedCities, regionFilter]);

  const hourlySeries = useMemo(() => {
    if (!spotlightAir) return [];
    return spotlightAir.history_48h.slice(-24).map((p) => {
      const val = aqiStandard === 'US' ? computeUsAqi(p.pm25, p.pm10) : p.indian_aqi;
      return {
        hour: formatShortHour(p.time),
        aqi: val,
        pm25: p.pm25 ?? 0,
        color: resolveBand(val, bands).band.color,
      };
    });
  }, [spotlightAir, aqiStandard, bands]);

  const nationalBand = resolveBand(indiaStats.avgAqi, bands).band;

  // Mini interactive demo calculation inside Bento Card 2
  const miniFactor =
    (miniMask ? 0.62 : 1) * (miniHepa ? 0.8 : 1) * (miniCleanSlot ? 0.84 : 1);
  const miniBase = indiaStats.avgAqi || 145;
  const miniEffective = Math.max(12, Math.round(miniBase * miniFactor));
  const miniSavedPct = Math.round((1 - miniFactor) * 100);

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectEmail.trim()) return;
    setSubmittingEmail(true);
    try {
      const res = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connectEmail.split('@')[0] || 'VAYUVERSE Subscriber',
          email: connectEmail.trim(),
          organization: '',
          category: 'newsletter_connect',
          message: 'Subscribed via Connect With VAYUVERSE AI landing page briefing signup.',
        }),
      });
      if (!res.ok) throw new Error('Please enter a valid email address.');
      setSubscribed(true);
      setConnectEmail('');
      toast('success', 'Connected with VAYUVERSE AI', 'You are subscribed for air intelligence updates and clean-air briefings.');
    } catch (err) {
      toast('error', 'Could not subscribe', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmittingEmail(false);
    }
  };

  const spacePreviews = [
    {
      name: 'AQI & 6-Gas Views',
      icon: Gauge,
      color: '#F97316',
      note: 'Morphing color views for AQI, Weather, PM2.5, PM10, CO, SO₂, NO₂ & O₃ with −/+ simulator.',
    },
    {
      name: '72h Pollution Shadow',
      icon: Radar,
      color: '#8B5CF6',
      note: 'Forecast regional plume drift, wind dispersion dials, inversion toggles & cleanest hours.',
    },
    {
      name: 'VAYU Home Indoor',
      icon: Home,
      color: '#10B981',
      note: 'Step room area & purifier CADR rate to model indoor PM2.5 decay and airing windows.',
    },
    {
      name: 'Family & Campus Ops',
      icon: Users,
      color: '#3898FF',
      note: 'Custom alert lines for kids/elders, school outdoor sports cutoffs & classroom filtration.',
    },
    {
      name: 'Grounded VAYU AI',
      icon: Sparkles,
      color: '#22D3EE',
      note: 'Ask plain-language questions answered with live city citations, timestamps & roadmaps.',
    },
  ];

  return (
    <div id="top" className="min-h-screen bg-[#030509] text-white selection:bg-[#F97316]/35">
      {/* ================================================================== */}
      {/* STICKY FLOATING NAVIGATION BAR                                     */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#04060B]/85 backdrop-blur-xl">
        {/* Ambient top light streak (REDSUN navbar signature) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1/4 bottom-0 h-px bg-gradient-to-r from-transparent via-[#F97316]/45 to-transparent"
        />

        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="#top" aria-label="VAYUVERSE AI Home">
            <VayuLogo size="sm" />
          </Link>

          <nav className="hidden items-center gap-7 text-[13px] font-medium text-slate-300 lg:flex">
            <a href="#india-live" className="inline-flex items-center gap-1.5 transition hover:text-white">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              India Situation
            </a>
            <a href="#what-it-does" className="transition hover:text-white">What It Does</a>
            <a href="#how-it-works" className="transition hover:text-white">How It Works</a>
            <a href="#who-it-serves" className="transition hover:text-white">Spaces</a>
            <a href="#connect" className="transition hover:text-white">Connect</a>
          </nav>

          <div className="hidden items-center gap-2.5 md:flex">
            {/* AQI Standard Switch */}
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-[11px]">
              {(['IN', 'US'] as const).map((std) => (
                <button
                  key={std}
                  type="button"
                  onClick={() => setAqiStandard(std)}
                  className={cn(
                    'rounded-full px-2.5 py-1 font-bold transition',
                    aqiStandard === std
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  AQI-{std}
                </button>
              ))}
            </div>

            {user ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-2 text-xs font-bold text-white shadow-[0_0_24px_rgba(249,115,22,0.45)] transition hover:brightness-110"
              >
                Open Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2 text-xs font-bold text-white shadow-[0_0_26px_rgba(249,115,22,0.5)] transition hover:brightness-110"
              >
                Login / Signup <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenu((v) => !v)}
            aria-label="Toggle navigation"
            className="rounded-xl border border-white/15 bg-white/5 p-2 text-white md:hidden"
          >
            {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileMenu && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/10 bg-[#060911] px-4 py-4 md:hidden"
            >
              <div className="flex flex-col gap-2 text-sm text-slate-200">
                <a href="#india-live" onClick={() => setMobileMenu(false)} className="rounded-lg px-3 py-2 hover:bg-white/5">Overall India Situation</a>
                <a href="#what-it-does" onClick={() => setMobileMenu(false)} className="rounded-lg px-3 py-2 hover:bg-white/5">What It Does</a>
                <a href="#how-it-works" onClick={() => setMobileMenu(false)} className="rounded-lg px-3 py-2 hover:bg-white/5">How It Works</a>
                <a href="#who-it-serves" onClick={() => setMobileMenu(false)} className="rounded-lg px-3 py-2 hover:bg-white/5">Protected Spaces</a>
                <a href="#connect" onClick={() => setMobileMenu(false)} className="rounded-lg px-3 py-2 hover:bg-white/5">Connect</a>
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <Link
                    href={user ? '/dashboard' : '/login'}
                    onClick={() => setMobileMenu(false)}
                    className="rounded-full bg-[#F97316] py-2.5 text-center text-xs font-bold text-white"
                  >
                    {user ? 'Dashboard' : 'Login'}
                  </Link>
                  {!user && (
                    <Link
                      href="/register"
                      onClick={() => setMobileMenu(false)}
                      className="rounded-full border border-white/15 bg-white/5 py-2.5 text-center text-xs font-semibold text-white"
                    >
                      Create Account
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ================================================================== */}
      {/* 1. ORBITAL EARTH-HORIZON HERO (image-7.png + REDSUN intro badge)   */}
      {/* ================================================================== */}
      <section className="relative overflow-hidden bg-black pt-10 pb-8 sm:pt-14 sm:pb-12">
        {/* Centered Hero Copy over Pure Deep Space */}
        <div className="relative z-20 mx-auto max-w-4xl px-4 text-center sm:px-6">
          <motion.a
            href="#india-live"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.05] p-1 pr-3.5 text-xs text-slate-200 backdrop-blur transition hover:border-[#F97316]/50"
          >
            <span className="rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white shadow-[0_0_16px_rgba(249,115,22,0.6)]">
              Live India
            </span>
            <span className="font-medium">
              {indiaStats.total || 11} Indian Cities · National Avg{' '}
              <strong className="text-white">{indiaStats.avgAqi || '—'}</strong> AQI-{aqiStandard}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </motion.a>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.06 }}
            className="mt-6 bg-gradient-to-b from-white via-white to-slate-400 bg-clip-text font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-transparent sm:text-6xl lg:text-[64px]"
          >
            Intelligent Air Protection
            <br />
            Powered by VAYUVERSE AI.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base"
          >
            Track India’s live air quality situation through real-time national meters and multi-city graphs — then sign in to unlock 72-hour plume forecasts, interactive what-if controls, and personalised protection roadmaps.
          </motion.p>

          {/* Iconic Clean White Pill Selector Bar (image-7.png visual centerpiece) */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mx-auto mt-8 flex max-w-xl items-center justify-between gap-2 rounded-full bg-white p-1.5 pl-5 text-slate-900 shadow-[0_12px_50px_rgba(56,152,255,0.28)]"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <MapPin className="h-4 w-4 shrink-0 text-[#2563EB]" />
              <select
                aria-label="Inspect live Indian city"
                value={spotlightCity}
                onChange={(e) => {
                  setSpotlightCity(e.target.value);
                  setGraphMode('hourly');
                }}
                className="w-full truncate bg-transparent py-2 text-sm font-medium text-slate-800 focus:outline-none"
              >
                {enrichedCities.length > 0 ? (
                  enrichedCities.map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city}, {c.state} — Live AQI {c.displayAqi} ({c.displayCategory})
                    </option>
                  ))
                ) : (
                  <option value="New Delhi">Loading live Indian cities...</option>
                )}
              </select>
            </div>
            <a
              href="#india-live"
              aria-label="Jump to Live India Meters and Graphs"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3898FF] text-white shadow-md transition hover:scale-105 hover:bg-[#2563EB]"
            >
              <ArrowRight className="h-4 w-4" />
            </a>
          </motion.div>

          {/* Primary Auth & Live India Situation Action Row */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-6 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              href={user ? '/dashboard' : '/login'}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-6 py-3 text-xs font-bold text-white shadow-[0_0_30px_rgba(249,115,22,0.5)] transition hover:scale-[1.02] hover:brightness-110 sm:text-sm"
            >
              <span>{user ? 'Open Interactive Dashboard' : 'Login / Sign up with Google'}</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>

            {!user && (
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3 text-xs font-semibold text-white backdrop-blur-md transition hover:border-white/45 hover:bg-white/20 sm:text-sm"
              >
                <span>Create Free Account</span>
              </Link>
            )}

            <a
              href="#india-live"
              className="inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-500/10 px-5 py-3 text-xs font-semibold text-sky-200 backdrop-blur-md transition hover:bg-sky-500/20 sm:text-sm"
            >
              <Gauge className="h-4 w-4" />
              <span>Overall India Meters</span>
            </a>
          </motion.div>
        </div>

        {/* Photorealistic Curved Earth Horizon with Golden India City Lights */}
        <div className="pointer-events-none relative mx-auto -mt-20 max-w-[1520px] select-none sm:-mt-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/earth-india-horizon.jpg"
            alt="Planet Earth glowing atmospheric horizon and Indian subcontinent city lights from orbit"
            className="mx-auto h-[340px] w-full object-cover object-bottom sm:h-[420px]"
          />
          {/* Seamless top, side, and bottom vignette blends into #030509 */}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, #000000 0%, rgba(0,0,0,0.22) 24%, rgba(0,0,0,0) 58%, rgba(3,5,9,0.92) 92%, #030509 100%)',
            }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 58%, #030509 98%)',
            }}
          />
        </div>
      </section>

      {/* ================================================================== */}
      {/* 2. OVERALL INDIA LIVE SITUATION — METERS, KPI SPARKLINES & GRAPHS  */}
      {/*    (REDSUN 055.jpg glowing command frame · 100% Real-Time Data)    */}
      {/* ================================================================== */}
      <section id="india-live" className="relative z-30 -mt-12 scroll-mt-20 pb-16 sm:-mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Outer Luminous Framed Container */}
          <div className="relative overflow-hidden rounded-[28px] border border-[#F97316]/25 bg-[#080B12]/95 p-5 shadow-[0_0_80px_-12px_rgba(249,115,22,0.22),0_30px_80px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:p-8">
            {/* Subtle top glow accent */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-[#F97316]/75 to-transparent"
            />

            {/* Header Row */}
            <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E53935] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    {networkLive ? 'ALL-INDIA LIVE' : 'FALLBACK'}
                  </span>
                  <ProvenanceBadge type="MODEL FORECAST" compact />
                  <ProvenanceBadge type="ESTIMATED" compact />
                  <span className="font-mono text-[11px] text-slate-400">
                    Next sync in {countdown}s
                  </span>
                </div>
                <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
                  Overall India Air Quality Situation — Live Meters &amp; Graphs
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Aggregated live across {indiaStats.total || 11} major Indian urban monitoring corridors · Updated:{' '}
                  <span className="text-slate-200">{formatIstTime(indiaStats.lastObserved)}</span>
                  {' · '}Open-Meteo CAMS Regional Feed
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={user ? '/dashboard' : '/login'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#F97316]/40 bg-[#F97316]/15 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#F97316]/25"
                >
                  Inspect Any City in Dashboard <ArrowUpRight className="h-3.5 w-3.5 text-[#FB923C]" />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    fetchIndiaNetwork();
                    fetchSpotlightCity(spotlightCity);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#F97316]/50 hover:text-white"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
                </button>
              </div>
            </div>

            {/* 4 Dynamic Overall-India KPI Cards with Live Sparklines (055.jpg top row) */}
            <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <SpotlightCard className="rounded-2xl p-4">
                <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider">
                  <span className="text-slate-400">India Mean AQI-{aqiStandard}</span>
                  <span className="font-bold" style={{ color: nationalBand.color }}>
                    {nationalBand.label}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <p className="font-display text-3xl font-extrabold text-white">
                      {indiaStats.avgAqi || '—'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Across {indiaStats.total || 11} cities
                    </p>
                  </div>
                  <MiniSparkline
                    values={enrichedCities.map((c) => c.displayAqi)}
                    color={nationalBand.color}
                  />
                </div>
              </SpotlightCard>

              <SpotlightCard className="rounded-2xl p-4" glowColor="rgba(34,197,94,0.2)">
                <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider">
                  <span className="text-slate-400">Cleanest Monitored</span>
                  <span className="font-bold text-emerald-400">
                    ↘ {indiaStats.cleanest?.displayCategory || 'Live'}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-3xl font-extrabold text-white">
                      {indiaStats.cleanest?.displayAqi ?? '—'}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-emerald-300">
                      {indiaStats.cleanest ? `${indiaStats.cleanest.city}, ${indiaStats.cleanest.state}` : 'Loading...'}
                    </p>
                  </div>
                  <MiniSparkline
                    values={[...enrichedCities].sort((a, b) => b.displayAqi - a.displayAqi).map((c) => c.displayAqi)}
                    color="#22C55E"
                  />
                </div>
              </SpotlightCard>

              <SpotlightCard className="rounded-2xl p-4" glowColor="rgba(236,72,127,0.22)">
                <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider">
                  <span className="text-slate-400">Highest Hotspot</span>
                  <span className="font-bold text-rose-400">
                    ↗ {indiaStats.peak?.displayCategory || 'Watch'}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-3xl font-extrabold text-white">
                      {indiaStats.peak?.displayAqi ?? '—'}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-rose-300">
                      {indiaStats.peak ? `${indiaStats.peak.city}, ${indiaStats.peak.state}` : 'Loading...'}
                    </p>
                  </div>
                  <MiniSparkline
                    values={[...enrichedCities].sort((a, b) => a.displayAqi - b.displayAqi).map((c) => c.displayAqi)}
                    color="#EC487F"
                  />
                </div>
              </SpotlightCard>

              <SpotlightCard className="rounded-2xl p-4" glowColor="rgba(56,152,255,0.22)">
                <div className="flex items-center justify-between text-[10.5px] font-mono uppercase tracking-wider">
                  <span className="text-slate-400">India Mean PM2.5</span>
                  <span className={cn('font-bold', indiaStats.avgPm25 <= 60 ? 'text-emerald-400' : 'text-amber-400')}>
                    {indiaStats.avgPm25 <= 60 ? '≤ CPCB 60' : '> CPCB 60'}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div>
                    <p className="font-display text-3xl font-extrabold text-white">
                      {indiaStats.avgPm25 || '—'}
                      <span className="ml-1 text-xs font-medium text-slate-400">µg/m³</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {indiaStats.acceptableCount}/{indiaStats.total} cities ≤ Moderate
                    </p>
                  </div>
                  <MiniSparkline
                    values={enrichedCities.map((c) => c.pm25 ?? 0)}
                    color="#3898FF"
                  />
                </div>
              </SpotlightCard>
            </div>

            {/* Two-Column Core: LEFT = Overall India Meters | RIGHT = Live India Graphs (055.jpg layout) */}
            <div className="mt-5 grid gap-5 lg:grid-cols-12">
              {/* LEFT 5 COLS: Overall India Situation Meters */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#0C1019] p-5 lg:col-span-5">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-white">
                        Overall India Air Meters
                      </h3>
                      <p className="text-xs text-slate-400">
                        Live national composite gauges &amp; regional distribution
                      </p>
                    </div>
                    <Gauge className="h-4 w-4 text-[#F97316]" />
                  </div>

                  {/* Two Live National Radial Speedometer Dials */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <RadialDialMeter
                      size="sm"
                      value={indiaStats.avgAqi}
                      max={450}
                      label={`India Avg AQI-${aqiStandard}`}
                      statusText={nationalBand.label}
                      color={nationalBand.color}
                      deltaText={
                        indiaStats.cleanest && indiaStats.peak
                          ? `Range ${indiaStats.cleanest.displayAqi}–${indiaStats.peak.displayAqi}`
                          : 'Live'
                      }
                      deltaGood={indiaStats.avgAqi <= 150}
                    />
                    <RadialDialMeter
                      size="sm"
                      value={indiaStats.avgPm25}
                      max={250}
                      label="India Avg PM2.5"
                      unit=" µg/m³"
                      statusText={indiaStats.avgPm25 <= 60 ? 'Within 24h Std' : 'Elevated Haze'}
                      color={indiaStats.avgPm25 <= 60 ? '#22C55E' : '#F97316'}
                      deltaText={`PM10: ${indiaStats.avgPm10} µg/m³`}
                      deltaGood={indiaStats.avgPm25 <= 60}
                    />
                  </div>

                  {/* 6-Segment National Spectrum Scale Meter */}
                  <div className="mt-4 rounded-xl border border-white/[0.07] bg-[#111723] p-3.5">
                    <div className="mb-2 flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-200">National AQI Spectrum Position</span>
                      <span className="font-mono text-slate-400">
                        {indiaStats.acceptablePct}% cities Good–Moderate
                      </span>
                    </div>
                    <SpectrumScaleBar value={indiaStats.avgAqi} bands={bands} compact />

                    {/* City count chips per category */}
                    <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                      {indiaStats.bandCounts.map((b) => (
                        <div
                          key={b.label}
                          className="rounded-lg border border-white/[0.06] bg-black/30 px-1.5 py-1 text-center"
                        >
                          <p className="font-mono text-xs font-bold" style={{ color: b.color }}>
                            {b.count}
                          </p>
                          <p className="truncate text-[9px] text-slate-400">{b.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Regional India Progress Meters (Click to filter graph!) */}
                <div className="space-y-2 border-t border-white/[0.07] pt-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">India Zonal Meters (Click to Filter)</span>
                    {regionFilter !== 'All' && (
                      <button
                        type="button"
                        onClick={() => setRegionFilter('All')}
                        className="text-[11px] font-semibold text-[#F97316] hover:underline"
                      >
                        Show All Zones
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {indiaStats.regions.map((r) => {
                      const active = regionFilter === r.region;
                      const pct = Math.min(100, Math.max(10, Math.round((r.avgAqi / 400) * 100)));
                      return (
                        <button
                          key={r.region}
                          type="button"
                          onClick={() => {
                            setRegionFilter(active ? 'All' : r.region);
                            setGraphMode('cities');
                          }}
                          className={cn(
                            'rounded-xl border p-2.5 text-left transition',
                            active
                              ? 'border-[#F97316]/60 bg-[#F97316]/10'
                              : 'border-white/[0.07] bg-[#111723] hover:border-white/20'
                          )}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-white">{r.region} India</span>
                            <span className="font-mono font-bold" style={{ color: r.color }}>
                              {r.avgAqi}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: r.color }}
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-400">
                            PM2.5 {r.avgPm25} µg/m³ · {r.count} {r.count === 1 ? 'city' : 'cities'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT 7 COLS: Interactive Overall-India Graphs (055.jpg dual-bar visual style) */}
              <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0C1019] p-5 lg:col-span-7">
                <div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-white sm:text-lg">
                        {graphMode === 'cities'
                          ? `${regionFilter === 'All' ? 'All-India' : `${regionFilter} India`} Live City AQI & PM2.5 Graph`
                          : graphMode === 'regions'
                            ? 'India Zonal Comparison — AQI, PM2.5 & PM10'
                            : `${spotlightCity} — Live 24-Hour Air Quality Curve`}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {graphMode === 'cities'
                          ? 'Click any bar to inspect that city’s live 24-hour trajectory & local weather'
                          : graphMode === 'regions'
                            ? 'Live average concentration across North, West, South & East Indian corridors'
                            : `Real-time 24h trajectory · Temp ${spotlightAir?.current.weather.temp_c ?? '—'}°C · Humidity ${spotlightAir?.current.weather.humidity_pct ?? '—'}% · Wind ${spotlightAir?.current.weather.wind_kph ?? '—'} km/h`}
                      </p>
                    </div>

                    {/* Graph Mode Tabs */}
                    <div className="inline-flex shrink-0 items-center rounded-xl border border-white/10 bg-[#070A10] p-1 text-[11px]">
                      {(
                        [
                          ['cities', 'All Cities'],
                          ['regions', 'By Zone'],
                          ['hourly', '24h Curve'],
                        ] as const
                      ).map(([k, lbl]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setGraphMode(k)}
                          className={cn(
                            'rounded-lg px-3 py-1.5 font-semibold transition',
                            graphMode === k
                              ? 'bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white shadow'
                              : 'text-slate-400 hover:text-white'
                          )}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Secondary Controls when in 24h Curve Mode */}
                  {graphMode === 'hourly' && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-[#111723] px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-[#3898FF]" />
                        <select
                          aria-label="Spotlight city for 24h graph"
                          value={spotlightCity}
                          onChange={(e) => setSpotlightCity(e.target.value)}
                          className="rounded-lg border border-white/10 bg-[#090D14] px-2.5 py-1 text-xs font-semibold text-white focus:outline-none"
                        >
                          {enrichedCities.map((c) => (
                            <option key={c.city} value={c.city}>
                              {c.city} (AQI {c.displayAqi})
                            </option>
                          ))}
                        </select>
                        <span className="hidden items-center gap-2 text-[11px] text-slate-400 sm:inline-flex">
                          <Droplets className="h-3 w-3" /> {spotlightAir?.current.weather.humidity_pct ?? '—'}%
                          <Wind className="ml-1 h-3 w-3" /> {spotlightAir?.current.weather.wind_kph ?? '—'} km/h {spotlightAir?.current.weather.wind_compass || ''}
                        </span>
                      </div>
                      <div className="inline-flex rounded-lg border border-white/10 bg-[#090D14] p-0.5">
                        <button
                          type="button"
                          onClick={() => setHourlyStyle('bar')}
                          aria-label="Bar chart"
                          className={cn('rounded p-1', hourlyStyle === 'bar' ? 'bg-[#F97316] text-white' : 'text-slate-400')}
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setHourlyStyle('area')}
                          aria-label="Area chart"
                          className={cn('rounded p-1', hourlyStyle === 'area' ? 'bg-[#F97316] text-white' : 'text-slate-400')}
                        >
                          <LineChart className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Recharts Canvas */}
                  <div className="mt-4 h-[305px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      {graphMode === 'cities' ? (
                        <BarChart
                          data={filteredCities}
                          barGap={4}
                          onClick={(state) => {
                            const clicked = state?.activePayload?.[0]?.payload?.city;
                            if (clicked) {
                              setSpotlightCity(clicked);
                              setGraphMode('hourly');
                            }
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis
                            dataKey="city"
                            stroke="#94a3b8"
                            fontSize={10.5}
                            tickLine={false}
                            interval={0}
                            angle={-22}
                            textAnchor="end"
                            height={50}
                          />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(249,115,22,0.08)' }}
                            contentStyle={{
                              backgroundColor: '#121824',
                              border: '1px solid rgba(249,115,22,0.35)',
                              borderRadius: '12px',
                              fontSize: '12px',
                            }}
                            labelStyle={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}
                            itemStyle={{ color: '#E2E8F0' }}
                          />
                          <Bar
                            dataKey="displayAqi"
                            name={`Live AQI-${aqiStandard}`}
                            radius={[5, 5, 0, 0]}
                            className="cursor-pointer"
                          >
                            {filteredCities.map((c) => (
                              <Cell key={c.city} fill={c.displayColor} />
                            ))}
                          </Bar>
                          <Bar
                            dataKey="pm25"
                            name="PM2.5 (µg/m³)"
                            fill="rgba(251, 146, 60, 0.38)"
                            radius={[5, 5, 0, 0]}
                            className="cursor-pointer"
                          />
                        </BarChart>
                      ) : graphMode === 'regions' ? (
                        <ComposedChart data={indiaStats.regions} barGap={6}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="region" stroke="#94a3b8" fontSize={12} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#121824',
                              border: '1px solid rgba(249,115,22,0.35)',
                              borderRadius: '12px',
                              fontSize: '12px',
                            }}
                            labelStyle={{ color: '#fff', fontWeight: 700 }}
                            itemStyle={{ color: '#E2E8F0' }}
                          />
                          <Bar dataKey="avgAqi" name={`Avg AQI-${aqiStandard}`} fill="#F97316" radius={[6, 6, 0, 0]} />
                          <Bar dataKey="avgPm10" name="Avg PM10 (µg/m³)" fill="rgba(249,115,22,0.42)" radius={[6, 6, 0, 0]} />
                          <Line type="monotone" dataKey="avgPm25" name="Avg PM2.5 (µg/m³)" stroke="#38BDF8" strokeWidth={2.6} />
                        </ComposedChart>
                      ) : hourlyStyle === 'bar' ? (
                        <BarChart data={hourlySeries}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10.5} minTickGap={18} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#121824',
                              border: '1px solid rgba(255,255,255,0.18)',
                              borderRadius: '12px',
                              fontSize: '12px',
                            }}
                            labelStyle={{ color: '#fff', fontWeight: 700 }}
                            itemStyle={{ color: '#E2E8F0' }}
                          />
                          <Bar dataKey="aqi" name={`${spotlightCity} AQI-${aqiStandard}`} radius={[4, 4, 0, 0]}>
                            {hourlySeries.map((pt, i) => (
                              <Cell key={i} fill={pt.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      ) : (
                        <AreaChart data={hourlySeries}>
                          <defs>
                            <linearGradient id="indiaGlowArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#F97316" stopOpacity={0.48} />
                              <stop offset="95%" stopColor="#F97316" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="hour" stroke="#94a3b8" fontSize={10.5} minTickGap={18} tickLine={false} />
                          <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#121824',
                              border: '1px solid rgba(249,115,22,0.35)',
                              borderRadius: '12px',
                              fontSize: '12px',
                            }}
                            labelStyle={{ color: '#fff', fontWeight: 700 }}
                            itemStyle={{ color: '#E2E8F0' }}
                          />
                          <Area
                            type="monotone"
                            dataKey="aqi"
                            name={`${spotlightCity} AQI-${aqiStandard}`}
                            stroke="#F97316"
                            strokeWidth={2.6}
                            fill="url(#indiaGlowArea)"
                          />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Graph Footer Legend + Dashboard Unlock Link */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span>
                      National Avg NO₂: <strong className="text-white">{indiaStats.avgNo2} µg/m³</strong>
                    </span>
                    <span>·</span>
                    <span>
                      National Avg PM10: <strong className="text-white">{indiaStats.avgPm10} µg/m³</strong>
                    </span>
                  </div>
                  <Link
                    href={user ? '/dashboard' : '/login'}
                    className="inline-flex items-center gap-1 font-semibold text-[#FB923C] hover:underline"
                  >
                    Sign in for interactive −/+ simulators &amp; 72h forecasts
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Live All-India City Strip (055.jpg / 068.jpg horizontal row) */}
          {enrichedCities.length > 0 && (
            <div className="mt-8 text-center">
              <p className="text-xs font-medium text-slate-400">
                Real-time monitoring across {enrichedCities.length} major Indian corridors — click any city to inspect its live 24h graph
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {enrichedCities.map((c) => {
                  const selected = c.city === spotlightCity && graphMode === 'hourly';
                  return (
                    <button
                      key={c.city}
                      type="button"
                      onClick={() => {
                        setSpotlightCity(c.city);
                        setGraphMode('hourly');
                      }}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5',
                        selected
                          ? 'border-[#F97316]/60 bg-[#F97316]/15 text-white shadow-[0_0_18px_rgba(249,115,22,0.3)]'
                          : 'border-white/[0.08] bg-[#0B0F18] text-slate-300 hover:border-white/25 hover:text-white'
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.displayColor, boxShadow: `0 0 8px ${c.displayColor}` }}
                      />
                      <span>{c.city}</span>
                      <span className="font-mono font-bold" style={{ color: c.displayColor }}>
                        {c.displayAqi}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ================================================================== */}
      {/* 3. DYNAMIC SPOTLIGHT BENTO GRID — WHAT THIS APP DOES (083.jpg)     */}
      {/* ================================================================== */}
      <section id="what-it-does" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#FB923C]">
              What VAYUVERSE AI Does
            </span>
            <h2 className="mt-2 bg-gradient-to-b from-white to-slate-400 bg-clip-text font-display text-3xl font-extrabold text-transparent sm:text-4xl">
              From Raw Air Signals to Everyday Protection
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Move your cursor across the dynamic cards or test the live protection toggles to preview how VAYUVERSE AI turns pollution data into clear action.
            </p>
          </div>

          {/* Exact REDSUN 083.jpg Asymmetric 3-Col Bento Grid */}
          <div className="mt-12 grid gap-5 lg:grid-cols-12">
            {/* Left + Center Stack (8 cols) */}
            <div className="grid gap-5 sm:grid-cols-2 lg:col-span-8">
              {/* Bento 1: Multi-Pollutant Live Stack */}
              <SpotlightCard className="flex flex-col justify-between p-6">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Multi-Pollutant Intelligence
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Tracks AQI, PM2.5, PM10, CO, SO₂, NO₂, O₃, and boundary-layer weather — each opening its own color-coded dashboard theme and scale.
                  </p>
                </div>

                <div className="mt-6 space-y-2.5">
                  <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3.5 py-2.5 text-xs font-bold text-white shadow-[0_6px_24px_rgba(249,115,22,0.4)] transition group-hover:translate-x-1">
                    <span className="inline-flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5" /> PM2.5 · India Avg
                    </span>
                    <span className="font-mono">{indiaStats.avgPm25 || '—'} µg/m³</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#121722] px-3.5 py-2.5 text-xs text-slate-200 transition group-hover:translate-x-0.5">
                    <span className="inline-flex items-center gap-2 text-slate-300">
                      <Wind className="h-3.5 w-3.5 text-amber-400" /> PM10 &amp; NO₂ Gases
                    </span>
                    <span className="font-mono text-slate-300">
                      {indiaStats.avgPm10 || '—'} · {indiaStats.avgNo2 || '—'} µg/m³
                    </span>
                  </div>
                </div>
              </SpotlightCard>

              {/* Bento 2: Interactive Live What-If Card */}
              <SpotlightCard className="flex flex-col justify-between p-6" glowColor="rgba(56,152,255,0.22)">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Interactive What-If Controls
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Click a protection chip below to preview how our dashboard meters, graphs, and roadmaps respond dynamically.
                  </p>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-[#101520] p-4">
                  <div className="flex items-center justify-between text-[10.5px] font-mono uppercase">
                    <span className="text-slate-400">Effective India Load</span>
                    <span className="font-bold text-emerald-400">−{miniSavedPct}% EST.</span>
                  </div>
                  <div className="mt-1 flex items-end justify-between">
                    <span className="font-display text-3xl font-extrabold text-white transition-all">
                      {miniEffective}
                      <span className="ml-1.5 text-xs font-normal text-slate-400">
                        vs {miniBase} live
                      </span>
                    </span>
                    <MiniSparkline
                      values={[miniBase, Math.round(miniBase * 0.9), Math.round((miniBase + miniEffective) / 2), Math.round(miniEffective * 1.08), miniEffective]}
                      color="#22C55E"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[
                      { label: 'N95 Mask', on: miniMask, flip: () => setMiniMask((v) => !v) },
                      { label: 'Indoor HEPA', on: miniHepa, flip: () => setMiniHepa((v) => !v) },
                      { label: 'Clean Hour', on: miniCleanSlot, flip: () => setMiniCleanSlot((v) => !v) },
                    ].map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={chip.flip}
                        className={cn(
                          'rounded-lg px-2.5 py-1 text-[10.5px] font-bold transition',
                          chip.on
                            ? 'bg-[#F97316] text-white shadow-sm'
                            : 'border border-white/10 bg-white/[0.04] text-slate-400 hover:text-white'
                        )}
                      >
                        {chip.label} {chip.on ? 'ON' : 'OFF'}
                      </button>
                    ))}
                  </div>
                </div>
              </SpotlightCard>

              {/* Bento 4 (Bottom Wide 2-col — REDSUN AI Sessions card) */}
              <SpotlightCard className="p-6 sm:col-span-2" glowColor="rgba(249,115,22,0.2)">
                <div className="grid items-center gap-6 md:grid-cols-12">
                  <div className="md:col-span-5">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#F97316]/30 bg-[#F97316]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#FB923C]">
                      <Sparkles className="h-3 w-3" /> 14 TAILORED MODULES
                    </div>
                    <h3 className="mt-3 font-display text-xl font-bold text-white">
                      Grounded AI &amp; Feature-Themed Dashboard
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {spacePreviews[activeSpace].note}
                    </p>
                    <Link
                      href={user ? '/dashboard' : '/login'}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#FB923C] hover:underline"
                    >
                      Unlock inside dashboard <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  <div className="relative rounded-2xl border border-white/10 bg-[#0F141F] p-4 md:col-span-7">
                    <div className="space-y-1.5">
                      {spacePreviews.map((sp, idx) => {
                        const Icon = sp.icon;
                        const isAct = activeSpace === idx;
                        return (
                          <button
                            key={sp.name}
                            type="button"
                            onMouseEnter={() => setActiveSpace(idx)}
                            onClick={() => setActiveSpace(idx)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition',
                              isAct
                                ? 'bg-white/[0.08] text-white ring-1 ring-white/15'
                                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                            )}
                          >
                            <span className="inline-flex items-center gap-2.5">
                              <span
                                className="flex h-6 w-6 items-center justify-center rounded-lg"
                                style={{ backgroundColor: `${sp.color}25`, color: sp.color }}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              {sp.name}
                            </span>
                            <ChevronRight
                              className={cn('h-3.5 w-3.5 transition', isAct ? 'translate-x-0.5 text-white' : 'opacity-40')}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <Sparkles
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-2.5 right-4 h-6 w-6 text-white/80 drop-shadow-[0_0_10px_rgba(255,255,255,0.6)]"
                    />
                  </div>
                </div>
              </SpotlightCard>
            </div>

            {/* Right Tall Cone-Beam Feature Card (exact 083.jpg signature card) */}
            <SpotlightCard className="relative flex min-h-[420px] flex-col justify-between p-6 lg:col-span-4">
              {/* Dramatic Glowing Amber Funnel Beam SVG */}
              <div className="relative flex flex-1 flex-col items-center justify-center py-6">
                <svg
                  viewBox="0 0 260 210"
                  className="pointer-events-none absolute top-0 h-52 w-full"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="vayuBeam" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F97316" stopOpacity="0.92" />
                      <stop offset="65%" stopColor="#FB923C" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M 35 0 Q 95 78 106 138 L 154 138 Q 165 78 225 0 Z" fill="url(#vayuBeam)" />
                  <line x1="130" y1="0" x2="130" y2="138" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
                </svg>

                <div className="relative z-10 mt-20 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/20 bg-black p-3 shadow-[0_0_50px_rgba(249,115,22,0.55)] transition duration-500 group-hover:scale-105">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/va-logo.png"
                    alt="VAYUVERSE AI"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>

              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#FB923C]">
                  72-Hour Predictive Core
                </span>
                <h3 className="mt-1.5 font-display text-xl font-bold text-white">
                  Predict · Personalise · Act
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Synthesises regional atmospheric models, local meteorology, and your daily habits into proactive step-by-step roadmaps — before a pollution spike reaches your street.
                </p>
              </div>
            </SpotlightCard>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 4. HOW IT WORKS — INTERACTIVE TWO-PART SHOWCASE (114.jpg & 132.jpg)*/}
      {/* ================================================================== */}
      <section id="how-it-works" className="scroll-mt-16 border-t border-white/[0.06] bg-[#05080F] py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#3898FF]">
              How It Works
            </span>
            <h2 className="mt-2 bg-gradient-to-b from-white to-slate-400 bg-clip-text font-display text-3xl font-extrabold text-transparent sm:text-4xl">
              Four Steps from Live Telemetry to Action
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Designed for clarity, scientific honesty, and zero clutter — explore the pipeline below, then step inside your dashboard.
            </p>
          </div>

          {/* Row 1 (114.jpg layout): Editorial + Checkmarks left | Stacked Interactive Cards + Shield Halo right */}
          <div className="mt-14 grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h3 className="font-display text-2xl font-bold leading-snug text-white sm:text-3xl">
                {HOW_IT_WORKS_STEPS[activeHowStep].title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                {HOW_IT_WORKS_STEPS[activeHowStep].desc}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white transition hover:border-[#F97316]/50 hover:bg-white/10"
                >
                  See Methodology <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                  href={user ? '/dashboard' : '/login'}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316]/15 px-4 py-2 text-xs font-bold text-[#FB923C] ring-1 ring-[#F97316]/40 transition hover:bg-[#F97316]/25"
                >
                  {user ? 'Open Dashboard' : 'Sign in with Google'} <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <ul className="mt-7 space-y-3 text-xs text-slate-300">
                {[
                  'Sign in securely via Google OAuth 2.0 + PKCE or verified email account.',
                  'Each feature opens a distinct color-coded interface with dedicated meters & charts.',
                  'Adjust switches and − / + steppers to update graphs and 4-step action roadmaps live.',
                ].map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white shadow-[0_0_12px_rgba(249,115,22,0.5)]">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-7">
              <SpotlightCard className="relative overflow-hidden p-6 sm:p-8">
                <div className="relative z-10 space-y-3 max-w-md">
                  {HOW_IT_WORKS_STEPS.map((st, idx) => {
                    const Icon = st.icon;
                    const active = activeHowStep === idx;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setActiveHowStep(idx)}
                        onMouseEnter={() => setActiveHowStep(idx)}
                        className={cn(
                          'flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition-all',
                          active
                            ? 'border-[#F97316]/50 bg-[#131926]/95 shadow-[0_8px_30px_rgba(0,0,0,0.45)]'
                            : 'border-white/[0.06] bg-[#0D111B]/75 opacity-70 hover:opacity-100'
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition',
                            active
                              ? 'bg-gradient-to-br from-[#FB923C] to-[#EA580C] text-white shadow-[0_0_24px_rgba(249,115,22,0.75)]'
                              : 'bg-white/[0.06] text-slate-400'
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] font-bold text-[#FB923C]">{st.code}</p>
                          <p className="truncate font-display text-sm font-bold text-white">{st.title}</p>
                          <p className="text-[11px] text-slate-400">{st.metric}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Concentric Atmospheric Shield Emblem (114.jpg visual motif) */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-16 -right-16 hidden h-72 w-72 items-center justify-center rounded-full border border-[#F97316]/35 bg-gradient-to-br from-[#F97316]/20 to-transparent shadow-[0_0_60px_rgba(249,115,22,0.25)] sm:flex"
                >
                  <div className="flex h-52 w-52 items-center justify-center rounded-full border border-[#F97316]/25 bg-[#0A0E16]/80">
                    <Shield className="h-20 w-20 fill-white/85 text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.3)]" />
                  </div>
                </div>
              </SpotlightCard>
            </div>
          </div>

          {/* Row 2 (132.jpg flipped layout): Glowing Live Chart Card left | Transparent Science right */}
          <div className="mt-16 grid items-center gap-10 lg:grid-cols-12">
            <div className="order-2 lg:order-1 lg:col-span-6">
              <SpotlightCard className="p-6 sm:p-8">
                <div className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-[#121723] p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FB923C] to-[#EA580C] text-white shadow-[0_0_24px_rgba(249,115,22,0.75)]">
                    <BarChart3 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold text-white">India Feeds Always ON!</p>
                    <p className="text-xs text-slate-400">
                      Every city meter &amp; bar updates from verified regional telemetry with timestamps.
                    </p>
                  </div>
                </div>

                {/* Glowing Highlight Stat Tile (132.jpg orange floating tile) */}
                <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
                  <div className="rounded-2xl bg-gradient-to-br from-[#FB923C] to-[#EA580C] p-5 text-white shadow-[0_14px_45px_rgba(249,115,22,0.45)] transition duration-300 group-hover:-translate-y-1">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-white/90">
                      <span>India Good–Mod Share</span>
                      <span>LIVE</span>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <p className="font-display text-3xl font-extrabold">{indiaStats.acceptablePct}%</p>
                        <p className="text-[11px] text-white/85">
                          {indiaStats.acceptableCount} of {indiaStats.total} cities
                        </p>
                      </div>
                      <MiniSparkline
                        values={enrichedCities.map((c) => Math.max(10, 400 - c.displayAqi))}
                        color="#FFFFFF"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#111622] p-5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      Live Provenance Labels
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <ProvenanceBadge type="MEASURED" compact />
                      <ProvenanceBadge type="MODEL FORECAST" compact />
                      <ProvenanceBadge type="ESTIMATED" compact />
                      <ProvenanceBadge type="AI SUMMARY" compact />
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">
                      Never fabricates station sensors or offers medical claims.
                    </p>
                  </div>
                </div>
              </SpotlightCard>
            </div>

            <div className="order-1 lg:order-2 lg:col-span-6">
              <h3 className="font-display text-2xl font-bold leading-snug text-white sm:text-3xl">
                Fast-reading graphs &amp; scientific transparency you can trust
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                VAYUVERSE AI separates regional model forecasts, CPCB/US-EPA index calculations, user-reported signals, and scenario estimates so every decision rests on clear evidence.
              </p>

              <ul className="mt-6 space-y-3 text-xs text-slate-300">
                {[
                  'One-click toggle between Indian National AQI (CPCB NAQI) and US EPA AQI breakpoints.',
                  'Multilingual support (English, हिन्दी, ਪੰਜਾਬੀ) & privacy-first coarse city location.',
                  'Strictly environmental planning & protective guidance — never medical diagnosis.',
                ].map((pt) => (
                  <li key={pt} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#F97316] text-white shadow-[0_0_12px_rgba(249,115,22,0.5)]">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 5. THREE DYNAMIC HOVER CARDS — BUILT FOR EVERY SPACE (186/192.jpg) */}
      {/* ================================================================== */}
      <section id="who-it-serves" className="scroll-mt-16 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-[#FB923C]">
              Protected Spaces
            </span>
            <h2 className="mt-2 bg-gradient-to-b from-white to-slate-400 bg-clip-text font-display text-3xl font-extrabold text-transparent sm:text-4xl">
              Tailored Intelligence for Every Routine
            </h2>
            <p className="mt-2.5 text-sm text-slate-400">
              Sign in once to switch effortlessly between personal, household, campus, and community response tools.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {SCALE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.title}
                  href={user ? '/dashboard' : '/login'}
                  style={{ background: card.gradient }}
                  className="group relative flex min-h-[370px] flex-col justify-between overflow-hidden rounded-3xl border border-white/10 p-6 transition duration-300 hover:-translate-y-1 hover:border-white/25"
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur"
                      style={{ color: card.accent }}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/55 text-white ring-1 ring-white/15 transition group-hover:scale-110 group-hover:bg-white group-hover:text-slate-950">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>

                  {/* Frosted Glass Drawer Card (186.jpg / 192.jpg hover aesthetic) */}
                  <div className="rounded-2xl border border-white/15 bg-[#0D121C]/80 p-5 backdrop-blur-md transition duration-300 group-hover:border-white/30 group-hover:bg-[#111827]/90">
                    <p className="font-mono text-[10px] font-bold tracking-wider" style={{ color: card.accent }}>
                      {card.tag}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-bold text-white">{card.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{card.desc}</p>
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {card.highlights.map((h) => (
                        <span
                          key={h}
                          className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-slate-200"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* 6. CONNECT WITH VAYUVERSE AI — ICONIC EARTH HORIZON (image-7.png)  */}
      {/* ================================================================== */}
      <section id="connect" className="relative scroll-mt-16 overflow-hidden border-t border-white/[0.08] bg-black pt-16">
        <div className="relative z-20 mx-auto max-w-2xl px-4 text-center sm:px-6">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Connect With VAYUVERSE AI
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
            Get India air quality briefings, predictive feature updates, and practical clean-air tips delivered to your inbox — or jump straight into your personal dashboard.
          </p>

          {/* Exact image-7.png Full-Width Crisp White Pill Input + Circular Blue Arrow Button */}
          {subscribed ? (
            <div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-6 py-3.5 text-sm font-semibold text-emerald-200">
              <Check className="h-4 w-4" /> Subscribed — welcome to VAYUVERSE AI briefings!
            </div>
          ) : (
            <form
              onSubmit={handleConnectSubmit}
              className="mx-auto mt-8 flex max-w-lg items-center rounded-full bg-white p-1.5 pl-6 shadow-[0_8px_40px_rgba(56,152,255,0.25)]"
            >
              <input
                type="email"
                required
                value={connectEmail}
                onChange={(e) => setConnectEmail(e.target.value)}
                placeholder="Email"
                aria-label="Email address"
                className="w-full bg-transparent py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submittingEmail}
                aria-label="Subscribe"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#4A90D9] text-white transition hover:scale-105 hover:bg-[#357ABD] disabled:opacity-60"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </form>
          )}

          {/* Quick Action Icon Circles (exact image-7.png centered white circles) */}
          <div className="mt-7 flex items-center justify-center gap-3.5">
            {[
              { href: '#india-live', label: 'India Live Meters', icon: Gauge },
              { href: '/login', label: 'Login with Google', icon: ArrowUpRight },
              { href: '/docs', label: 'Methodology Docs', icon: Layers },
              { href: '/privacy', label: 'Privacy & Trust', icon: ShieldCheck },
            ].map((item) => {
              const Icon = item.icon;
              return item.href.startsWith('#') ? (
                <a
                  key={item.label}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:scale-110 hover:bg-slate-200"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:scale-110 hover:bg-slate-200"
                >
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Glowing Sunrise Earth Curvature Rising at Bottom (exact image-7.png visual!) */}
        <div className="pointer-events-none relative mx-auto -mt-4 max-w-[1440px] select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/earth-india-horizon.jpg"
            alt="Glowing Earth curvature at sunrise"
            className="mx-auto w-full max-h-[360px] object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, #000000 0%, rgba(0,0,0,0.2) 28%, rgba(0,0,0,0) 65%, rgba(12,16,22,0.95) 100%)',
            }}
          />
        </div>
      </section>

      {/* ================================================================== */}
      {/* CLEAN STRUCTURED FOOTER (image-7.png bottom bar + 221.jpg columns) */}
      {/* ================================================================== */}
      <footer className="border-t border-white/[0.08] bg-[#0B0F15] py-12 text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <VayuLogo size="sm" />
              <p className="mt-3 max-w-sm text-xs leading-relaxed text-slate-400">
                Predictive Air Intelligence &amp; Community Response Platform for India. Environmental planning and exposure awareness only — not medical diagnosis or treatment.
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Live atmospheric data attributed to Open-Meteo &amp; Copernicus CAMS (CC BY 4.0).
              </p>
            </div>

            <div>
              <p className="font-display text-[11px] font-bold uppercase tracking-wider text-white">
                About VAYUVERSE
              </p>
              <ul className="mt-3 space-y-2">
                <li><a href="#india-live" className="hover:text-white">India Live Situation</a></li>
                <li><a href="#what-it-does" className="hover:text-white">What It Does</a></li>
                <li><a href="#how-it-works" className="hover:text-white">How It Works</a></li>
                <li><a href="#who-it-serves" className="hover:text-white">Protected Spaces</a></li>
              </ul>
            </div>

            <div>
              <p className="font-display text-[11px] font-bold uppercase tracking-wider text-white">
                Get Started
              </p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/login" className="text-[#FB923C] hover:underline">Sign in with Google</Link></li>
                <li><Link href="/register" className="hover:text-white">Create Free Account</Link></li>
                <li><Link href="/dashboard" className="hover:text-white">Open Dashboard</Link></li>
                <li><a href="#india-live" className="hover:text-white">Overall India Situation</a></li>
              </ul>
            </div>

            <div>
              <p className="font-display text-[11px] font-bold uppercase tracking-wider text-white">
                Trust &amp; Legal
              </p>
              <ul className="mt-3 space-y-2">
                <li><Link href="/docs" className="hover:text-white">Data &amp; Methodology</Link></li>
                <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
                <li><a href="#connect" className="hover:text-white">Connect &amp; Briefings</a></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
