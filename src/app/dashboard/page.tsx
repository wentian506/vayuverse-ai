'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  CalendarClock,
  CheckCircle2,
  Cloud,
  Crosshair,
  Droplets,
  FileBarChart2,
  Gauge,
  GraduationCap,
  HeartHandshake,
  Home,
  Megaphone,
  Radar,
  RefreshCw,
  RotateCcw,
  Route,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Users,
  Wind,
} from 'lucide-react';
import { useApp } from '@/components/providers/AppProvider';
import { ProvenanceBadge } from '@/components/ui/VayuUI';
import { InteractiveAirMapExplorer } from '@/components/maps/InteractiveAirMapExplorer';
import {
  CityBubbleItem,
  ColorCodedAirChart,
  ColoredChartPoint,
  DynamicRoadmapCard,
  HorizontalTrendAnalysis,
  IN_AQI_BANDS,
  IndianSkylineSvg,
  LivePulseBadge,
  MiniAqiMapCard,
  POLLUTANT_META,
  PollutantKey,
  RadialDialMeter,
  resolveBand,
  RoadmapStep,
  ScaleBand,
  SpectrumScaleBar,
  StepperControl,
  SwitchControl,
  US_AQI_BANDS,
} from '@/components/ui/AqiVisuals';
import { HourlyAirPoint, LiveAirBundle } from '@/lib/types';
import { cn, computeUsAqi, formatIstTime, formatShortHour } from '@/lib/utils';

type ActiveTab = 'aqi' | 'history' | 'weather' | PollutantKey;
type TimeframeKey = '12h' | '24h' | '48h' | 'forecast48h';

const WEATHER_TEMP_BANDS: ScaleBand[] = [
  { label: 'Cool', min: 0, max: 16, color: '#38BDF8', heroGrad: 'from-[#123A5C] via-[#1B5886] to-[#123654]' },
  { label: 'Pleasant', min: 16, max: 24, color: '#22C55E', heroGrad: 'from-[#145369] via-[#1D748B] to-[#154A63]' },
  { label: 'Comfortable', min: 24, max: 30, color: '#14B8A6', heroGrad: 'from-[#164E63] via-[#0E7490] to-[#1E3A5F]' },
  { label: 'Warm', min: 30, max: 36, color: '#F59E0B', heroGrad: 'from-[#684414] via-[#9A6518] to-[#5C3B12]' },
  { label: 'Hot', min: 36, max: 42, color: '#F97316', heroGrad: 'from-[#6D2E16] via-[#A3451E] to-[#5E2612]' },
  { label: 'Extreme', min: 42, max: 52, color: '#EF4444', heroGrad: 'from-[#5C1622] via-[#942234] to-[#4E121D]' },
];

const FEATURE_DIRECTORY = [
  { href: '/dashboard/live-air', title: 'Live Air Corridors', desc: 'Hyperlocal corridor map, sub-index meters & ventilation checker', icon: Activity, color: '#22C55E', badge: 'LIVE' },
  { href: '/dashboard/pollution-shadow', title: 'Pollution Shadow', desc: '72h plume drift trajectory, wind dial & hourly scrubber', icon: Radar, color: '#8B5CF6', badge: '72H FORECAST' },
  { href: '/dashboard/future-me', title: 'Future Me Simulator', desc: 'Interactive habit switches & steppers projecting exposure savings', icon: Sparkles, color: '#EC4899', badge: 'WHAT-IF LAB' },
  { href: '/dashboard/routes', title: 'Route & Commute', desc: 'Compare transport modes, departure shifts, exposure & CO₂ curves', icon: Route, color: '#14B8A6', badge: 'MOBILITY' },
  { href: '/dashboard/replanner', title: 'Daily Replanner', desc: 'Slide activity hours & outdoor windows against the 24h AQI curve', icon: CalendarClock, color: '#F59E0B', badge: 'PLANNER' },
  { href: '/dashboard/home', title: 'VAYU Home Indoor', desc: 'Room CADR purifier stepper, window/cooking switches & decay graph', icon: Home, color: '#10B981', badge: 'INDOOR TWIN' },
  { href: '/dashboard/family', title: 'Family Guardian', desc: 'Per-member AQI alert steppers, protection toggles & care roadmap', icon: HeartHandshake, color: '#F43F5E', badge: 'HOUSEHOLD' },
  { href: '/dashboard/campus', title: 'VAYU Campus', desc: 'Outdoor sports threshold controls, classroom filtration & schedule', icon: GraduationCap, color: '#0EA5E9', badge: 'CAMPUS OPS' },
  { href: '/dashboard/community', title: 'VAYU Community', desc: 'Sensor trust meters, anomaly indicators, clean zones & pledges', icon: Users, color: '#84CC16', badge: 'CIVIC' },
  { href: '/dashboard/incidents', title: 'Incident Reporting', desc: 'Geo-pinned non-accusatory hazard reports with moderation trail', icon: Megaphone, color: '#F97316', badge: 'REPORTS' },
  { href: '/dashboard/assistant', title: 'VAYU AI Copilot', desc: 'Grounded air & routine guidance citing live city data + timestamps', icon: Bot, color: '#21D4E8', badge: 'AI GUIDE' },
  { href: '/dashboard/alerts', title: 'Threshold Alerts', desc: 'Custom AQI & forecast spike triggers with live notification feed', icon: Bell, color: '#EAB308', badge: 'ALERTS' },
  { href: '/dashboard/reports', title: 'Impact & Briefings', desc: 'Verified action ledger, saved scenarios & downloadable reports', icon: FileBarChart2, color: '#A78BFA', badge: 'LEDGER' },
  { href: '/dashboard/trust', title: 'Trust & Data Sources', desc: 'Scientific provenance audit, CPCB/EPA methodology & privacy scope', icon: ShieldCheck, color: '#60A5FA', badge: 'PROVENANCE' },
];

function extractPointMetric(
  pt: HourlyAirPoint,
  tab: ActiveTab,
  aqiStandard: 'IN' | 'US',
  useAltUnit: boolean
): number {
  if (tab === 'weather') return pt.temp_c ?? 24;
  if (tab === 'aqi' || tab === 'history') {
    return aqiStandard === 'US' ? computeUsAqi(pt.pm25, pt.pm10) : pt.indian_aqi;
  }
  if (tab === 'pm25') return pt.pm25 ?? 0;
  if (tab === 'pm10') return pt.pm10 ?? 0;
  if (tab === 'co') {
    const ug = (pt.co_mg ?? 0.35) * 1000;
    const ppb = Math.round(ug / 1.145);
    return useAltUnit ? Math.round(ug) : ppb;
  }
  if (tab === 'so2') {
    const ug = pt.so2 ?? 8;
    return useAltUnit ? Math.round((ug / 2.62) * 10) / 10 : ug;
  }
  if (tab === 'no2') {
    const ug = pt.no2 ?? 18;
    return useAltUnit ? Math.round((ug / 1.88) * 10) / 10 : ug;
  }
  if (tab === 'o3') {
    const ug = pt.o3 ?? 42;
    return useAltUnit ? Math.round((ug / 1.96) * 10) / 10 : ug;
  }
  return pt.indian_aqi;
}

export default function DashboardOverviewPage() {
  const {
    user,
    selectedCity,
    selectedLocation,
    setSelectedCity,
    selectLocation,
    aqiStandard,
    setAqiStandard,
    toast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<ActiveTab>('aqi');
  const [timeframe, setTimeframe] = useState<TimeframeKey>('24h');
  const [useAltUnit, setUseAltUnit] = useState(false);

  const [airData, setAirData] = useState<LiveAirBundle | null>(null);
  const [cityBubbles, setCityBubbles] = useState<CityBubbleItem[]>([]);
  const [cityFilter, setCityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [loggingAction, setLoggingAction] = useState(false);

  // Interactive Scenario Controls (Switches + Increment/Decrement Steppers)
  const [emissionDeltaPct, setEmissionDeltaPct] = useState(0); // -45% to +60%
  const [outdoorMins, setOutdoorMins] = useState(60); // 15 to 240 mins
  const [windBoostPct, setWindBoostPct] = useState(0); // -40% to +80%
  const [alertThreshold, setAlertThreshold] = useState(
    user?.preferences?.aqi_alert_threshold || 150
  );
  const [swMask, setSwMask] = useState(false);
  const [swCleanWindow, setSwCleanWindow] = useState(true);
  const [swHepa, setSwHepa] = useState(Boolean(user?.routine?.has_indoor_purifier ?? true));
  const [swTransit, setSwTransit] = useState(false);

  const fetchCityAir = useCallback(
    async (city: string, silent = false, lat?: number | null, lon?: number | null) => {
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams({ city });
        if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
          qs.set('lat', String(lat));
          qs.set('lon', String(lon));
        }
        const res = await fetch(`/api/v1/air/live?${qs.toString()}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (res.ok) {
          const json: LiveAirBundle = await res.json();
          setAirData(json);
        }
      } catch {
        // Keep prior snapshot
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchNetwork = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/air/network', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const raw = json.cities || json.stations || [];
      const mapped: CityBubbleItem[] = raw.map(
        (c: { city: string; lat: number; lon: number; indian_aqi: number; pm25: number | null; pm10: number | null }) => {
          const v = aqiStandard === 'US' ? computeUsAqi(c.pm25, c.pm10) : c.indian_aqi;
          const b = resolveBand(v, aqiStandard === 'US' ? US_AQI_BANDS : IN_AQI_BANDS).band;
          return {
            city: c.city,
            lat: c.lat,
            lon: c.lon,
            aqi: v,
            category: b.label,
            color: b.color,
            pm25: c.pm25,
          };
        }
      );
      setCityBubbles(mapped);
    } catch {
      // ignore
    }
  }, [aqiStandard]);

  useEffect(() => {
    fetchCityAir(selectedCity, false, selectedLocation.lat, selectedLocation.lon);
  }, [selectedCity, selectedLocation.lat, selectedLocation.lon, fetchCityAir]);

  useEffect(() => {
    fetchNetwork();
  }, [fetchNetwork]);

  // Auto-refresh live data every 90s while on dashboard
  useEffect(() => {
    const id = setInterval(() => {
      fetchCityAir(selectedCity, true, selectedLocation.lat, selectedLocation.lon);
    }, 90000);
    return () => clearInterval(id);
  }, [selectedCity, selectedLocation.lat, selectedLocation.lon, fetchCityAir]);

  // Reset alt-unit when switching pollutant tab
  useEffect(() => {
    setUseAltUnit(false);
  }, [activeTab]);

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast('info', 'Location', `Showing live monitoring for ${selectedCity} — or click anywhere on the live map below.`);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        try {
          const res = await fetch(`/api/v1/air/point?lat=${lat}&lon=${lon}`, {
            credentials: 'include',
            cache: 'no-store',
          });
          if (res.ok) {
            const json: LiveAirBundle = await res.json();
            setAirData(json);
            selectLocation({
              city: json.location.city,
              state: json.location.state,
              country: json.location.country,
              lat,
              lon,
              isCustomPin: true,
            });
            toast(
              'success',
              `Located: ${json.location.city}`,
              `Live AQI ${json.current.indian_aqi} (${json.current.category}) at your coordinates.`
            );
          }
        } catch {
          toast('error', 'Location lookup failed', 'Try searching your city or clicking on the live map.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast('info', 'Location permission skipped', `Search any city or click anywhere on the live map below.`);
      },
      { timeout: 6000, maximumAge: 120000 }
    );
  };

  const resetSimulator = () => {
    setEmissionDeltaPct(0);
    setOutdoorMins(60);
    setWindBoostPct(0);
    setSwMask(false);
    setSwCleanWindow(true);
    setSwHepa(true);
    setSwTransit(false);
  };

  // Resolve current active tab metadata, value, unit, and dynamic color theme
  const isPollutantTab =
    activeTab === 'pm25' ||
    activeTab === 'pm10' ||
    activeTab === 'co' ||
    activeTab === 'so2' ||
    activeTab === 'no2' ||
    activeTab === 'o3';
  const polMeta = isPollutantTab ? POLLUTANT_META[activeTab] : null;

  const activeSpec = useMemo(() => {
    const cur = airData?.current;
    if (activeTab === 'weather') {
      const temp = cur?.weather.temp_c ?? 24;
      const { band } = resolveBand(temp, WEATHER_TEMP_BANDS);
      return {
        title: `${selectedCity} Weather & Atmospheric Dispersion`,
        metricShort: 'Temp',
        unit: '°C',
        value: temp,
        bands: WEATHER_TEMP_BANDS,
        ticks: ['0°', '16°', '24°', '30°', '36°', '42°', '48°+'],
        band,
        maxDial: 50,
      };
    }
    if (polMeta) {
      let baseVal = 0;
      if (activeTab === 'pm25') baseVal = cur?.pollutants.pm25 ?? 0;
      if (activeTab === 'pm10') baseVal = cur?.pollutants.pm10 ?? 0;
      if (activeTab === 'co') {
        const ug = cur?.pollutants.co_ug ?? (cur?.pollutants.co_mg ?? 0.35) * 1000;
        baseVal = Math.round(ug / 1.145);
      }
      if (activeTab === 'so2') baseVal = cur?.pollutants.so2 ?? 0;
      if (activeTab === 'no2') baseVal = cur?.pollutants.no2 ?? 0;
      if (activeTab === 'o3') baseVal = cur?.pollutants.o3 ?? 0;

      const { band } = resolveBand(baseVal, polMeta.bands);
      const shownVal =
        useAltUnit && polMeta.toAltUnit ? polMeta.toAltUnit(baseVal) : Math.round(baseVal * 10) / 10;
      const shownUnit = useAltUnit && polMeta.altUnit ? polMeta.altUnit : polMeta.unit;

      return {
        title: `${selectedCity} ${polMeta.fullName} | Real-Time Level`,
        metricShort: polMeta.short,
        unit: shownUnit,
        value: shownVal,
        baseValueForBand: baseVal,
        bands: polMeta.bands,
        ticks: polMeta.ticks,
        band,
        maxDial: polMeta.bands[polMeta.bands.length - 2]?.max || 300,
      };
    }

    // Default AQI or History tab
    const inAqi = cur?.indian_aqi ?? 0;
    const usAqi = cur?.us_aqi ?? computeUsAqi(cur?.pollutants.pm25, cur?.pollutants.pm10);
    const val = aqiStandard === 'US' ? usAqi : inAqi;
    const bands = aqiStandard === 'US' ? US_AQI_BANDS : IN_AQI_BANDS;
    const { band } = resolveBand(val, bands);
    return {
      title:
        activeTab === 'history'
          ? `${selectedCity} Historical & Forecast AQI Analytics`
          : `${selectedCity} Air Quality Index (AQI) | Air Pollution`,
      metricShort: aqiStandard === 'US' ? 'AQI (US)' : 'AQI (IN)',
      unit: aqiStandard === 'US' ? '(AQI-US)' : '(NAQI-IN)',
      value: val,
      bands,
      ticks:
        aqiStandard === 'US'
          ? ['0', '50', '100', '150', '200', '300', '301+']
          : ['0', '50', '100', '200', '300', '400', '401+'],
      band,
      maxDial: 450,
    };
  }, [airData, activeTab, polMeta, selectedCity, aqiStandard, useAltUnit]);

  // Compute deterministic What-If factor from interactive controls
  const simulation = useMemo(() => {
    // Wind dispersion inversely shifts airborne concentration; transit reduces local corridor factor
    const ambientMultiplier = Math.max(
      0.25,
      (1 + emissionDeltaPct / 100) *
        (1 - windBoostPct * 0.0035) *
        (swTransit ? 0.92 : 1) *
        (swCleanWindow ? 0.84 : 1)
    );

    // Personal inhaled/indoor effective factor adds N95 filtration & indoor HEPA protection
    const personalProtectionFactor =
      (swMask ? 0.42 : 1) * (swHepa ? 0.78 : 1);

    const effectiveMultiplier =
      activeTab === 'weather'
        ? 1 + emissionDeltaPct * 0.0015 - windBoostPct * 0.001
        : Math.max(0.15, ambientMultiplier * (swMask ? 0.65 : 1) * (swHepa ? 0.88 : 1));

    const simulatedValue = Math.max(
      0,
      Math.round(activeSpec.value * effectiveMultiplier * 10) / 10
    );
    const deltaPct =
      activeSpec.value > 0
        ? Math.round(((simulatedValue - activeSpec.value) / activeSpec.value) * 100)
        : 0;

    // Non-medical Personal Relative Exposure Index (0 - 100)
    const baseAqi = airData?.current.indian_aqi ?? 120;
    const rawExposure =
      (baseAqi / 260) * (outdoorMins / 60) * ambientMultiplier * personalProtectionFactor * 52;
    const exposureIndex = Math.min(100, Math.max(4, Math.round(rawExposure)));
    const baselineExposure = Math.min(100, Math.max(6, Math.round((baseAqi / 260) * 52)));
    const exposureDeltaPct = Math.round(
      ((exposureIndex - baselineExposure) / Math.max(1, baselineExposure)) * 100
    );

    // Protection Readiness Score (0 - 100%)
    let readiness = 28;
    if (swMask) readiness += 26;
    if (swCleanWindow) readiness += 20;
    if (swHepa) readiness += 16;
    if (swTransit) readiness += 10;
    if (outdoorMins <= 45) readiness = Math.min(100, readiness + 8);
    if (outdoorMins >= 150) readiness = Math.max(12, readiness - 12);

    const simBand = resolveBand(simulatedValue, activeSpec.bands).band;

    return {
      effectiveMultiplier,
      ambientMultiplier,
      simulatedValue,
      deltaPct,
      exposureIndex,
      exposureDeltaPct,
      readiness,
      simBand,
    };
  }, [
    emissionDeltaPct,
    windBoostPct,
    outdoorMins,
    swMask,
    swCleanWindow,
    swHepa,
    swTransit,
    activeTab,
    activeSpec,
    airData,
  ]);

  // Build timeframe series for ColorCodedAirChart with live What-If overlay
  const chartSeries: ColoredChartPoint[] = useMemo(() => {
    if (!airData) return [];
    let slice: HourlyAirPoint[] = [];
    if (timeframe === '12h') slice = airData.history_48h.slice(-12);
    else if (timeframe === '24h') slice = airData.history_48h.slice(-24);
    else if (timeframe === '48h') slice = airData.history_48h.slice(-48);
    else slice = airData.forecast_72h.slice(0, 48);

    const showSimOverlay =
      emissionDeltaPct !== 0 ||
      windBoostPct !== 0 ||
      swMask ||
      swTransit ||
      swCleanWindow ||
      swHepa;

    return slice.map((pt) => {
      const val = extractPointMetric(pt, activeTab, aqiStandard, useAltUnit);
      const sim = Math.max(0, Math.round(val * simulation.effectiveMultiplier * 10) / 10);
      return {
        label: formatShortHour(pt.time),
        fullTime: pt.time,
        value: Math.round(val * 10) / 10,
        simulated: showSimOverlay ? sim : undefined,
      };
    });
  }, [
    airData,
    timeframe,
    activeTab,
    aqiStandard,
    useAltUnit,
    simulation.effectiveMultiplier,
    emissionDeltaPct,
    windBoostPct,
    swMask,
    swTransit,
    swCleanWindow,
    swHepa,
  ]);

  // Build hourly trend points for HorizontalTrendAnalysis (image-5 style)
  const trendPoints = useMemo(() => {
    if (!airData) return [];
    return airData.combined_timeline.slice(0, 72).map((pt) => ({
      time: pt.time,
      value: extractPointMetric(pt, activeTab, aqiStandard, useAltUnit),
    }));
  }, [airData, activeTab, aqiStandard, useAltUnit]);

  // Dynamic 4-step Roadmap reacting instantly to active tab + switches + steppers
  const roadmap = useMemo(() => {
    const cleanHr = formatShortHour(airData?.comparison.cleanest_window?.time) || '14:30';
    const cleanAqi = airData?.comparison.cleanest_window?.indian_aqi ?? '—';
    const peakHr = formatShortHour(airData?.comparison.peak_window?.time) || '07:00';
    const peakAqi = airData?.comparison.peak_window?.indian_aqi ?? '—';
    const exceedsAlert =
      (activeTab === 'aqi' || activeTab === 'history') && simulation.simulatedValue >= alertThreshold;

    const headline =
      simulation.deltaPct < 0
        ? `With your active controls, effective ${activeSpec.metricShort} shifts from ${activeSpec.value} → ${simulation.simulatedValue} (${simulation.deltaPct}%) and Exposure Index sits at ${simulation.exposureIndex}/100.`
        : simulation.deltaPct > 0
          ? `Rising conditions push projected ${activeSpec.metricShort} from ${activeSpec.value} → ${simulation.simulatedValue} (+${simulation.deltaPct}%). Enable N95 + Clean Window below to bend the curve down.`
          : `Baseline ${selectedCity} ${activeSpec.metricShort} is ${activeSpec.value} (${activeSpec.band.label}). Adjust any switch or −/+ control to simulate actions.`;

    const steps: RoadmapStep[] = [
      {
        phase: 'OBSERVE',
        title: `${activeSpec.metricShort}: ${activeSpec.value} (${activeSpec.band.label})`,
        detail: polMeta
          ? `${polMeta.cpcbLimit}. Primary local drivers: ${polMeta.commonSources.slice(0, 88)}...`
          : `Peak expected near ${peakHr} (AQI ${peakAqi}); cleanest forecast window around ${cleanHr} (AQI ${cleanAqi}).`,
        impact: exceedsAlert ? `Above ${alertThreshold} alert line` : `Below ${alertThreshold} alert line`,
        status: exceedsAlert ? 'caution' : 'active',
      },
      {
        phase: 'TIMING',
        title: swCleanWindow
          ? `Outdoor ${outdoorMins}m Locked to ${cleanHr}`
          : `Unshifted ${outdoorMins}m Outdoor Window`,
        detail: swCleanWindow
          ? `Scheduling your ${outdoorMins}-minute outdoor block around ${cleanHr} takes advantage of afternoon boundary-layer mixing.`
          : `Turn ON "Shift to Cleanest Window" or step duration below 45 min to avoid the ${peakHr} peak band.`,
        impact: swCleanWindow ? '−16% timing exposure (EST.)' : `${outdoorMins} min unshifted`,
        status: swCleanWindow && outdoorMins <= 90 ? 'active' : 'caution',
      },
      {
        phase: 'PROTECT',
        title:
          swMask && swHepa
            ? 'Dual Shield: N95 + Indoor HEPA Active'
            : swMask
              ? 'Outdoor N95 Active · Enable HEPA Indoors'
              : swHepa
                ? 'Indoor HEPA Active · Add N95 for Peaks'
                : 'No Filtration Active Yet',
        detail: polMeta
          ? polMeta.protectionTip
          : `Wind dispersion offset is ${windBoostPct >= 0 ? `+${windBoostPct}%` : `${windBoostPct}%`} and emission change is ${emissionDeltaPct >= 0 ? `+${emissionDeltaPct}%` : `${emissionDeltaPct}%`}.`,
        impact: `Readiness ${simulation.readiness}%`,
        status: simulation.readiness >= 65 ? 'active' : 'recommended',
      },
      {
        phase: 'ACT & VERIFY',
        title: swTransit
          ? 'Low-Emission Transit + Verified Plan'
          : 'Switch Commute & Log Action Plan',
        detail: swTransit
          ? 'Shared/metro commute trims corridor intake and lowers estimated per-trip tailpipe CO₂ — ready to record in your Impact Ledger.'
          : 'Toggle Low-Emission Transit to cut corridor pollution intake by ~8% and record your daily environmental action.',
        impact: `${simulation.exposureDeltaPct <= 0 ? simulation.exposureDeltaPct : `+${simulation.exposureDeltaPct}`}% rel. exposure (EST.)`,
        status: simulation.exposureDeltaPct <= -15 ? 'active' : 'recommended',
      },
    ];

    return { headline, steps };
  }, [
    airData,
    activeTab,
    activeSpec,
    simulation,
    alertThreshold,
    selectedCity,
    polMeta,
    swCleanWindow,
    outdoorMins,
    swMask,
    swHepa,
    swTransit,
    windBoostPct,
    emissionDeltaPct,
  ]);

  const handleLogRoadmapAction = async () => {
    setLoggingAction(true);
    try {
      const savedPct = Math.max(5, Math.abs(Math.min(0, simulation.exposureDeltaPct)));
      const co2Saved = swTransit ? 620 : 180;
      const res = await fetch('/api/v1/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: `${selectedCity} ${activeSpec.metricShort} Action Plan (${outdoorMins}m${swMask ? ' + N95' : ''}${swHepa ? ' + HEPA' : ''}${swTransit ? ' + Transit' : ''})`,
          action_category: swTransit ? 'mobility' : swHepa ? 'indoor' : 'daily_protection',
          estimated_exposure_saved_pct: savedPct,
          estimated_co2_saved_g: co2Saved,
        }),
      });
      if (res.ok) {
        toast('success', 'Logged to Impact Ledger', `Saved estimated ${savedPct}% exposure reduction & ${co2Saved}g CO₂ avoided.`);
      } else {
        toast('error', 'Could not save action', 'Please try again.');
      }
    } finally {
      setLoggingAction(false);
    }
  };

  // Monitored Indian cities sorted for clean reference card
  const rankedCities = useMemo(
    () => [...cityBubbles].sort((a, b) => b.aqi - a.aqi),
    [cityBubbles]
  );

  return (
    <div className="space-y-6 pb-10">
      {/* ------------------------------------------------------------------ */}
      {/* 1. TOP AQI / WEATHER MODE BAR + POLLUTANT PILL TABS (image-3 & 6)  */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#181F29] p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: AQI | Weather Primary Switcher */}
        <div className="inline-flex items-center gap-1 rounded-xl bg-[#11161E] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('aqi')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition',
              activeTab !== 'weather'
                ? 'bg-[#3898FF] text-white shadow shadow-[#3898FF]/30'
                : 'text-slate-300 hover:text-white'
            )}
          >
            <Wind className="h-3.5 w-3.5" />
            <span>AQI</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('weather')}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition',
              activeTab === 'weather'
                ? 'bg-[#0EA5E9] text-white shadow shadow-[#0EA5E9]/30'
                : 'text-slate-300 hover:text-white'
            )}
          >
            <Sun className="h-3.5 w-3.5 text-amber-300" />
            <span>Weather</span>
          </button>
        </div>

        {/* Right: Feature/Pollutant View Pills — each opens a unique visual look */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['aqi', 'AQI'],
              ['history', 'History'],
              ['pm25', 'PM2.5'],
              ['pm10', 'PM10'],
              ['co', 'CO'],
              ['so2', 'SO₂'],
              ['no2', 'NO₂'],
              ['o3', 'O₃'],
            ] as [ActiveTab, string][]
          ).map(([key, label]) => {
            const isSelected = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition',
                  isSelected
                    ? 'border border-[#3898FF] bg-[#3898FF]/20 text-white shadow-sm'
                    : 'border border-white/10 bg-[#121821] text-slate-300 hover:border-white/25 hover:text-white'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. TITLE HEADER + LOCATE ME + REFRESH (image-3 & image-6 layout)   */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <LivePulseBadge isLive={airData ? airData.is_live : true} />
            <ProvenanceBadge type={airData?.provenance.concentrations_class || 'MODEL FORECAST'} compact />
            {activeTab !== 'weather' && !polMeta && <ProvenanceBadge type="ESTIMATED" compact />}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {activeSpec.title}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Real-time {selectedCity}, {airData?.location.state || 'India'} data · Last Updated:{' '}
            <span className="text-slate-200">{formatIstTime(airData?.current.observed_time_ist)}</span>
            {' · '}Nearest reference: <span className="text-slate-300">{airData?.location.nearest_reference_station || selectedCity}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {polMeta?.altUnit && (
            <button
              type="button"
              onClick={() => setUseAltUnit((v) => !v)}
              className="rounded-xl border border-white/15 bg-[#181F29] px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-[#3898FF] hover:text-white"
            >
              Unit: {useAltUnit ? polMeta.altUnit : polMeta.unit} ⇄
            </button>
          )}
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3898FF] px-4 py-2 text-xs font-bold text-white shadow shadow-[#3898FF]/25 transition hover:bg-[#4DA4FF] disabled:opacity-60"
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span>{locating ? 'Locating...' : 'Locate me'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              fetchCityAir(selectedCity);
              fetchNetwork();
            }}
            aria-label="Refresh telemetry"
            className="rounded-xl border border-white/15 bg-[#181F29] p-2 text-slate-300 transition hover:border-white/30 hover:text-white"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 3. DYNAMIC STATUS-COLORED SKYLINE HERO + AQI MAP CARD              */}
      {/*    Morphs visually for AQI (image-3), Pollutants (image-6), Weather */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid items-stretch gap-5 lg:grid-cols-12">
        <div
          className={cn(
            'relative flex flex-col justify-between overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br p-6 sm:p-8 shadow-2xl transition-all duration-500 lg:col-span-9',
            activeSpec.band.heroGrad
          )}
        >
          <IndianSkylineSvg className="absolute inset-x-0 bottom-0 h-28 text-black/20 sm:h-36" />

          {polMeta ? (
            /* POLLUTANT-SPECIFIC APPEARANCE (exact image-6 emerald/amber/rose style) */
            <div className="relative z-10 flex h-full flex-col justify-between gap-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-white/90">
                    <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                    <span>Live {polMeta.short} Level</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2.5">
                    <span className="font-display text-6xl font-extrabold tracking-tight text-white sm:text-7xl">
                      {airData ? activeSpec.value : '—'}
                    </span>
                    <span className="text-base font-semibold text-white/90">{activeSpec.unit}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-white/85">
                    CPCB Benchmark: <strong>{polMeta.cpcbLimit}</strong> · Sub-Index:{' '}
                    <strong>{airData?.current.sub_indices?.[polMeta.short.replace('₂', '2').replace('₃', '3')] ?? '—'}</strong>
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <span className="inline-block rounded-2xl border border-white/25 bg-white/20 px-7 py-3 font-display text-2xl font-bold text-white backdrop-blur-md">
                    {airData ? activeSpec.band.label : '...'}
                  </span>
                  <p className="mt-2 text-[11px] text-white/85">
                    Last Updated: {formatIstTime(airData?.current.observed_time_ist)}
                  </p>
                </div>
              </div>

              <SpectrumScaleBar
                value={(activeSpec as { baseValueForBand?: number }).baseValueForBand ?? activeSpec.value}
                bands={polMeta.bands}
                ticks={polMeta.ticks}
              />
            </div>
          ) : activeTab === 'weather' ? (
            /* DEDICATED WEATHER INTELLIGENCE APPEARANCE */
            <div className="relative z-10 flex h-full flex-col justify-between gap-6">
              <div className="grid items-center gap-6 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-sky-100">
                    <Sun className="h-4 w-4 text-amber-300" />
                    <span>Live Atmospheric Weather</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-display text-6xl font-extrabold text-white sm:text-7xl">
                      {airData?.current.weather.temp_c ?? '—'}
                    </span>
                    <span className="text-2xl font-bold text-white/90">°C</span>
                  </div>
                  <p className="mt-1 text-xs text-white/85">
                    Feels like {airData?.current.weather.feels_like_c ?? airData?.current.weather.temp_c ?? '—'} °C ·{' '}
                    {activeSpec.band.label} thermal band
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="rounded-2xl border border-white/20 bg-white/12 p-3.5 backdrop-blur">
                    <p className="text-white/75">Humidity</p>
                    <p className="mt-1 font-display text-xl font-bold text-white">
                      {airData?.current.weather.humidity_pct ?? '—'}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/12 p-3.5 backdrop-blur">
                    <p className="text-white/75">Wind Speed</p>
                    <p className="mt-1 font-display text-xl font-bold text-white">
                      {airData?.current.weather.wind_kph ?? '—'} km/h
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/12 p-3.5 backdrop-blur">
                    <p className="text-white/75">Wind Direction</p>
                    <p className="mt-1 font-display text-xl font-bold text-white">
                      {airData?.current.weather.wind_compass || 'Calm'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/20 bg-white/12 p-3.5 backdrop-blur">
                    <p className="text-white/75">Surface Pressure</p>
                    <p className="mt-1 font-display text-xl font-bold text-white">
                      {airData?.current.weather.pressure_hpa ? `${Math.round(airData.current.weather.pressure_hpa)} hPa` : '—'}
                    </p>
                  </div>
                </div>
              </div>

              <SpectrumScaleBar
                value={activeSpec.value}
                bands={WEATHER_TEMP_BANDS}
                ticks={activeSpec.ticks}
              />
            </div>
          ) : (
            /* AQI & HISTORY APPEARANCE (exact image-3 layout + spectrum bar + frosted weather card) */
            <div className="relative z-10 grid items-center gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-white/90">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#FF4D4F] ring-2 ring-white/50 animate-pulse" />
                      <span>Live AQI</span>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="font-display text-6xl font-extrabold tracking-tight text-white sm:text-7xl">
                        {airData ? activeSpec.value : '—'}
                      </span>
                      <span className="text-xs font-semibold text-white/85">{activeSpec.unit}</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-center">
                    <p className="text-xs font-medium text-white/85">Air Quality is</p>
                    <span className="mt-1 inline-block rounded-2xl border border-white/25 bg-white/15 px-6 py-2.5 font-display text-2xl font-bold text-white backdrop-blur-md">
                      {airData ? activeSpec.band.label : '...'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-sm text-white/90">
                  <button
                    type="button"
                    onClick={() => setActiveTab('pm25')}
                    className="hover:underline"
                  >
                    PM2.5 : <strong className="text-white">{airData?.current.pollutants.pm25 ?? '—'}</strong>{' '}
                    <span className="text-xs text-white/75">µg/m³</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('pm10')}
                    className="hover:underline"
                  >
                    PM10 : <strong className="text-white">{airData?.current.pollutants.pm10 ?? '—'}</strong>{' '}
                    <span className="text-xs text-white/75">µg/m³</span>
                  </button>
                  <span className="text-xs text-white/80">
                    Primary: <strong className="text-white">{airData?.current.dominant_pollutant || 'PM2.5'}</strong>
                  </span>
                </div>

                <SpectrumScaleBar
                  value={activeSpec.value}
                  bands={activeSpec.bands}
                  ticks={activeSpec.ticks}
                />
              </div>

              {/* Frosted Live Weather Panel */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-white/20 bg-white/[0.13] p-5 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                        <Cloud className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <p className="font-display text-3xl font-bold text-white">
                          {airData?.current.weather.temp_c ?? '—'} <span className="text-lg">°C</span>
                        </p>
                        <p className="text-xs font-medium text-white/85">
                          Wind {airData?.current.weather.wind_compass || 'Calm'} · vs yesterday{' '}
                          {airData
                            ? airData.comparison.delta_aqi > 0
                              ? `+${airData.comparison.delta_aqi}`
                              : airData.comparison.delta_aqi
                            : '—'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('weather')}
                      title="Open Weather View"
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-900 shadow transition hover:scale-105"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-3 divide-x divide-white/15 border-t border-white/15 pt-3.5 text-center text-[11.5px]">
                    <div>
                      <p className="inline-flex items-center gap-1 text-white/75">
                        <Droplets className="h-3 w-3" /> Humidity
                      </p>
                      <p className="mt-0.5 font-bold text-white">
                        {airData?.current.weather.humidity_pct ?? '—'} %
                      </p>
                    </div>
                    <div>
                      <p className="inline-flex items-center gap-1 text-white/75">
                        <Wind className="h-3 w-3" /> Wind Speed
                      </p>
                      <p className="mt-0.5 font-bold text-white">
                        {airData?.current.weather.wind_kph ?? '—'} km/h
                      </p>
                    </div>
                    <div>
                      <p className="text-white/75">Cleanest Hr</p>
                      <p className="mt-0.5 font-bold text-white">
                        {formatShortHour(airData?.comparison.cleanest_window?.time)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Side Live Bubble Map Card — jumps straight to full click-anywhere live map */}
        <div className="lg:col-span-3">
          <MiniAqiMapCard
            activeCity={selectedCity}
            cities={cityBubbles}
            onSelectCity={(city) => setSelectedCity(city)}
            onPickCoordinates={async (lat, lon) => {
              const rLat = Number(lat.toFixed(4));
              const rLon = Number(lon.toFixed(4));
              try {
                const res = await fetch(`/api/v1/air/point?lat=${rLat}&lon=${rLon}`, {
                  credentials: 'include',
                  cache: 'no-store',
                });
                if (res.ok) {
                  const bundle: LiveAirBundle = await res.json();
                  setAirData(bundle);
                  selectLocation({
                    city: bundle.location.city,
                    state: bundle.location.state,
                    country: bundle.location.country,
                    lat: rLat,
                    lon: rLon,
                    isCustomPin: true,
                  });
                  toast(
                    'success',
                    `${bundle.location.city}, ${bundle.location.state}`,
                    `Live AQI ${bundle.current.indian_aqi} (${bundle.current.category}) loaded from map pin.`
                  );
                }
              } catch {
                toast('error', 'Map lookup failed', 'Please try clicking again.');
              }
            }}
            center={airData ? [airData.location.lat, airData.location.lon] : [30.901, 75.857]}
            className="h-full min-h-[265px]"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* INTERACTIVE ANY-CITY SEARCH & CLICK-ANYWHERE LIVE AIR MAP          */}
      {/* ------------------------------------------------------------------ */}
      <InteractiveAirMapExplorer
        id="dashboard-live-map"
        activeAir={airData}
        onBundleLoaded={(bundle) => setAirData(bundle)}
      />

      {/* Pollutant Explainer Strip when viewing PM2.5 / PM10 / CO / SO₂ / NO₂ / O₃ */}
      {polMeta && (
        <div className="grid gap-4 rounded-2xl border border-white/[0.08] bg-[#181F29] p-5 md:grid-cols-3">
          <div>
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-wider" style={{ color: activeSpec.band.color }}>
              What is {polMeta.short}?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{polMeta.whatIsIt}</p>
          </div>
          <div>
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-amber-400">
              Typical Local Sources
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{polMeta.commonSources}</p>
          </div>
          <div>
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-emerald-400">
              Practical Non-Medical Guidance
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">{polMeta.protectionTip}</p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. INTERACTIVE METERS, SWITCHES & −/+ STEPPERS STUDIO              */}
      {/*    Adjusting any switch or −/+ immediately updates meters, graph   */}
      {/*    overlay, and the 4-step Action Roadmap below!                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#181F29] p-5 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${activeSpec.band.color}24`, color: activeSpec.band.color }}
            >
              <Sliders className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-white sm:text-lg">
                Interactive {activeSpec.metricShort} Meters &amp; Scenario Controls
              </h2>
              <p className="text-xs text-slate-400">
                Toggle switches or tap <strong className="text-white">− / +</strong> to see how the meters, graph curve, and roadmap adapt immediately.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ProvenanceBadge type="ESTIMATED" compact />
            <button
              type="button"
              onClick={resetSimulator}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>

        {/* 3 Live Radial Dial Meters */}
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <RadialDialMeter
            value={simulation.simulatedValue}
            min={0}
            max={activeSpec.maxDial}
            label={`Effective ${activeSpec.metricShort} Meter`}
            unit={polMeta ? ` ${activeSpec.unit}` : activeTab === 'weather' ? '°C' : ''}
            statusText={simulation.simBand.label}
            color={simulation.simBand.color}
            deltaText={
              simulation.deltaPct === 0
                ? 'Live baseline'
                : `${simulation.deltaPct > 0 ? '+' : ''}${simulation.deltaPct}% vs live`
            }
            deltaGood={simulation.deltaPct <= 0}
          />
          <RadialDialMeter
            value={simulation.exposureIndex}
            min={0}
            max={100}
            label="Personal Exposure Index"
            unit="/100"
            statusText={
              simulation.exposureIndex <= 30
                ? 'Low Load'
                : simulation.exposureIndex <= 60
                  ? 'Moderate Load'
                  : 'Elevated Load'
            }
            color={
              simulation.exposureIndex <= 30
                ? '#22C55E'
                : simulation.exposureIndex <= 60
                  ? '#F59E0B'
                  : '#EC487F'
            }
            deltaText={`${simulation.exposureDeltaPct > 0 ? '+' : ''}${simulation.exposureDeltaPct}% vs routine`}
            deltaGood={simulation.exposureDeltaPct <= 0}
          />
          <RadialDialMeter
            value={simulation.readiness}
            min={0}
            max={100}
            label="Protection Readiness Meter"
            unit="%"
            statusText={
              simulation.readiness >= 75
                ? 'Strong Shield'
                : simulation.readiness >= 50
                  ? 'Partial Shield'
                  : 'Action Needed'
            }
            color={
              simulation.readiness >= 75
                ? '#12BFA5'
                : simulation.readiness >= 50
                  ? '#3898FF'
                  : '#F97316'
            }
            deltaText={`${[swMask, swCleanWindow, swHepa, swTransit].filter(Boolean).length}/4 switches ON`}
            deltaGood={simulation.readiness >= 55}
          />
        </div>

        {/* Increment / Decrement Steppers + Interactive Switches */}
        <div className="mt-5 grid gap-4 lg:grid-cols-12">
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
            <StepperControl
              label="Ambient Emission Shift"
              hint="Simulate local pollution rise (+) or reduction (−)"
              value={emissionDeltaPct}
              min={-45}
              max={60}
              step={5}
              formatValue={(v) => `${v > 0 ? '+' : ''}${v}%`}
              onChange={setEmissionDeltaPct}
              accentColor={activeSpec.band.color}
            />
            <StepperControl
              label="Outdoor Exposure Duration"
              hint="Daily minutes spent outdoors in open air"
              value={outdoorMins}
              min={15}
              max={240}
              step={15}
              unit=" min"
              onChange={setOutdoorMins}
              accentColor="#3898FF"
            />
            <StepperControl
              label="Wind Dispersion Change"
              hint="Higher breeze disperses trapped surface haze"
              value={windBoostPct}
              min={-40}
              max={80}
              step={10}
              formatValue={(v) => `${v > 0 ? '+' : ''}${v}%`}
              onChange={setWindBoostPct}
              accentColor="#12BFA5"
            />
            <StepperControl
              label="Chart Alert Threshold Line"
              hint="Reference line plotted directly on the graph"
              value={alertThreshold}
              min={25}
              max={400}
              step={25}
              onChange={setAlertThreshold}
              accentColor="#EAB308"
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:col-span-5">
            <SwitchControl
              label="N95 / FFP2 Respirator"
              description="Cuts inhaled fine particulate load outdoors"
              checked={swMask}
              onChange={setSwMask}
              accentColor="#22C55E"
              badge="−35%"
            />
            <SwitchControl
              label="Shift to Cleanest Window"
              description={`Move outdoor block to ~${formatShortHour(airData?.comparison.cleanest_window?.time)}`}
              checked={swCleanWindow}
              onChange={setSwCleanWindow}
              accentColor="#3898FF"
              badge="−16%"
            />
            <SwitchControl
              label="Indoor HEPA Filtration"
              description="Seal windows during peaks & filter room air"
              checked={swHepa}
              onChange={setSwHepa}
              accentColor="#12BFA5"
              badge="−12%"
            />
            <SwitchControl
              label="Metro / Shared Transit"
              description="Avoid heavy congestion & cut trip CO₂"
              checked={swTransit}
              onChange={setSwTransit}
              accentColor="#8B5CF6"
              badge="−8%"
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. COLOR-CODED BAR / LINE GRAPH WITH MIN/MAX & SIM OVERLAY (img-4) */}
      {/* ------------------------------------------------------------------ */}
      <ColorCodedAirChart
        subtitle={`${activeSpec.metricShort} Graph · ${timeframe === 'forecast48h' ? 'Upcoming 48h Forecast' : `Historical ${timeframe}`}`}
        title={
          timeframe === 'forecast48h'
            ? `Predictive 48-Hour ${activeSpec.metricShort} Trajectory`
            : `Historical ${activeSpec.metricShort} Data`
        }
        cityLabel={selectedCity}
        metricLabel={activeSpec.metricShort}
        unit={polMeta ? activeSpec.unit : activeTab === 'weather' ? '°C' : ''}
        data={chartSeries}
        bands={activeSpec.bands}
        defaultMode="bar"
        thresholdValue={activeTab === 'aqi' || activeTab === 'history' || activeTab === 'pm25' || activeTab === 'pm10' ? alertThreshold : undefined}
        thresholdLabel={`Alert: ${alertThreshold}`}
        simulatedLabel={`Adjusted ${activeSpec.metricShort} (${simulation.deltaPct > 0 ? '+' : ''}${simulation.deltaPct}%)`}
        rightSlot={
          <>
            <select
              aria-label="Graph timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframeKey)}
              className="rounded-xl border border-white/15 bg-[#11161E] px-3 py-2 text-xs font-semibold text-white focus:border-[#3898FF] focus:outline-none"
            >
              <option value="12h">12 Hours</option>
              <option value="24h">24 Hours</option>
              <option value="48h">48 Hours</option>
              <option value="forecast48h">Next 48h Forecast</option>
            </select>
            {(activeTab === 'aqi' || activeTab === 'history') && (
              <select
                aria-label="AQI scale standard"
                value={aqiStandard}
                onChange={(e) => setAqiStandard(e.target.value as 'IN' | 'US')}
                className="rounded-xl border border-white/15 bg-[#11161E] px-3 py-2 text-xs font-semibold text-white focus:border-[#3898FF] focus:outline-none"
              >
                <option value="IN">AQI (IN-NAQI)</option>
                <option value="US">AQI (US-EPA)</option>
              </select>
            )}
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* 6. LIVE DYNAMIC ACTION ROADMAP (updates as controls change)        */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-2.5">
        <DynamicRoadmapCard
          title={`Live ${activeSpec.metricShort} Action Roadmap — ${selectedCity}`}
          headline={roadmap.headline}
          accentColor={activeSpec.band.color}
          steps={roadmap.steps}
          provenance="ESTIMATED"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400">
          <span>
            Non-medical environmental planning estimates grounded in live Open-Meteo telemetry.
          </span>
          <button
            type="button"
            disabled={loggingAction}
            onClick={handleLogRoadmapAction}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3898FF] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4DA4FF] disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{loggingAction ? 'Saving...' : 'Commit Plan to Impact Ledger'}</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 7. HORIZONTAL MULTI-WINDOW RISE / FALL TREND PANEL (image-5 style) */}
      {/* ------------------------------------------------------------------ */}
      <HorizontalTrendAnalysis
        title={`Multi-Window ${activeSpec.metricShort} Rise & Fall Trends`}
        cityLabel={selectedCity}
        metricLabel={activeSpec.metricShort}
        unit={polMeta ? activeSpec.unit : ''}
        hourlyPoints={trendPoints}
        bands={activeSpec.bands}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 8. ALL-POLLUTANTS QUICK SWITCHER + INDIA MONITORED CITY STRIP      */}
      {/* ------------------------------------------------------------------ */}
      {airData && (
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Click any gas/particulate meter to switch into its dedicated appearance */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#181F29] p-5 lg:col-span-7">
            <div className="mb-3.5 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-white">
                  Major Air Pollutants — {selectedCity}
                </h3>
                <p className="text-xs text-slate-400">Click any card to open its full meter, graph &amp; roadmap view</p>
              </div>
              <Gauge className="h-4 w-4 text-[#3898FF]" />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {(['pm25', 'pm10', 'co', 'so2', 'no2', 'o3'] as PollutantKey[]).map((k) => {
                const m = POLLUTANT_META[k];
                const p = airData.current.pollutants;
                const val =
                  k === 'pm25'
                    ? p.pm25 ?? 0
                    : k === 'pm10'
                      ? p.pm10 ?? 0
                      : k === 'co'
                        ? Math.round(((p.co_ug ?? (p.co_mg ?? 0.35) * 1000)) / 1.145)
                        : k === 'so2'
                          ? p.so2 ?? 0
                          : k === 'no2'
                            ? p.no2 ?? 0
                            : p.o3 ?? 0;
                const { band, pct } = resolveBand(val, m.bands);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setActiveTab(k)}
                    className={cn(
                      'rounded-xl border p-3.5 text-left transition hover:-translate-y-0.5',
                      activeTab === k
                        ? 'border-white/35 bg-white/[0.08]'
                        : 'border-white/[0.08] bg-[#121821] hover:border-white/20'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{m.short}</span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ backgroundColor: `${band.color}24`, color: band.color }}
                      >
                        {band.label}
                      </span>
                    </div>
                    <p className="mt-2 font-display text-2xl font-bold text-white">
                      {Math.round(val * 10) / 10}
                      <span className="ml-1 text-[11px] font-normal text-slate-400">{m.unit}</span>
                    </p>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: band.color }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Monitored Indian Cities Live Comparison */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#181F29] p-5 lg:col-span-5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-white">
                  Live Monitored Indian Cities ({rankedCities.length})
                </h3>
                <p className="text-xs text-slate-400">Filter below or search any city worldwide on the map above</p>
              </div>
              <span className="font-mono text-[10px] text-slate-400">AQI-{aqiStandard}</span>
            </div>
            <input
              type="text"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              placeholder="Filter 36 Indian cities..."
              className="mb-2.5 w-full rounded-xl border border-white/10 bg-[#111722] px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-[#3898FF] focus:outline-none"
            />
            <div className="max-h-[235px] space-y-1.5 overflow-y-auto pr-1">
              {rankedCities
                .filter(
                  (c) => !cityFilter.trim() || c.city.toLowerCase().includes(cityFilter.trim().toLowerCase())
                )
                .map((c, i) => (
                <button
                  key={c.city}
                  type="button"
                  onClick={() => setSelectedCity(c.city)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs transition',
                    c.city === selectedCity
                      ? 'border border-[#3898FF]/50 bg-[#3898FF]/15 text-white'
                      : 'bg-[#121821] text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 font-mono text-[11px] text-slate-500">#{i + 1}</span>
                    <span className="font-semibold">{c.city}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: c.color }}>
                      {c.category}
                    </span>
                    <span
                      className="min-w-[42px] rounded-lg px-2 py-0.5 text-center font-mono text-xs font-bold text-white"
                      style={{ backgroundColor: c.color }}
                    >
                      {c.aqi}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 9. SPECIALIZED DASHBOARD MODULES DIRECTORY (Each opens unique UI)  */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#181F29] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[10.5px] font-bold uppercase tracking-widest text-[#3898FF]">
              Explore All Platform Functions
            </p>
            <h2 className="mt-1 font-display text-lg font-bold text-white sm:text-xl">
              Specialized Modules, Meters &amp; Simulators
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Every feature opens its own tailored theme, gauges, graphs &amp; interactive roadmap
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURE_DIRECTORY.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className="group flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#121821] p-4 transition hover:-translate-y-0.5 hover:border-white/25"
                style={{ borderTopWidth: '2px', borderTopColor: mod.color }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${mod.color}22`, color: mod.color }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span
                      className="rounded-md px-2 py-0.5 font-mono text-[9.5px] font-bold"
                      style={{ backgroundColor: `${mod.color}1C`, color: mod.color }}
                    >
                      {mod.badge}
                    </span>
                  </div>
                  <h3 className="mt-3 flex items-center justify-between font-display text-sm font-bold text-white">
                    <span>{mod.title}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                  </h3>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{mod.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
