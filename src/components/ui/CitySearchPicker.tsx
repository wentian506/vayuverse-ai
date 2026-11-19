'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Crosshair, Globe2, Loader2, MapPin, Search, X } from 'lucide-react';
import { useApp } from '@/components/providers/AppProvider';
import { CitySearchResult, LiveAirBundle } from '@/lib/types';
import { SUPPORTED_CITY_NAMES, cn } from '@/lib/utils';

interface CitySearchPickerProps {
  variant?: 'header' | 'inline';
  placeholder?: string;
  className?: string;
  onLocationResolved?: (loc: {
    city: string;
    state?: string;
    country?: string;
    lat: number;
    lon: number;
    isCustomPin?: boolean;
  }) => void;
}

export function CitySearchPicker({
  variant = 'inline',
  placeholder = 'Search any city, town, or district in India or worldwide...',
  className,
  onLocationResolved,
}: CitySearchPickerProps) {
  const { selectedCity, selectedLocation, selectLocation, setSelectedCity, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Debounced live city geocoding query
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/v1/cities/search?q=${encodeURIComponent(q)}&limit=14`,
          { credentials: 'include', cache: 'no-store' }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data.results) ? data.results : []);
        }
      } catch {
        const filtered = SUPPORTED_CITY_NAMES.filter(
          (c) => !q || c.toLowerCase().includes(q.toLowerCase())
        ).map((c) => ({
          city: c,
          state: 'India',
          country: 'India',
          country_code: 'IN',
          lat: 0,
          lon: 0,
          is_curated: true,
        }));
        setResults(filtered);
      } finally {
        setSearching(false);
      }
    }, q ? 200 : 20);
    return () => clearTimeout(timer);
  }, [query, open]);

  const handleChoose = useCallback(
    (item: CitySearchResult) => {
      if (item.lat && item.lon) {
        selectLocation({
          city: item.city,
          state: item.state,
          country: item.country,
          lat: item.lat,
          lon: item.lon,
          isCustomPin: false,
        });
        onLocationResolved?.({
          city: item.city,
          state: item.state,
          country: item.country,
          lat: item.lat,
          lon: item.lon,
          isCustomPin: false,
        });
      } else {
        setSelectedCity(item.city);
      }
      setQuery('');
      setOpen(false);
      toast(
        'info',
        `Switched to ${item.city}`,
        `Loading live air quality, 6 pollutants, weather & 72h forecast for ${item.city}${item.state ? `, ${item.state}` : ''}.`
      );
    },
    [selectLocation, setSelectedCity, onLocationResolved, toast]
  );

  const handleLocateMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      toast('error', 'Geolocation unavailable', 'Search any city or click anywhere on the live map.');
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
            const bundle: LiveAirBundle = await res.json();
            const loc = {
              city: bundle.location.city,
              state: bundle.location.state,
              country: bundle.location.country,
              lat,
              lon,
              isCustomPin: true,
            };
            selectLocation(loc);
            onLocationResolved?.(loc);
            toast(
              'success',
              `Located: ${bundle.location.city}`,
              `Live AQI ${bundle.current.indian_aqi} (${bundle.current.category}) · ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`
            );
          }
        } catch {
          toast('error', 'Could not resolve GPS feed', 'Try clicking directly on the live map.');
        } finally {
          setLocating(false);
          setOpen(false);
        }
      },
      () => {
        setLocating(false);
        toast(
          'info',
          'Location permission denied',
          'Type any city name or click anywhere on the dashboard live map.'
        );
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, [selectLocation, onLocationResolved, toast]);

  if (variant === 'header') {
    return (
      <div ref={wrapperRef} className={cn('relative', className)}>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setTimeout(() => inputRef.current?.focus(), 60);
          }}
          aria-label="Search or switch active city"
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.1] bg-[#161B26] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:border-[#3898FF]/50 hover:bg-[#1B2230]"
        >
          <MapPin
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              selectedLocation.isCustomPin ? 'text-emerald-400' : 'text-[#3898FF]'
            )}
          />
          <span className="max-w-[120px] truncate sm:max-w-[155px]">{selectedCity}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-slate-400 transition', open && 'rotate-180')} />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-[320px] sm:w-[360px] overflow-hidden rounded-2xl border border-white/15 bg-[#121722] shadow-2xl">
            <div className="border-b border-white/10 p-3">
              <div className="relative flex items-center">
                <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search any city in India or worldwide..."
                  className="w-full rounded-xl border border-white/10 bg-[#0B0F17] py-2 pl-9 pr-8 text-xs text-white placeholder-slate-400 focus:border-[#3898FF] focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear city query"
                    className="absolute right-2.5 text-slate-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={handleLocateMe}
                disabled={locating}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#3898FF]/30 bg-[#3898FF]/10 px-3 py-1.5 text-[11px] font-semibold text-[#60A5FA] transition hover:bg-[#3898FF]/20 disabled:opacity-60"
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5" />
                )}
                {locating ? 'Detecting GPS location...' : 'Use My Live GPS Location'}
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>{query.trim() ? 'Live Geocoding Matches' : '36 India Hubs (type for any city)'}</span>
                {searching && <Loader2 className="h-3 w-3 animate-spin text-[#3898FF]" />}
              </div>

              {results.length === 0 && !searching ? (
                <p className="px-3 py-5 text-center text-xs text-slate-400">
                  No city matched &ldquo;{query}&rdquo;. Try another spelling or click anywhere on the live map.
                </p>
              ) : (
                results.map((item, idx) => {
                  const active = item.city.toLowerCase() === selectedCity.toLowerCase();
                  return (
                    <button
                      key={`${item.city}-${item.lat}-${item.lon}-${idx}`}
                      type="button"
                      onClick={() => handleChoose(item)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition',
                        active ? 'bg-[#3898FF]/15 text-white' : 'text-slate-200 hover:bg-white/[0.06]'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-white">{item.city}</span>
                          {item.country_code && (
                            <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-slate-300">
                              {item.country_code}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-slate-400">
                          {[item.state, item.country].filter(Boolean).join(', ')}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">
                        {item.lat ? `${item.lat.toFixed(1)}°, ${item.lon.toFixed(1)}°` : 'Live'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-white/10 bg-[#0D111A] px-3 py-1.5 text-[10px] text-slate-500">
              <Globe2 className="mr-1 inline h-3 w-3 text-[#3898FF]" />
              Live Open-Meteo Global Geocoding + CAMS Air Feed
            </div>
          </div>
        )}
      </div>
    );
  }

  // Inline full search bar (for Dashboard overview, Live Air, and Map Explorer)
  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            placeholder={placeholder}
            className="w-full rounded-xl border border-white/[0.12] bg-[#0E131D] py-2.5 pl-10 pr-9 text-xs sm:text-sm text-white placeholder-slate-400 transition focus:border-[#3898FF] focus:outline-none focus:ring-1 focus:ring-[#3898FF]/40"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#3898FF]" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#3898FF] px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#3898FF]/25 transition hover:bg-[#2A85EB] disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Crosshair className="h-3.5 w-3.5" />
          )}
          {locating ? 'Locating...' : 'Locate Me'}
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-white/15 bg-[#121722] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <span>
              {query.trim()
                ? `Matching Cities & Towns for "${query.trim()}"`
                : 'Popular Indian Cities — Type Any City in India or Worldwide'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {results.length === 0 && !searching ? (
              <p className="px-3 py-5 text-center text-xs text-slate-400">
                No matching location found. Try another city name or click any point on the live map below.
              </p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {results.map((item, idx) => (
                  <button
                    key={`${item.city}-${item.lat}-${item.lon}-${idx}`}
                    type="button"
                    onClick={() => handleChoose(item)}
                    className="flex items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-left transition hover:border-[#3898FF]/35 hover:bg-white/[0.06]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0 text-[#3898FF]" />
                        <span className="truncate text-xs font-semibold text-white">{item.city}</span>
                        {item.country_code && (
                          <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-slate-300">
                            {item.country_code}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate pl-4 text-[11px] text-slate-400">
                        {[item.state, item.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                      {item.lat ? `${item.lat.toFixed(2)}°, ${item.lon.toFixed(2)}°` : 'Live'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
