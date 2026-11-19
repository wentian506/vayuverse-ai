'use client';

import React, { useEffect, useState } from 'react';
import { Accessibility, Check, Copy, Globe, Save, Shield } from 'lucide-react';
import { PageHeader } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { LANGUAGE_OPTIONS } from '@/lib/i18n';
import { LanguageCode } from '@/lib/types';
import { formatIstTime } from '@/lib/utils';

export default function SettingsPage() {
  const {
    user,
    setUserDirect,
    language,
    setLanguage,
    googleOAuthConfigured,
    googleCallbackUrl,
    deploymentPhase,
    toast,
  } = useApp();

  const [prefs, setPrefs] = useState({
    coarse_location_only: true,
    routine_profiling_enabled: true,
    low_bandwidth_mode: false,
    reduced_motion: false,
    aqi_alert_threshold: 150,
  });
  const [consents, setConsents] = useState<
    { id: string; consent_type: string; granted: boolean; version: string; recorded_at: string }[]
  >([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user?.preferences) {
      setPrefs({
        coarse_location_only: user.preferences.coarse_location_only,
        routine_profiling_enabled: user.preferences.routine_profiling_enabled,
        low_bandwidth_mode: user.preferences.low_bandwidth_mode,
        reduced_motion: user.preferences.reduced_motion,
        aqi_alert_threshold: user.preferences.aqi_alert_threshold,
      });
    }
    fetch('/api/v1/profile/activity', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.consent_records) setConsents(d.consent_records);
      })
      .catch(() => {});
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/profile/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(prefs),
    });
    const d = await res.json();
    if (res.ok) {
      setUserDirect(d.user);
      toast('success', 'Settings & consent saved', 'Recorded in your timestamped consent audit log.');
    } else {
      toast('error', 'Notice', d.detail || 'Could not save settings.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings, Privacy & Accessibility"
        subtitle="Control coarse-location protection, optional routine profiling, multilingual display, reduced-motion accessibility, and timestamped consent records."
      />

      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-2 text-xs">
        <div className="vayu-card p-6 space-y-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Shield className="h-5 w-5 text-vayu-teal" /> Privacy &amp; Location Consent
          </h2>

          <label className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#071224] p-4 cursor-pointer">
            <div>
              <p className="font-semibold text-white">Coarse Location by Default (~1 km / City)</p>
              <p className="mt-0.5 text-slate-400">Prevents storing precise home coordinates and rounds incident pins.</p>
            </div>
            <input
              type="checkbox"
              checked={prefs.coarse_location_only}
              onChange={(e) => setPrefs({ ...prefs, coarse_location_only: e.target.checked })}
              className="mt-1"
            />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#071224] p-4 cursor-pointer">
            <div>
              <p className="font-semibold text-white">Optional Routine Profiling</p>
              <p className="mt-0.5 text-slate-400">Allow AI Daily Replanner to store commute and exercise windows.</p>
            </div>
            <input
              type="checkbox"
              checked={prefs.routine_profiling_enabled}
              onChange={(e) => setPrefs({ ...prefs, routine_profiling_enabled: e.target.checked })}
              className="mt-1"
            />
          </label>
        </div>

        <div className="vayu-card p-6 space-y-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Accessibility className="h-5 w-5 text-vayu-cyan" /> Accessibility &amp; Language
          </h2>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-slate-300">
              <Globe className="h-3.5 w-3.5 text-vayu-cyan" /> Display &amp; Voice Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="vayu-select w-full text-xs"
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.code} value={l.code}>{l.native} — {l.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#071224] p-4 cursor-pointer">
            <div>
              <p className="font-semibold text-white">Force Reduced Motion</p>
              <p className="mt-0.5 text-slate-400">Minimise interface transitions in addition to OS motion preferences.</p>
            </div>
            <input
              type="checkbox"
              checked={prefs.reduced_motion}
              onChange={(e) => setPrefs({ ...prefs, reduced_motion: e.target.checked })}
              className="mt-1"
            />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-[#071224] p-4 cursor-pointer">
            <div>
              <p className="font-semibold text-white">Low-Bandwidth Mode</p>
              <p className="mt-0.5 text-slate-400">Prioritise cached summaries and compact payloads on slow mobile links.</p>
            </div>
            <input
              type="checkbox"
              checked={prefs.low_bandwidth_mode}
              onChange={(e) => setPrefs({ ...prefs, low_bandwidth_mode: e.target.checked })}
              className="mt-1"
            />
          </label>
        </div>

        <div className="lg:col-span-2">
          <button type="submit" className="vayu-btn-primary text-xs">
            <Save className="h-3.5 w-3.5" /> Save All Settings
          </button>
        </div>
      </form>

      {/* OAuth & Deployment Diagnostics */}
      <section className="vayu-card p-6 space-y-3 text-xs">
        <h2 className="font-display text-base font-bold text-white">Environment &amp; OAuth Diagnostics</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-[#071224] p-3.5">
            <p className="text-slate-400">Deployment Runtime Mode</p>
            <p className="mt-1 font-mono font-bold text-vayu-cyan">{deploymentPhase}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#071224] p-3.5">
            <p className="text-slate-400">Google OAuth 2.0 Credentials</p>
            <p className="mt-1 font-mono font-bold text-vayu-teal">
              {googleOAuthConfigured ? 'Configured & Live' : 'Pending GOOGLE_CLIENT_ID / SECRET in env'}
            </p>
          </div>
        </div>
        {googleCallbackUrl && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#060F1E] p-3">
            <span className="truncate font-mono text-[11px] text-slate-300">
              Google Redirect URI: <strong className="text-vayu-cyan">{googleCallbackUrl}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(googleCallbackUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="vayu-btn-secondary px-2.5 py-1 text-[11px]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-vayu-teal" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
          </div>
        )}
      </section>

      {/* Timestamped Consent History */}
      {consents.length > 0 && (
        <section className="vayu-card p-6 space-y-2.5 text-xs">
          <h2 className="font-display text-base font-bold text-white">Timestamped Consent Audit History</h2>
          {consents.slice(0, 8).map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-[#071224] px-3.5 py-2">
              <span className="font-mono text-slate-200">{c.consent_type} ({c.version})</span>
              <span className="text-slate-400">
                <strong className={c.granted ? 'text-vayu-teal' : 'text-amber-300'}>
                  {c.granted ? 'Granted' : 'Withdrawn'}
                </strong>{' '}
                · {formatIstTime(c.recorded_at)}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
