'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Compass,
  Droplets,
  ExternalLink,
  Globe2,
  Loader2,
  MapPin,
  Maximize2,
  Minimize2,
  MousePointerClick,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react';
import DynamicVayuMap from '@/components/maps/VayuMap';
import { CitySearchPicker } from '@/components/ui/CitySearchPicker';
import {
  IN_AQI_BANDS,
  RadialDialMeter,
  resolveBand,
  US_AQI_BANDS,
} from '@/components/ui/AqiVisuals';
import { ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { LiveAirBundle, MapMarkerItem } from '@/lib/types';
import { cn, computeUsAqi, formatIstTime, formatShortHour } from '@/lib/utils';

interface NetworkPin {
  city: string;
  state?: string;
  lat: number;
  lon: number;
  indian_aqi: number;
  us_aqi?: number | null;
  pm25: number | null;
  pm10: number | null;
  no2?: number | null;
  o3?: number | null;
}

interface InteractiveAirMapExplorerProps {
  activeAir?: LiveAirBundle | null;
  onBundleLoaded?: (bundle: LiveAirBundle) => void;
  id?: string;
}

export function InteractiveAirMapExplorer({
  activeAir,
  onBundleLoaded,
  id = 'dashboard-live-map',
}: InteractiveAirMapExplorerProps) {
  const { selectedCity, selectLocation, aqiStandard, toast } = useApp();
  const [networkPins, setNetworkPins] = useState<NetworkPin[]>([]);
  const [inspected, setInspected] = useState<LiveAirBundle | null>(activeAir || null);
  const [inspectingPin, setInspectingPin] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([22.8, 79.0]);
  const [mapZoom, setMapZoom] = useState<number>(5);
  const [pickedCoords, setPickedCoords] = useState<[number, number] | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Sync when parent loads a new city bundle
  useEffect(() => {
    if (!activeAir) return;
    setInspected(activeAir);
    const { lat, lon } = activeAir.location;
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      setPickedCoords([lat, lon]);
      setMapCenter([lat, lon]);
      setMapZoom((prev) => (prev < 7 ? 9 : prev));
    }
  }, [activeAir]);

  // Fetch all 36 curated Indian cities for rich live map bubbles
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/air/network', { credentials: 'include', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setNetworkPins(Array.isArray(d.cities) ? d.cities : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Click ANYWHERE on the Leaflet map -> fetch live air quality + reverse-geocoded place name
  const handleMapClick = useCallback(
    async (lat: number, lon: number) => {
      const rLat = Number(lat.toFixed(4));
      const rLon = Number(lon.toFixed(4));
      setPickedCoords([rLat, rLon]);
      setMapCenter([rLat, rLon]);
      setMapZoom((z) => Math.max(z, 9));
      setInspectingPin(true);
      try {
        const res = await fetch(`/api/v1/air/point?lat=${rLat}&lon=${rLon}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Upstream telemetry unavailable');
        const bundle: LiveAirBundle = await res.json();
        setInspected(bundle);
        onBundleLoaded?.(bundle);
        selectLocation({
          city: bundle.location.city,
          state: bundle.location.state,
          country: bundle.location.country,
          lat: rLat,
          lon: rLon,
          isCustomPin: true,
        });
        const dispAqi =
          aqiStandard === 'US'
            ? (bundle.current.us_aqi ??
              computeUsAqi(bundle.current.pollutants.pm25, bundle.current.pollutants.pm10))
            : bundle.current.indian_aqi;
        toast(
          'success',
          `${bundle.location.city}, ${bundle.location.state}`,
          `Live AQI-${aqiStandard} ${dispAqi} (${bundle.current.category}) — graphs & meters updated.`
        );
      } catch {
        toast('error', 'Map lookup failed', 'Could not load live telemetry for that point. Please retry.');
      } finally {
        setInspectingPin(false);
      }
    },
    [aqiStandard, onBundleLoaded, selectLocation, toast]
  );

  // Click a city AQI marker -> switch directly to that city & zoom in
  const handleMarkerClick = useCallback(
    (m: MapMarkerItem) => {
      selectLocation({
        city: m.id,
        lat: m.lat,
        lon: m.lon,
        isCustomPin: false,
      });
      setPickedCoords([m.lat, m.lon]);
      setMapCenter([m.lat, m.lon]);
      setMapZoom(10);
    },
    [selectLocation]
  );

  const markers: MapMarkerItem[] = useMemo(() => {
    const bands = aqiStandard === 'US' ? US_AQI_BANDS : IN_AQI_BANDS;
    return networkPins.map((c) => {
      const val =
        aqiStandard === 'US' ? (c.us_aqi ?? computeUsAqi(c.pm25, c.pm10)) : c.indian_aqi;
      const b = resolveBand(val, bands).band;
      return {
        id: c.city,
        lat: c.lat,
        lon: c.lon,
        title: `${c.city}${c.state ? `, ${c.state}` : ''}`,
        subtitle: `PM2.5: ${c.pm25 ?? '—'} µg/m³ · PM10: ${c.pm10 ?? '—'} µg/m³ · Click to load full meters & graphs`,
        badge: `LIVE AQI-${aqiStandard} · ${b.label}`,
        value: String(val),
        color: b.color,
        kind: 'city',
      };
    });
  }, [networkPins, aqiStandard]);

  const currentBundle = inspected || activeAir || null;
  const displayAqi = useMemo(() => {
    if (!currentBundle) return 0;
    return aqiStandard === 'US'
      ? (currentBundle.current.us_aqi ??
        computeUsAqi(
          currentBundle.current.pollutants.pm25,
          currentBundle.current.pollutants.pm10
        ))
      : currentBundle.current.indian_aqi;
  }, [currentBundle, aqiStandard]);

  const activeBand = useMemo(
    () => resolveBand(displayAqi, aqiStandard === 'US' ? US_AQI_BANDS : IN_AQI_BANDS).band,
    [displayAqi, aqiStandard]
  );

  const pickedInfo = useMemo(() => {
    if (!currentBundle) return null;
    return {
      title: `${currentBundle.location.city}, ${currentBundle.location.state}`,
      aqiLabel: `AQI-${aqiStandard} ${displayAqi} (${activeBand.label})`,
      subtitle: `PM2.5 ${currentBundle.current.pollutants.pm25 ?? '—'} µg/m³ · ${
        currentBundle.current.weather.temp_c ?? '—'
      }°C · ${currentBundle.location.lat.toFixed(3)}°, ${currentBundle.location.lon.toFixed(3)}°`,
      color: activeBand.color,
    };
  }, [currentBundle, aqiStandard, displayAqi, activeBand]);

  const polCards = currentBundle
    ? [
        { k: 'PM2.5', v: currentBundle.current.pollutants.pm25, u: 'µg/m³', max: 250 },
        { k: 'PM10', v: currentBundle.current.pollutants.pm10, u: 'µg/m³', max: 430 },
        { k: 'NO₂', v: currentBundle.current.pollutants.no2, u: 'µg/m³', max: 200 },
        { k: 'SO₂', v: currentBundle.current.pollutants.so2, u: 'µg/m³', max: 200 },
        { k: 'O₃', v: currentBundle.current.pollutants.o3, u: 'µg/m³', max: 200 },
        { k: 'CO', v: currentBundle.current.pollutants.co_mg, u: 'mg/m³', max: 10 },
      ]
    : [];

  return (
    <section
      id={id}
      className={cn(
        'rounded-2xl border border-white/[0.09] bg-[#161C26] p-4 sm:p-6 shadow-xl',
        expanded && 'fixed inset-3 z-[8500] overflow-y-auto bg-[#0F141D] border-white/20'
      )}
    >
      {/* Header + Search Any City Worldwide Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3898FF]/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#60A5FA]">
              <MousePointerClick className="h-3 w-3" /> Interactive Live Air Map &amp; City Finder
            </span>
            <ProvenanceBadge type="MODEL FORECAST" compact />
            <ProvenanceBadge type="ESTIMATED" compact />
          </div>
          <h2 className="mt-1.5 font-display text-lg font-bold text-white sm:text-xl">
            Locate Any City or Click Anywhere on the Map
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Search any city across India or the world, tap a live AQI bubble, or click any exact point on the map to update every meter, pollutant graph, and forecast below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMapCenter([22.8, 79.0]);
              setMapZoom(5);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0E131D] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-[#3898FF]/50 hover:text-white"
          >
            <Globe2 className="h-3.5 w-3.5 text-[#3898FF]" /> All-India View ({networkPins.length || 36})
          </button>
          {currentBundle && (
            <button
              type="button"
              onClick={() => {
                setMapCenter([currentBundle.location.lat, currentBundle.location.lon]);
                setMapZoom(11);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0E131D] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-400/50 hover:text-white"
            >
              <MapPin className="h-3.5 w-3.5 text-emerald-400" /> Focus {selectedCity}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0E131D] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/30 hover:text-white"
          >
            {expanded ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" /> Exit Fullscreen
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" /> Expand
              </>
            )}
          </button>
        </div>
      </div>

      {/* Universal City Search Input */}
      <div className="mt-4">
        <CitySearchPicker
          variant="inline"
          placeholder="Search any city, town, or district (e.g. Jalandhar, Shimla, Surat, Kochi, Guwahati, Patna, Goa, London, Tokyo)..."
          onLocationResolved={(loc) => {
            setPickedCoords([loc.lat, loc.lon]);
            setMapCenter([loc.lat, loc.lon]);
            setMapZoom(10);
          }}
        />
      </div>

      {/* Live Map + Real-Time Selected Location Readout */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="relative lg:col-span-7 xl:col-span-8">
          <DynamicVayuMap
            center={mapCenter}
            zoom={mapZoom}
            height={expanded ? 540 : 420}
            markers={markers}
            pickedLocation={pickedCoords}
            pickedInfo={pickedInfo}
            scrollWheelZoom
            showStyleToggle
            clickHint="Click anywhere on the map (or tap any city bubble) to check live air quality there"
            onMapClick={handleMapClick}
            onMarkerClick={handleMarkerClick}
          />
          {inspectingPin && (
            <div className="absolute left-3 top-3 z-[550] inline-flex items-center gap-2 rounded-xl border border-[#3898FF]/50 bg-[#0B101B]/95 px-3 py-1.5 text-xs font-semibold text-white shadow-xl backdrop-blur-md">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#3898FF]" />
              Fetching live air &amp; weather at clicked point...
            </div>
          )}
        </div>

        {/* Selected / Clicked Location Live Result Card */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#10151F] p-4 lg:col-span-5 xl:col-span-4">
          {currentBundle ? (
            <>
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      {currentBundle.location.is_custom_pin ? '● Live Map Pin Active' : '● Live City Active'}
                    </span>
                    <h3 className="mt-0.5 truncate font-display text-lg font-bold text-white">
                      {currentBundle.location.city}
                    </h3>
                    <p className="truncate text-xs text-slate-400">
                      {[currentBundle.location.state, currentBundle.location.country]
                        .filter(Boolean)
                        .join(', ')}{' '}
                      ·{' '}
                      <span className="font-mono text-[11px] text-slate-300">
                        {currentBundle.location.lat.toFixed(3)}°, {currentBundle.location.lon.toFixed(3)}°
                      </span>
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold text-white"
                    style={{ backgroundColor: activeBand.color }}
                  >
                    {activeBand.label}
                  </span>
                </div>

                {/* Live Radial Dial + Weather Summary */}
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-[#151C28] p-3">
                  <div className="flex justify-center">
                    <RadialDialMeter
                      value={displayAqi}
                      max={aqiStandard === 'US' ? 400 : 500}
                      label={`LIVE AQI-${aqiStandard} · ${currentBundle.current.dominant_pollutant}`}
                      unit={activeBand.label}
                      color={activeBand.color}
                      size="sm"
                    />
                  </div>
                  <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-[10.5px]">
                    <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-400">
                        <Thermometer className="h-2.5 w-2.5 text-amber-400" /> Temp
                      </span>
                      <strong className="mt-0.5 block font-mono text-xs text-white">
                        {currentBundle.current.weather.temp_c ?? '—'}°C
                      </strong>
                    </div>
                    <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-400">
                        <Droplets className="h-2.5 w-2.5 text-sky-400" /> RH
                      </span>
                      <strong className="mt-0.5 block font-mono text-xs text-white">
                        {currentBundle.current.weather.humidity_pct ?? '—'}%
                      </strong>
                    </div>
                    <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-400">
                        <Wind className="h-2.5 w-2.5 text-teal-400" /> Wind
                      </span>
                      <strong className="mt-0.5 block font-mono text-xs text-white">
                        {currentBundle.current.weather.wind_kph ?? '—'} {currentBundle.current.weather.wind_compass}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-black/30 px-2 py-1.5 text-center">
                      <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-400">
                        <Sun className="h-2.5 w-2.5 text-orange-400" /> US / UV
                      </span>
                      <strong className="mt-0.5 block font-mono text-xs text-white">
                        {currentBundle.current.us_aqi ?? '—'} / {currentBundle.current.uv_index ?? 0}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* All 6 Live Pollutants Mini Grid */}
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {polCards.map((p) => {
                    const pct = p.v != null ? Math.min(100, Math.round((p.v / p.max) * 100)) : 0;
                    return (
                      <div
                        key={p.k}
                        className="rounded-lg border border-white/[0.06] bg-[#151C28] px-2.5 py-1.5"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-semibold text-slate-400">{p.k}</span>
                          <span className="text-[9px] text-slate-500">{p.u}</span>
                        </div>
                        <p className="font-mono text-xs font-bold text-white">
                          {p.v != null ? p.v : '—'}
                        </p>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: activeBand.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cleanest Window + Live Sources Attribution */}
              <div className="mt-3 border-t border-white/[0.07] pt-2.5 text-[10.5px] text-slate-400 space-y-1">
                {currentBundle.comparison?.cleanest_window && (
                  <p className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Compass className="h-3 w-3 text-emerald-400" /> Cleanest Next 24h:
                    </span>
                    <strong className="font-mono text-emerald-300">
                      {formatShortHour(currentBundle.comparison.cleanest_window.time)} (AQI{' '}
                      {currentBundle.comparison.cleanest_window.indian_aqi})
                    </strong>
                  </p>
                )}
                <p className="truncate">
                  <span className="text-slate-500">Ref:</span>{' '}
                  <span className="text-slate-300">
                    {currentBundle.location.nearest_reference_station}
                  </span>
                </p>
                <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-500">
                  <span>Synced {formatIstTime(currentBundle.current.observed_time_ist)}</span>
                  <a
                    href="https://open-meteo.com/en/docs/air-quality-api"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#60A5FA] hover:underline"
                  >
                    Open-Meteo CAMS + CPCB <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center py-12 text-center text-xs text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#3898FF]" /> Loading live map telemetry...
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
