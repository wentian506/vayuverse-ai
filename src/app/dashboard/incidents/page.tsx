'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Camera, CopyCheck, MapPin, Send, ShieldAlert } from 'lucide-react';
import DynamicVayuMap from '@/components/maps/VayuMap';
import { ErrorBanner, PageHeader, ProvenanceBadge, TierBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { cn, formatIstTime } from '@/lib/utils';

const ALL_STATUSES = [
  'All',
  'Submitted',
  'Acknowledged',
  'Under Review',
  'Resolved',
  'Closed',
  'Unverified',
];

const STATUS_STYLE: Record<string, string> = {
  Submitted: 'bg-blue-500/15 text-blue-300 border-blue-400/35',
  Acknowledged: 'bg-vayu-cyan/15 text-vayu-cyan border-vayu-cyan/35',
  'Under Review': 'bg-amber-500/15 text-amber-300 border-amber-400/35',
  Resolved: 'bg-vayu-teal/15 text-vayu-teal border-vayu-teal/35',
  Closed: 'bg-slate-500/20 text-slate-300 border-slate-400/35',
  Unverified: 'bg-purple-500/15 text-purple-300 border-purple-400/35',
};

interface IncidentItem {
  id: string;
  reporter_alias: string;
  category: string;
  severity: string;
  description: string;
  city: string;
  area_label: string;
  approx_lat: number;
  approx_lon: number;
  observed_at: string;
  status: string;
  duplicate_of_id: string | null;
  moderator_note: string | null;
  has_photo: boolean;
  photo: { file_name: string; data_uri: string } | null;
  is_demo: boolean;
}

export default function IncidentReportingPage() {
  const { selectedCity, selectedLocation, toast } = useApp();
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [cityCenter, setCityCenter] = useState<[number, number]>([30.901, 75.857]);
  const [pin, setPin] = useState<[number, number]>([30.9, 75.86]);
  const [form, setForm] = useState({
    category: 'waste_burning',
    severity: 'moderate',
    area_label: '',
    description: '',
    observed_at: new Date().toISOString().slice(0, 16),
    photo_data_uri: '' as string,
    photo_file_name: '' as string,
  });

  useEffect(() => {
    const qs = new URLSearchParams({ city: selectedCity });
    if (selectedLocation.lat != null && selectedLocation.lon != null) {
      qs.set('lat', String(selectedLocation.lat));
      qs.set('lon', String(selectedLocation.lon));
    }
    fetch(`/api/v1/cities/resolve?${qs.toString()}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const c = d.location;
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
          setCityCenter([c.lat, c.lon]);
          setPin([Math.round(c.lat * 100) / 100, Math.round(c.lon * 100) / 100]);
        }
      })
      .catch(() => {});
  }, [selectedCity, selectedLocation.lat, selectedLocation.lon]);

  const loadIncidents = useCallback(async () => {
    setError(null);
    try {
      const qs = new URLSearchParams({
        status_filter: statusFilter,
        mine_only: String(mineOnly),
      });
      const res = await fetch(`/api/v1/incidents?${qs.toString()}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not fetch incident reports.');
      setIncidents(data.incidents || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load reports');
    }
  }, [statusFilter, mineOnly]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const onPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_800_000) {
      toast('error', 'Image too large', 'Please attach a photo under 1.8 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        photo_data_uri: String(reader.result),
        photo_file_name: file.name,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          category: form.category,
          severity: form.severity,
          area_label: form.area_label,
          description: form.description,
          city: selectedCity,
          approx_lat: pin[0],
          approx_lon: pin[1],
          observed_at: new Date(form.observed_at).toISOString(),
          photo_data_uri: form.photo_data_uri || null,
          photo_file_name: form.photo_file_name || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submission rejected.');
      setForm({
        ...form,
        area_label: '',
        description: '',
        photo_data_uri: '',
        photo_file_name: '',
      });
      toast(
        'success',
        data.duplicate_detected ? 'Submitted (Nearby duplicate linked)' : 'Incident report submitted!',
        'Status set to Submitted (USER REPORTED) for moderator review.'
      );
      loadIncidents();
    } catch (err) {
      toast('error', 'Could not submit report', err instanceof Error ? err.message : 'Check fields.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Citizen Incident Reporting"
        subtitle="Report observable smoke, waste burning, or dust with approximate privacy-safe coordinates, optional photographs, duplicate detection, and transparent moderation status."
        badge="MVP"
        provenance="USER REPORTED"
      />

      {error && <ErrorBanner message={error} onRetry={loadIncidents} />}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Reporting Form */}
        <form onSubmit={handleSubmit} className="vayu-card p-6 lg:col-span-5 space-y-4 text-xs">
          <h2 className="font-display text-lg font-bold text-white">Submit Observation ({selectedCity})</h2>

          <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 text-[11px] text-amber-100 flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <span>
              <strong>Responsible Reporting Rule:</strong> Describe observable air/smoke/dust conditions only. Never accuse named individuals, companies, or organisations, and avoid capturing faces or licence plates in photos.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-slate-400">Incident Type *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="vayu-select w-full text-xs"
              >
                <option value="smoke">Visible Smoke</option>
                <option value="waste_burning">Waste / Leaf Burning</option>
                <option value="dust">Road / Construction Dust</option>
                <option value="traffic_exhaust">Heavy Traffic Plume</option>
                <option value="industrial_plume">Ambient Haze / Plume</option>
                <option value="odour">Pungent Air Odour</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Observed Severity *</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="vayu-select w-full text-xs"
              >
                <option value="low">Low (Localised)</option>
                <option value="moderate">Moderate (Noticeable)</option>
                <option value="high">High (Dense / Widespread)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-slate-400">Approximate Area / Corridor Label *</label>
            <input
              required
              minLength={3}
              value={form.area_label}
              onChange={(e) => setForm({ ...form, area_label: e.target.value })}
              placeholder="e.g., Pakhowal Road Canal Bridge Sector"
              className="vayu-input text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-slate-400">Observation Timestamp *</label>
            <input
              type="datetime-local"
              required
              value={form.observed_at}
              onChange={(e) => setForm({ ...form, observed_at: e.target.value })}
              className="vayu-input text-xs"
            />
          </div>

          <div>
            <label className="mb-1 flex items-center justify-between text-slate-400">
              <span>Click Map for Approximate Location (~1 km privacy grid)</span>
              <span className="font-mono text-vayu-cyan">{pin[0].toFixed(2)}°N, {pin[1].toFixed(2)}°E</span>
            </label>
            <DynamicVayuMap
              center={cityCenter}
              zoom={12}
              height={190}
              pickedLocation={pin}
              onMapClick={(lat, lon) =>
                setPin([Math.round(lat * 100) / 100, Math.round(lon * 100) / 100])
              }
            />
          </div>

          <div>
            <label className="mb-1 block text-slate-400">Factual Environmental Description *</label>
            <textarea
              required
              minLength={12}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe plume colour, approximate extent, wind drift, or dust resuspension..."
              className="vayu-input text-xs"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="vayu-btn-secondary cursor-pointer py-2 text-xs">
              <Camera className="h-3.5 w-3.5" />
              {form.photo_file_name ? `Attached: ${form.photo_file_name.slice(0, 18)}` : 'Attach Photo (Optional)'}
              <input type="file" accept="image/*" onChange={onPhotoSelect} className="hidden" />
            </label>
            {form.photo_data_uri && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.photo_data_uri} alt="Attachment preview" className="h-10 w-10 rounded-lg object-cover ring-1 ring-vayu-cyan" />
            )}
          </div>

          <button type="submit" disabled={submitting} className="vayu-btn-primary w-full py-2.5 text-xs">
            <Send className="h-3.5 w-3.5" /> {submitting ? 'Submitting...' : 'Submit Incident Report'}
          </button>
        </form>

        {/* Status-Tracked Reports Directory */}
        <div className="vayu-card p-6 lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-white">Community Report Ledger &amp; Moderation Status</h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
              My submissions only
            </label>
          </div>

          {/* All 6 Required Status Filters */}
          <div className="flex flex-wrap gap-1.5">
            {ALL_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
                  statusFilter === st ? 'bg-vayu-electric text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                )}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-[680px] overflow-y-auto pr-1">
            {incidents.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">No incident reports match the selected filter.</p>
            ) : (
              incidents.map((inc) => (
                <div key={inc.id} className="rounded-2xl border border-white/10 bg-[#071224] p-4 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-bold capitalize text-white">
                        {inc.category.replace('_', ' ')}
                      </span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-300">
                        {inc.severity}
                      </span>
                      {inc.is_demo && <TierBadge tier="DEMO" />}
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-bold',
                        STATUS_STYLE[inc.status] || STATUS_STYLE.Submitted
                      )}
                    >
                      {inc.status}
                    </span>
                  </div>

                  <p className="leading-relaxed text-slate-200">{inc.description}</p>

                  {inc.photo?.data_uri && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inc.photo.data_uri}
                      alt="Reported environmental condition"
                      className="mt-2 max-h-40 rounded-xl border border-white/10 object-cover"
                    />
                  )}

                  {inc.duplicate_of_id && (
                    <p className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-1 text-[10.5px] text-amber-200">
                      <CopyCheck className="h-3 w-3" /> Flagged as potential geo-temporal duplicate for moderator cluster review.
                    </p>
                  )}

                  {inc.moderator_note && (
                    <p className="rounded-lg border border-vayu-cyan/20 bg-vayu-cyan/5 p-2.5 text-[11px] text-slate-300">
                      <strong className="text-vayu-cyan">Moderation Note:</strong> {inc.moderator_note}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-vayu-cyan" /> {inc.city} · {inc.area_label}
                    </span>
                    <span>{formatIstTime(inc.observed_at)} · <ProvenanceBadge type="USER REPORTED" compact /></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
