'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapMarkerItem, MapPolylineItem } from '@/lib/types';

export interface PickedPinInfo {
  title: string;
  subtitle?: string;
  aqiLabel?: string;
  color?: string;
}

export interface VayuMapProps {
  center: [number, number];
  zoom?: number;
  height?: number;
  markers?: MapMarkerItem[];
  circles?: MapMarkerItem[];
  polylines?: MapPolylineItem[];
  pickedLocation?: [number, number] | null;
  pickedInfo?: PickedPinInfo | null;
  scrollWheelZoom?: boolean;
  showStyleToggle?: boolean;
  clickHint?: string;
  onMapClick?: (lat: number, lon: number) => void;
  onMarkerClick?: (item: MapMarkerItem) => void;
}

const TILE_STYLES = {
  dark: {
    label: 'Dark AQI',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    className: 'vayu-osm-dark-tiles',
  },
  streets: {
    label: 'Street Map',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    className: '',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, GIS User Community',
    className: '',
  },
} as const;

type MapStyleKey = keyof typeof TILE_STYLES;

export default function VayuMapInner({
  center,
  zoom = 11,
  height = 380,
  markers = [],
  circles = [],
  polylines = [],
  pickedLocation = null,
  pickedInfo = null,
  scrollWheelZoom = false,
  showStyleToggle = true,
  clickHint,
  onMapClick,
  onMarkerClick,
}: VayuMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const clickHandlerRef = useRef(onMapClick);
  clickHandlerRef.current = onMapClick;
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      scrollWheelZoom,
    });

    tileRef.current = L.tileLayer(TILE_STYLES.dark.url, {
      attribution: TILE_STYLES.dark.attribution,
      maxZoom: 19,
      className: TILE_STYLES.dark.className,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (clickHandlerRef.current) {
        clickHandlerRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch tile style cleanly (Dark AQI <-> Street Map <-> Satellite — all 100% free, no API key)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
    }
    const spec = TILE_STYLES[mapStyle];
    tileRef.current = L.tileLayer(spec.url, {
      attribution: spec.attribution,
      maxZoom: 19,
      className: spec.className,
    }).addTo(map);
  }, [mapStyle]);

  // Recenter smoothly when city/center changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(center, zoom, { animate: true });
  }, [center[0], center[1], zoom]);

  // Render markers, circles, polylines, and clicked location pin cleanly
  useEffect(() => {
    const group = layerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    // Regional forecast circles (Pollution Shadow / coverage cells)
    circles.forEach((c) => {
      const col = c.color || '#21D4E8';
      const circle = L.circle([c.lat, c.lon], {
        radius: c.radiusM || 11000,
        color: col,
        weight: 1.4,
        dashArray: '5 5',
        fillColor: col,
        fillOpacity: c.fillOpacity ?? 0.22,
      });
      circle.bindPopup(
        `<div style="min-width:185px">
          <div style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:#b5a6ff;font-weight:700">${c.badge || 'MODEL FORECAST'}</div>
          <div style="font-size:13px;font-weight:700;margin-top:3px;color:#fff">${c.title}</div>
          ${c.value ? `<div style="font-size:15px;font-weight:800;color:${col};margin-top:4px">${c.value}</div>` : ''}
          ${c.subtitle ? `<div style="font-size:11px;color:#cbd5e1;margin-top:3px">${c.subtitle}</div>` : ''}
        </div>`
      );
      circle.addTo(group);
    });

    // Route polylines
    polylines.forEach((p) => {
      const line = L.polyline(p.positions, {
        color: p.color,
        weight: p.weight ?? 4.5,
        opacity: 0.9,
        dashArray: p.dashed ? '8 6' : undefined,
      });
      if (p.label) {
        line.bindPopup(`<div style="font-size:12px;font-weight:600;color:#fff">${p.label}</div>`);
      }
      line.addTo(group);
    });

    // City & station markers
    markers.forEach((m) => {
      const col = m.color || '#21D4E8';
      const numText = m.value ? m.value.replace(/[^0-9]/g, '').slice(0, 3) || m.value.slice(0, 3) : '●';
      const shape =
        m.kind === 'community'
          ? 'transform:rotate(45deg);border-radius:4px;'
          : m.kind === 'incident'
            ? 'border-radius:6px;border-style:dashed;'
            : 'border-radius:999px;';

      const icon = L.divIcon({
        className: 'vayu-custom-pin',
        html: `<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;background:${col};border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 12px ${col}AA;cursor:pointer;${shape}">
          <span style="${m.kind === 'community' ? 'transform:rotate(-45deg);' : ''}font-size:9.5px;font-weight:800;color:#0b0f17;text-shadow:0 0 1px rgba(255,255,255,0.4)">${numText}</span>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([m.lat, m.lon], { icon });
      marker.bindPopup(
        `<div style="min-width:195px">
          ${m.badge ? `<div style="font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;color:#38bdf8;font-weight:700">${m.badge}</div>` : ''}
          <div style="font-size:13px;font-weight:700;margin-top:2px;color:#fff">${m.title}</div>
          ${m.value ? `<div style="font-size:14px;font-weight:800;color:${col};margin-top:4px">${m.value}</div>` : ''}
          ${m.subtitle ? `<div style="font-size:11px;color:#cbd5e1;margin-top:3px;line-height:1.4">${m.subtitle}</div>` : ''}
        </div>`
      );
      if (onMarkerClick) {
        marker.on('click', () => onMarkerClick(m));
      }
      marker.addTo(group);
    });

    // Interactive clicked/selected map pin
    if (pickedLocation) {
      const pinCol = pickedInfo?.color || '#3898FF';
      L.circle(pickedLocation, {
        radius: 1800,
        color: pinCol,
        weight: 2,
        fillColor: pinCol,
        fillOpacity: 0.16,
      }).addTo(group);

      const pinIcon = L.divIcon({
        className: 'vayu-picked-pin',
        html: `<div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;border-radius:999px;background:${pinCol}44;border:2px solid #ffffff;box-shadow:0 0 20px ${pinCol};"></div>
          <div style="position:relative;width:14px;height:14px;border-radius:999px;background:${pinCol};border:2.5px solid #ffffff;"></div>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const pinMarker = L.marker(pickedLocation, { icon: pinIcon, zIndexOffset: 900 });
      const title = pickedInfo?.title || 'Selected Location';
      const sub =
        pickedInfo?.subtitle ||
        `Coordinates: ${pickedLocation[0].toFixed(3)}°, ${pickedLocation[1].toFixed(3)}°`;
      pinMarker.bindPopup(
        `<div style="min-width:195px">
          <div style="font-size:9.5px;letter-spacing:0.06em;text-transform:uppercase;color:#38bdf8;font-weight:700">SELECTED LIVE POINT</div>
          <div style="font-size:13px;font-weight:700;margin-top:2px;color:#fff">${title}</div>
          ${pickedInfo?.aqiLabel ? `<div style="font-size:14px;font-weight:800;color:${pinCol};margin-top:4px">${pickedInfo.aqiLabel}</div>` : ''}
          <div style="font-size:11px;color:#cbd5e1;margin-top:3px;line-height:1.4">${sub}</div>
        </div>`
      );
      pinMarker.addTo(group);
    }
  }, [markers, circles, polylines, pickedLocation, pickedInfo, onMarkerClick]);

  return (
    <div className="relative w-full">
      <style>{`
        .vayu-osm-dark-tiles {
          filter: invert(100%) hue-rotate(185deg) brightness(92%) contrast(92%) saturate(75%);
        }
      `}</style>
      <div
        ref={containerRef}
        style={{ height, cursor: onMapClick ? 'crosshair' : undefined, background: '#0c121c' }}
        className="w-full overflow-hidden rounded-xl border border-white/10"
        aria-label="Interactive OpenStreetMap Live Air Quality Map"
      />

      {showStyleToggle && (
        <div className="pointer-events-auto absolute right-3 top-3 z-[500] flex items-center gap-1 rounded-lg border border-white/15 bg-[#0D111A]/90 p-1 backdrop-blur-md shadow-lg">
          {(['dark', 'streets', 'satellite'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setMapStyle(st)}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                mapStyle === st
                  ? 'bg-[#3898FF] text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {TILE_STYLES[st].label}
            </button>
          ))}
        </div>
      )}

      {clickHint && onMapClick && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[78%] rounded-lg border border-white/15 bg-[#0D111A]/90 px-2.5 py-1.5 text-[10.5px] font-medium text-slate-200 backdrop-blur-md shadow-lg">
          {clickHint}
        </div>
      )}
    </div>
  );
}
