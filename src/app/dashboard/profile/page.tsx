'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Lock,
  LogOut,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConfirmModal, PageHeader } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { LANGUAGE_OPTIONS, ROLE_LABELS } from '@/lib/i18n';
import { LanguageCode } from '@/lib/types';
import { cn, downloadTextFile, formatIstTime, SUPPORTED_CITY_NAMES } from '@/lib/utils';

const SELF_ROLES = ['individual', 'family_caregiver', 'campus_admin', 'community_volunteer', 'research_user'];

export default function ProfilePage() {
  const { user, setUserDirect, exitDemoTo, logout, toast } = useApp();
  const isDemo = Boolean(user?.is_demo || user?.auth_provider === 'demo');
  const selectableRoles = isDemo
    ? SELF_ROLES.filter((r) => r !== 'campus_admin')
    : SELF_ROLES;

  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [city, setCity] = useState('Ludhiana');
  const [lang, setLang] = useState<LanguageCode>('en');
  const [role, setRole] = useState('individual');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  // Password form
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  // Saved location form
  const [locLabel, setLocLabel] = useState('');
  const [locCity, setLocCity] = useState('Chandigarh');

  // Personal activity state
  const [activeTab, setActiveTab] = useState<
    'activity' | 'locations' | 'reports' | 'actions' | 'scenarios' | 'notifications'
  >('activity');
  const [activityData, setActivityData] = useState<{
    saved_locations: { id: string; label: string; city: string; state: string; is_primary: boolean }[];
    recent_activity: { id: string; action: string; target_type: string; created_at: string }[];
    recent_reports: { id: string; category: string; area_label: string; status: string; created_at: string }[];
    completed_actions: { id: string; title: string; exposure_saved_pct: number; co2_saved_g: number; completed_at: string }[];
    saved_scenarios: { id: string; title: string; type: string; exposure_delta_pct: number; created_at: string }[];
    notification_history: { id: string; title: string; category: string; is_read: boolean; created_at: string }[];
  } | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.profile.full_name);
    setAvatarUrl(user.profile.avatar_url);
    setCity(user.profile.city);
    setLang(user.profile.preferred_language);
    setRole(user.role);
    setBio(user.profile.bio || '');
  }, [user]);

  const loadActivity = useCallback(async () => {
    const res = await fetch('/api/v1/profile/activity', { credentials: 'include' });
    if (res.ok) {
      setActivityData(await res.json());
    }
  }, []);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1_200_000) {
      toast('error', 'Image too large', 'Please select an image under 1.2 MB.');
      return;
    }
    const r = new FileReader();
    r.onload = () => setAvatarUrl(String(r.result));
    r.readAsDataURL(f);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: fullName,
          avatar_url: avatarUrl,
          city,
          preferred_language: lang,
          bio,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Update failed.');
      setUserDirect(data.user);
      toast('success', 'Profile updated', 'Your personal account settings are saved.');
      loadActivity();
    } catch (err) {
      toast('error', 'Profile update error', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/profile/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ current_password: curPwd || null, new_password: newPwd }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast('error', 'Password error', d.detail || 'Could not update password.');
      return;
    }
    setCurPwd('');
    setNewPwd('');
    toast('success', 'Password updated securely');
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locLabel.trim()) return;
    const res = await fetch('/api/v1/profile/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ label: locLabel, city: locCity }),
    });
    if (res.ok) {
      setLocLabel('');
      toast('success', 'Location saved to your account');
      loadActivity();
    }
  };

  const handleRemoveLocation = async (id: string) => {
    const res = await fetch(`/api/v1/profile/locations/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      toast('info', 'Saved location removed');
      loadActivity();
    }
  };

  const handleExportData = async () => {
    const res = await fetch('/api/v1/profile/export', { credentials: 'include' });
    if (res.ok) {
      const json = await res.json();
      downloadTextFile(`vayuverse-account-export-${user?.id.slice(0, 8)}.json`, JSON.stringify(json, null, 2));
      toast('success', 'Account data exported', 'Complete JSON archive downloaded.');
    } else if (user) {
      downloadTextFile('vayuverse-session-profile.json', JSON.stringify(user, null, 2));
      toast('success', 'Profile exported');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteOpen(false);
    const res = await fetch('/api/v1/profile/account', { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      toast('info', 'Account permanently deleted');
      window.location.href = '/';
    }
  };

  if (!user) return null;

  const initials = user.profile.full_name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        subtitle="Manage your private VAYUVERSE identity, preferences, Google connection, personal data export, and activity history."
        actions={
          <>
            <button type="button" onClick={handleExportData} className="vayu-btn-secondary text-xs">
              <Download className="h-3.5 w-3.5" /> Export My Data
            </button>
            <button type="button" onClick={logout} className="vayu-btn-secondary text-xs text-red-300">
              <LogOut className="h-3.5 w-3.5" /> {isDemo ? 'Exit Demo' : 'Logout'}
            </button>
          </>
        }
      />

      {isDemo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-vayu-teal/40 bg-vayu-teal/10 p-4 text-xs text-slate-200">
          <div>
            <p className="font-display text-sm font-bold text-vayu-teal">Interactive Demo Explorer Session</p>
            <p className="mt-0.5 text-slate-300">
              Changes made here live in your isolated 24-hour guest workspace and close automatically when you exit. Sign in with Google or create an email account for a permanent private profile.
            </p>
          </div>
          <button
            type="button"
            onClick={() => exitDemoTo('/register')}
            className="vayu-btn-primary text-xs shrink-0"
          >
            Create Personal Account
          </button>
        </div>
      )}

      {/* Profile Overview Card */}
      <section className="vayu-card p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-vayu-cyan/50 bg-gradient-to-br from-vayu-electric to-vayu-teal font-display text-2xl font-bold text-white shadow-glow">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={user.profile.full_name} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-bold text-white">{user.profile.full_name}</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-vayu-teal/15 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase text-vayu-teal">
                  <CheckCircle2 className="h-3 w-3" /> {user.account_status}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-300">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-vayu-cyan">
                  {ROLE_LABELS[user.role]?.title || user.role}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-vayu-cyan" /> {user.profile.city}, {user.profile.state}
                </span>
                <span>Member since: {formatIstTime(user.created_at)}</span>
              </div>
            </div>
          </div>

          <label className="vayu-btn-secondary cursor-pointer self-start text-xs">
            <Upload className="h-3.5 w-3.5" /> Change Photo
            <input type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
          </label>
        </div>
      </section>

      {/* Profile Editing + Account Security */}
      <div className="grid gap-6 lg:grid-cols-12">
        <form onSubmit={handleSaveProfile} className="vayu-card p-6 lg:col-span-7 space-y-4 text-xs">
          <h3 className="font-display text-lg font-bold text-white">Edit Profile &amp; Preferences</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-slate-400">Full Name</label>
              <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="vayu-input text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Primary City</label>
              <select value={city} onChange={(e) => setCity(e.target.value)} className="vayu-select w-full text-xs">
                {SUPPORTED_CITY_NAMES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Preferred Language</label>
              <select value={lang} onChange={(e) => setLang(e.target.value as LanguageCode)} className="vayu-select w-full text-xs">
                {LANGUAGE_OPTIONS.map((l) => (
                  <option key={l.code} value={l.code}>{l.native} ({l.label})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">User Category</label>
              <select
                value={role}
                disabled={user.role === 'community_moderator' || user.role === 'civic_team'}
                onChange={(e) => setRole(e.target.value)}
                className="vayu-select w-full text-xs disabled:opacity-60"
              >
                {selectableRoles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r].title}</option>
                ))}
                {(user.role === 'community_moderator' || user.role === 'civic_team') && (
                  <option value={user.role}>{ROLE_LABELS[user.role].title}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-slate-400">Short Bio / Focus</label>
            <textarea rows={2} value={bio} onChange={(e) => setBio(e.target.value)} className="vayu-input text-xs" />
          </div>
          <button type="submit" disabled={saving} className="vayu-btn-primary text-xs">
            <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </form>

        {/* Account Security, Google Status & Deletion */}
        <div className="space-y-4 lg:col-span-5 text-xs">
          <div className="vayu-card p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-display text-base font-bold text-white">
              <ShieldCheck className="h-4 w-4 text-vayu-teal" /> Connected Accounts
            </h3>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-[#071224] p-3">
              <div>
                <p className="font-semibold text-white">Google OAuth 2.0</p>
                <p className="text-[11px] text-slate-400">Provider mode: {user.auth_provider}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold',
                  user.google_connected ? 'bg-vayu-teal/20 text-vayu-teal' : 'bg-white/10 text-slate-300'
                )}
              >
                {user.google_connected ? 'CONNECTED' : 'NOT LINKED'}
              </span>
            </div>
          </div>

          <form onSubmit={handlePasswordChange} className="vayu-card p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-display text-base font-bold text-white">
              <Lock className="h-4 w-4 text-vayu-cyan" /> Password Management
            </h3>
            {user.has_password && (
              <input
                type="password"
                required
                value={curPwd}
                onChange={(e) => setCurPwd(e.target.value)}
                placeholder="Current password"
                className="vayu-input text-xs"
              />
            )}
            <input
              type="password"
              required
              minLength={8}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="New password (min. 8 characters)"
              className="vayu-input text-xs"
            />
            <button type="submit" className="vayu-btn-secondary w-full text-xs">
              {user.has_password ? 'Update Password' : 'Set Optional Backup Password'}
            </button>
          </form>

          <div className="vayu-card border-red-500/25 p-5 space-y-2">
            <h3 className="font-display text-sm font-bold text-red-300">Danger Zone — Account Deletion</h3>
            <p className="text-[11px] text-slate-400">
              Permanently erase your user profile, saved locations, routines, household data, and scenarios.
            </p>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/15 px-3.5 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete My Account
            </button>
          </div>
        </div>
      </div>

      {/* Personal Activity Tabs */}
      {activityData && (
        <section className="vayu-card p-6 space-y-4 text-xs">
          <div className="flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
            {(
              [
                ['activity', 'Recent Activity'],
                ['locations', `Saved Locations (${activityData.saved_locations.length})`],
                ['reports', `My Reports (${activityData.recent_reports.length})`],
                ['actions', `Action Plans (${activityData.completed_actions.length})`],
                ['scenarios', `Saved Scenarios (${activityData.saved_scenarios.length})`],
                ['notifications', 'Notification History'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setActiveTab(k)}
                className={cn(
                  'rounded-lg px-3 py-1.5 font-semibold transition',
                  activeTab === k ? 'bg-vayu-electric text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                )}
              >
                {lbl}
              </button>
            ))}
          </div>

          {activeTab === 'activity' && (
            <div className="space-y-2">
              {activityData.recent_activity.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl bg-[#071224] px-3.5 py-2.5">
                  <span className="font-mono text-slate-200">{a.action}</span>
                  <span className="text-[11px] text-slate-400">{formatIstTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'locations' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {activityData.saved_locations.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-[#071224] p-3">
                    <div>
                      <p className="font-semibold text-white">{l.label}</p>
                      <p className="text-[11px] text-slate-400">{l.city}, {l.state}</p>
                    </div>
                    {!l.is_primary && (
                      <button type="button" onClick={() => handleRemoveLocation(l.id)} className="text-slate-400 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddLocation} className="flex flex-wrap gap-2">
                <input
                  required
                  value={locLabel}
                  onChange={(e) => setLocLabel(e.target.value)}
                  placeholder="Label (e.g., Parents' Home, Office)"
                  className="vayu-input max-w-xs text-xs"
                />
                <select value={locCity} onChange={(e) => setLocCity(e.target.value)} className="vayu-select text-xs">
                  {SUPPORTED_CITY_NAMES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button type="submit" className="vayu-btn-primary text-xs">
                  <Plus className="h-3.5 w-3.5" /> Save Location
                </button>
              </form>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-2">
              {activityData.recent_reports.length === 0 ? (
                <p className="text-slate-400">You have not filed any citizen reports yet.</p>
              ) : (
                activityData.recent_reports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl bg-[#071224] p-3">
                    <span className="capitalize text-white">{r.category.replace('_', ' ')} — {r.area_label}</span>
                    <span className="font-mono text-vayu-cyan">{r.status}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="space-y-2">
              {activityData.completed_actions.map((ac) => (
                <div key={ac.id} className="flex items-center justify-between rounded-xl bg-[#071224] p-3">
                  <span className="text-white">{ac.title}</span>
                  <span className="font-mono text-vayu-teal">~{ac.exposure_saved_pct}% saved</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div className="space-y-2">
              {activityData.saved_scenarios.length === 0 ? (
                <p className="text-slate-400">No saved Future Me or route comparisons yet.</p>
              ) : (
                activityData.saved_scenarios.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl bg-[#071224] p-3">
                    <span className="text-white">{s.title}</span>
                    <span className="font-mono text-vayu-cyan">Δ {s.exposure_delta_pct}%</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-2">
              {activityData.notification_history.map((n) => (
                <div key={n.id} className="flex items-center justify-between rounded-xl bg-[#071224] p-3">
                  <span className="text-white">{n.title}</span>
                  <span className="text-[11px] text-slate-400">{formatIstTime(n.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <ConfirmModal
        open={deleteOpen}
        title="Permanently Delete Account?"
        description="This action permanently removes your VAYUVERSE AI user account, profile, saved locations, home rooms, household members, and scenario history. This cannot be undone."
        confirmLabel="Yes, Permanently Delete"
        danger
        onConfirm={handleDeleteAccount}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
