'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Bell, Check, Globe, MapPin, Sparkles, Upload, User } from 'lucide-react';
import { VayuLogo } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { LANGUAGE_OPTIONS, ROLE_LABELS } from '@/lib/i18n';
import { LanguageCode } from '@/lib/types';
import { cn, SUPPORTED_CITY_NAMES } from '@/lib/utils';

const SELF_ROLES = ['individual', 'family_caregiver', 'campus_admin', 'community_volunteer', 'research_user'];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, setUserDirect, toast } = useApp();

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [city, setCity] = useState('Ludhiana');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>('en');
  const [role, setRole] = useState('individual');
  const [threshold, setThreshold] = useState(150);
  const [notifyAqi, setNotifyAqi] = useState(true);
  const [notifyForecast, setNotifyForecast] = useState(true);
  const [notifyCommunity, setNotifyCommunity] = useState(true);
  const [commuteStart, setCommuteStart] = useState('08:30');
  const [transport, setTransport] = useState('ac_car');
  const [exerciseWindow, setExerciseWindow] = useState('06:30');
  const [hasPurifier, setHasPurifier] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.profile.full_name || '');
      setAvatarUrl(user.profile.avatar_url || null);
      setCity(user.profile.city || 'Ludhiana');
      setPreferredLanguage(user.profile.preferred_language || 'en');
      if (SELF_ROLES.includes(user.role)) setRole(user.role);
    }
  }, [user]);

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_200_000) {
      toast('error', 'Image too large', 'Please choose a profile picture under 1.2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const finishOnboarding = async (skipRoutine = false) => {
    if (!fullName.trim()) {
      toast('error', 'Name required', 'Please enter your full name.');
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/auth/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: fullName.trim(),
          avatar_url: avatarUrl,
          city,
          preferred_language: preferredLanguage,
          role,
          aqi_alert_threshold: threshold,
          notify_aqi_alerts: notifyAqi,
          notify_forecast_spikes: notifyForecast,
          notify_community_updates: notifyCommunity,
          commute_start: commuteStart,
          primary_transport: transport,
          exercise_window: exerciseWindow,
          has_indoor_purifier: hasPurifier,
          skip_routine: skipRoutine,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not complete onboarding.');
      setUserDirect(data.user);
      toast('success', 'Workspace personalised!', `Streaming live air intelligence for ${city}.`);
      router.push('/dashboard');
    } catch (err) {
      toast('error', 'Onboarding error', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-vayu-midnight bg-vayu-mesh px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <VayuLogo />
          <button
            type="button"
            onClick={() => finishOnboarding(true)}
            className="text-xs font-medium text-slate-400 hover:text-vayu-cyan"
          >
            Skip optional setup →
          </button>
        </div>

        {/* Step Indicator */}
        <div className="mt-8 grid grid-cols-3 gap-2">
          {[
            [1, 'Identity & City'],
            [2, 'Language & Role'],
            [3, 'Alerts & Routine'],
          ].map(([num, label]) => (
            <div
              key={num}
              className={cn(
                'rounded-xl border px-3 py-2 text-xs font-semibold transition',
                step >= Number(num)
                  ? 'border-vayu-cyan/50 bg-vayu-deep/80 text-white'
                  : 'border-white/10 bg-white/[0.02] text-slate-500'
              )}
            >
              <span className="font-mono text-[10px] text-vayu-cyan">STEP 0{num}</span>
              <p className="mt-0.5 truncate">{label}</p>
            </div>
          ))}
        </div>

        <motion.div
          key={step}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          className="vayu-card mt-6 p-6 sm:p-8"
        >
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-white">Your Profile &amp; Location</h1>
                <p className="mt-1 text-sm text-slate-400">
                  We default to privacy-preserving city-level coordinates — never continuous GPS tracking.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-vayu-cyan/40 bg-vayu-deep text-xl font-bold text-vayu-cyan">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Profile preview" className="h-full w-full object-cover" />
                  ) : (
                    (fullName[0] || <User className="h-7 w-7" />)
                  )}
                </div>
                <div>
                  <label className="vayu-btn-secondary cursor-pointer py-2 text-xs">
                    <Upload className="h-3.5 w-3.5" /> Upload Profile Photo (Optional)
                    <input type="file" accept="image/*" onChange={handleAvatarFile} className="hidden" />
                  </label>
                  <p className="mt-1 text-[11px] text-slate-400">PNG, JPG or WebP up to 1.2 MB (or Google avatar)</p>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">Full Name *</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="vayu-input"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-vayu-cyan" /> Primary Monitoring City
                </label>
                <select value={city} onChange={(e) => setCity(e.target.value)} className="vayu-select w-full">
                  {SUPPORTED_CITY_NAMES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end pt-3">
                <button type="button" onClick={() => setStep(2)} className="vayu-btn-primary">
                  Next: Language &amp; Category <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-white">Language &amp; User Category</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Choose your interface language and how you plan to use VAYUVERSE AI.
                </p>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Globe className="h-3.5 w-3.5 text-vayu-cyan" /> Preferred Language
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {LANGUAGE_OPTIONS.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => setPreferredLanguage(l.code)}
                      className={cn(
                        'rounded-xl border p-3.5 text-left transition',
                        preferredLanguage === l.code
                          ? 'border-vayu-cyan bg-vayu-electric/20 text-white shadow-glow'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                      )}
                    >
                      <p className="font-display text-base font-bold">{l.native}</p>
                      <p className="text-xs text-slate-400">{l.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-slate-300">User Category</label>
                <div className="space-y-2">
                  {SELF_ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition',
                        role === r
                          ? 'border-vayu-cyan bg-vayu-deep/85 text-white'
                          : 'border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20'
                      )}
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{ROLE_LABELS[r].title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{ROLE_LABELS[r].desc}</p>
                      </div>
                      {role === r && <Check className="mt-0.5 h-4 w-4 shrink-0 text-vayu-teal" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setStep(1)} className="vayu-btn-secondary">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button type="button" onClick={() => setStep(3)} className="vayu-btn-primary">
                  Next: Alerts &amp; Routine <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-white">Alerts &amp; Optional Routine</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Configure your Indian NAQI alert threshold and optional commute/workout times for AI Daily Replanner.
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#071325]/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                    <Bell className="h-4 w-4 text-vayu-cyan" /> Personal Indian NAQI Alert Threshold
                  </span>
                  <span className="rounded-lg bg-vayu-cyan/15 px-2.5 py-0.5 font-mono text-sm font-bold text-vayu-cyan">
                    NAQI {threshold}
                  </span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={350}
                  step={10}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-vayu-cyan"
                />
                <div className="grid gap-2 sm:grid-cols-3 text-xs text-slate-300 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={notifyAqi} onChange={(e) => setNotifyAqi(e.target.checked)} />
                    AQI Alerts
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={notifyForecast} onChange={(e) => setNotifyForecast(e.target.checked)} />
                    Forecast Spikes
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={notifyCommunity} onChange={(e) => setNotifyCommunity(e.target.checked)} />
                    Community Updates
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#071325]/80 p-4 space-y-3">
                <p className="text-xs font-semibold text-white">Optional Daily Routine Preferences</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Morning Commute</label>
                    <input type="time" value={commuteStart} onChange={(e) => setCommuteStart(e.target.value)} className="vayu-input text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Outdoor Activity</label>
                    <input type="time" value={exerciseWindow} onChange={(e) => setExerciseWindow(e.target.value)} className="vayu-input text-xs" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Primary Transport</label>
                    <select value={transport} onChange={(e) => setTransport(e.target.value)} className="vayu-select w-full text-xs">
                      <option value="metro_ev">Metro / Electric Transit</option>
                      <option value="city_bus">City Bus / Shared</option>
                      <option value="ac_car">AC Car</option>
                      <option value="two_wheeler">Two-Wheeler</option>
                      <option value="walking">Walking / Cycling</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                  <input type="checkbox" checked={hasPurifier} onChange={(e) => setHasPurifier(e.target.checked)} />
                  I have access to an indoor HEPA air purifier at home
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button type="button" onClick={() => setStep(2)} className="vayu-btn-secondary">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => finishOnboarding(true)}
                    className="vayu-btn-secondary text-xs"
                  >
                    Skip Routine &amp; Finish
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => finishOnboarding(false)}
                    className="vayu-btn-primary"
                  >
                    <Sparkles className="h-4 w-4" />
                    {saving ? 'Saving...' : 'Launch Dashboard'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
