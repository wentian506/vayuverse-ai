'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Lock, Plus, Send, Trash2, Users } from 'lucide-react';
import { ErrorBanner, LoadingSkeleton, PageHeader, ProvenanceBadge } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  name: string;
  relation: string;
  age_group: string;
  routine_window: string;
  care_preference: string;
  aqi_threshold: number;
  notify_enabled: boolean;
  alert_triggered: boolean;
}

export default function FamilyGuardianPage() {
  const { toast } = useApp();
  const [household, setHousehold] = useState<{
    name: string;
    city: string;
    access_scope: string;
    checklist: { id: string; label: string; done: boolean }[];
  } | null>(null);
  const [currentAqi, setCurrentAqi] = useState(0);
  const [currentCat, setCurrentCat] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [sharedAlerts, setSharedAlerts] = useState<{ member_name: string; message: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    relation: 'Parent',
    age_group: 'Senior (60+)',
    routine_window: '07:00 - 08:30 Morning Walk',
    care_preference: 'Alert when outdoor NAQI exceeds 100; prefers afternoon park visits.',
    aqi_threshold: 100,
    notify_enabled: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/family', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load Family Air Guardian.');
      setHousehold(data.household);
      setCurrentAqi(data.current_aqi);
      setCurrentCat(data.current_category);
      setMembers(data.members || []);
      setSharedAlerts(data.shared_alerts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading household');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const res = await fetch('/api/v1/family/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ ...form, name: '' });
      toast('success', 'Family member profile added');
      load();
    }
  };

  const removeMember = async (id: string) => {
    const res = await fetch(`/api/v1/family/members/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      toast('info', 'Member removed from household');
      load();
    }
  };

  const toggleCheck = async (id: string) => {
    const res = await fetch(`/api/v1/family/checklist/${id}/toggle`, {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok && household) {
      const d = await res.json();
      setHousehold({ ...household, checklist: d.checklist });
    }
  };

  const dispatchBrief = async () => {
    const res = await fetch('/api/v1/family/notify', { method: 'POST', credentials: 'include' });
    if (res.ok) {
      const d = await res.json();
      toast('success', 'Household Air Brief dispatched', `Logged notification for ${d.notified_count} enabled member(s).`);
    }
  };

  if (loading && !household) return <LoadingSkeleton rows={2} />;
  if (error || !household) return <ErrorBanner message={error || 'Unavailable'} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Family Air Guardian — ${household.name}`}
        subtitle="Manage private family member profiles, individual NAQI alert thresholds, shared household protection checklists, and coordinated notifications."
        badge="ADVANCED"
        provenance="ESTIMATED"
        actions={
          <button type="button" onClick={dispatchBrief} className="vayu-btn-primary text-xs">
            <Send className="h-3.5 w-3.5" /> Send Family Air Brief
          </button>
        }
      />

      <FeatureInteractiveStudio variant="family" />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#071224] px-4 py-3 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-vayu-teal" /> {household.access_scope}
        </span>
        <span>
          {household.city} Regional NAQI: <strong className="text-vayu-cyan">{currentAqi} ({currentCat})</strong>
        </span>
      </div>

      {/* Shared Alerts */}
      {sharedAlerts.length > 0 && (
        <div className="vayu-card border-orange-400/35 bg-orange-950/20 p-5 space-y-2">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-orange-200">
            <BellRing className="h-4 w-4" /> Active Member Threshold Alerts ({sharedAlerts.length})
          </h2>
          {sharedAlerts.map((a) => (
            <p key={a.member_name} className="text-xs text-slate-200">• {a.message}</p>
          ))}
        </div>
      )}

      {/* Member Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <div key={m.id} className="vayu-card-hover flex flex-col justify-between p-5 text-xs">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-white">{m.name}</h3>
                  <p className="text-slate-400">{m.relation} · {m.age_group}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold',
                    m.alert_triggered ? 'bg-orange-500/20 text-orange-300' : 'bg-vayu-teal/15 text-vayu-teal'
                  )}
                >
                  {m.alert_triggered ? 'ABOVE THRESHOLD' : 'WITHIN THRESHOLD'}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-slate-300">
                <p><strong>Routine:</strong> {m.routine_window}</p>
                <p><strong>Alert at:</strong> Indian NAQI ≥ {m.aqi_threshold}</p>
                {m.care_preference && <p className="text-slate-400">{m.care_preference}</p>}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
              <span className="text-[11px] text-slate-400">
                Notifications: {m.notify_enabled ? 'Enabled' : 'Muted'}
              </span>
              {members.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMember(m.id)}
                  aria-label={`Remove ${m.name}`}
                  className="rounded p-1 text-slate-400 hover:bg-red-500/15 hover:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Household Checklist + Add Family Member */}
      <div className="grid gap-5 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">Household Action Checklist</h2>
            <ProvenanceBadge type="USER REPORTED" compact />
          </div>
          {household.checklist.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggleCheck(c.id)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-xl border p-3.5 text-left text-xs transition',
                c.done ? 'border-vayu-teal/35 bg-vayu-teal/10 text-slate-300' : 'border-white/10 bg-[#071224] text-slate-200'
              )}
            >
              <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', c.done ? 'text-vayu-teal' : 'text-slate-500')} />
              <span className={cn(c.done && 'line-through')}>{c.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={addMember} className="vayu-card p-6 lg:col-span-6 space-y-3 text-xs">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Users className="h-5 w-5 text-vayu-cyan" /> Add Family Member Profile
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-slate-400">Name *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Harpreet Kaur" className="vayu-input text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Relation *</label>
              <input required value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="Parent / Child / Partner" className="vayu-input text-xs" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-slate-400">Age Group</label>
              <select value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })} className="vayu-select w-full text-xs">
                <option>Child (Under 12)</option>
                <option>Teen (13–18)</option>
                <option>Adult</option>
                <option>Senior (60+)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Outdoor Window</label>
              <input value={form.routine_window} onChange={(e) => setForm({ ...form, routine_window: e.target.value })} className="vayu-input text-xs" />
            </div>
            <div>
              <label className="mb-1 block text-slate-400">Alert NAQI Threshold</label>
              <input type="number" min={50} max={350} value={form.aqi_threshold} onChange={(e) => setForm({ ...form, aqi_threshold: Number(e.target.value) })} className="vayu-input text-xs" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-slate-400">Routine / Protection Preference (Non-Medical)</label>
            <input value={form.care_preference} onChange={(e) => setForm({ ...form, care_preference: e.target.value })} className="vayu-input text-xs" />
          </div>
          <button type="submit" className="vayu-btn-primary text-xs">
            <Plus className="h-3.5 w-3.5" /> Save Member Profile
          </button>
        </form>
      </div>
    </div>
  );
}
