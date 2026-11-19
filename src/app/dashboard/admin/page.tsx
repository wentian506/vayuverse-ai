'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, FileWarning, History, Radio, Send, ShieldAlert, Users } from 'lucide-react';
import { ErrorBanner, LoadingSkeleton, PageHeader } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { ROLE_LABELS } from '@/lib/i18n';
import { cn, formatIstTime, SUPPORTED_CITY_NAMES } from '@/lib/utils';

const STATUSES = ['Submitted', 'Acknowledged', 'Under Review', 'Resolved', 'Closed', 'Unverified'];

export default function AdminConsolePage() {
  const { user, toast } = useApp();
  const [tab, setTab] = useState<'incidents' | 'sensors' | 'users' | 'broadcast' | 'audit'>('incidents');
  const [data, setData] = useState<{
    admin_role: string;
    stats: Record<string, number>;
    incidents: {
      id: string;
      category: string;
      severity: string;
      description: string;
      city: string;
      area_label: string;
      status: string;
      duplicate_of_id: string | null;
      moderator_note: string | null;
      reporter_alias: string;
      created_at: string;
    }[];
    sensors: {
      id: string;
      device_code: string;
      display_name: string;
      city: string;
      trust_score: number;
      validation_status: string;
      anomaly_flag: boolean;
    }[];
    users: {
      id: string;
      email: string;
      full_name: string;
      city: string;
      role: string;
      auth_provider: string;
      created_at: string;
    }[];
    audit_logs: {
      id: string;
      actor_email: string | null;
      action: string;
      target_type: string;
      created_at: string;
    }[];
  } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bcast, setBcast] = useState({
    category: 'pollution_event',
    severity: 'warning',
    city_filter: 'All',
    title: '',
    body: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/admin/overview', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || 'Admin access restricted.');
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load admin console');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateIncident = async (id: string, status: string) => {
    const res = await fetch(`/api/v1/admin/incidents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status, moderator_note: notes[id] || `Marked ${status} by moderation review.` }),
    });
    if (res.ok) {
      toast('success', `Incident updated to ${status}`, 'Reporter automatically notified.');
      load();
    }
  };

  const updateSensor = async (id: string, validation_status: string, trust_score: number, anomaly_flag: boolean) => {
    const res = await fetch(`/api/v1/admin/sensors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ validation_status, trust_score, anomaly_flag }),
    });
    if (res.ok) {
      toast('success', 'Sensor status updated');
      load();
    }
  };

  const updateRole = async (uid: string, role: string) => {
    const res = await fetch(`/api/v1/admin/users/${uid}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast('error', 'Role update restricted', d.detail);
      return;
    }
    toast('success', `Role updated to ${ROLE_LABELS[role]?.title || role}`);
    load();
  };

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(bcast),
    });
    if (res.ok) {
      const d = await res.json();
      setBcast({ ...bcast, title: '', body: '' });
      toast('success', 'Advisory broadcast dispatched', `Delivered to ${d.recipients} user(s).`);
      load();
    }
  };

  if (!user?.is_admin) {
    return <ErrorBanner message="403 Forbidden — Administrative tools are restricted to authorised moderators, civic team members, and campus administrators." />;
  }
  if (loading && !data) return <LoadingSkeleton rows={3} />;
  if (error || !data) return <ErrorBanner message={error || 'Restricted'} onRetry={load} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrative & Moderation Console"
        subtitle={`RBAC-protected operations for ${ROLE_LABELS[data.admin_role]?.title || data.admin_role}: incident moderation, sensor health, role governance, broadcast alerts, and system audit history.`}
      />

      {/* Admin Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 text-xs">
        <div className="vayu-card p-4">
          <span className="text-slate-400">Pending Review</span>
          <p className="mt-1 font-display text-2xl font-bold text-amber-300">{data.stats.pending_incidents}</p>
        </div>
        <div className="vayu-card p-4">
          <span className="text-slate-400">Total Incidents</span>
          <p className="mt-1 font-display text-2xl font-bold text-white">{data.stats.total_incidents}</p>
        </div>
        <div className="vayu-card p-4">
          <span className="text-slate-400">Community Sensors</span>
          <p className="mt-1 font-display text-2xl font-bold text-vayu-cyan">{data.stats.community_sensors}</p>
        </div>
        <div className="vayu-card p-4">
          <span className="text-slate-400">Flagged Anomalies</span>
          <p className="mt-1 font-display text-2xl font-bold text-red-400">{data.stats.flagged_sensors}</p>
        </div>
        <div className="vayu-card p-4">
          <span className="text-slate-400">Registered Users</span>
          <p className="mt-1 font-display text-2xl font-bold text-vayu-teal">{data.stats.total_users}</p>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ['incidents', 'Incident Moderation', FileWarning],
            ['sensors', 'Sensor Status', Radio],
            ['users', 'User Management', Users],
            ['broadcast', 'Notification Broadcast', BellRing],
            ['audit', 'Audit History', History],
          ] as const
        ).map(([k, lbl, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold transition',
              tab === k ? 'bg-vayu-electric text-white shadow-glow-electric' : 'vayu-card text-slate-300 hover:text-white'
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {lbl}
          </button>
        ))}
      </div>

      {tab === 'incidents' && (
        <div className="vayu-card p-6 space-y-4 text-xs">
          {data.incidents.map((inc) => (
            <div key={inc.id} className="rounded-2xl border border-white/10 bg-[#071224] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-sm font-bold capitalize text-white">
                  {inc.category.replace('_', ' ')} · {inc.city} ({inc.area_label})
                </span>
                <span className="rounded-full bg-vayu-cyan/20 px-2.5 py-0.5 font-mono text-[10px] font-bold text-vayu-cyan">
                  Current: {inc.status}
                </span>
              </div>
              <p className="text-slate-300">{inc.description}</p>
              <input
                value={notes[inc.id] ?? inc.moderator_note ?? ''}
                onChange={(e) => setNotes({ ...notes, [inc.id]: e.target.value })}
                placeholder="Enter neutral moderation / civic verification note..."
                className="vayu-input text-xs"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => updateIncident(inc.id, st)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-[11px] font-medium transition',
                      inc.status === st
                        ? 'bg-vayu-teal text-vayu-midnight font-bold'
                        : 'bg-white/[0.06] text-slate-200 hover:bg-white/15'
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'sensors' && (
        <div className="vayu-card p-6 space-y-3 text-xs">
          {data.sensors.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#071224] p-4">
              <div>
                <p className="font-semibold text-white">{s.display_name} ({s.device_code})</p>
                <p className="text-slate-400">{s.city} · Trust {s.trust_score}/100 · Status: {s.validation_status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => updateSensor(s.id, 'calibrated', 92, false)} className="vayu-btn-secondary py-1.5 text-[11px] text-vayu-teal">
                  Mark Calibrated
                </button>
                <button type="button" onClick={() => updateSensor(s.id, 'needs_calibration', 70, false)} className="vayu-btn-secondary py-1.5 text-[11px] text-amber-300">
                  Queue Calibration
                </button>
                <button type="button" onClick={() => updateSensor(s.id, 'anomaly_flagged', 40, true)} className="vayu-btn-secondary py-1.5 text-[11px] text-red-300">
                  <ShieldAlert className="h-3 w-3" /> Flag Anomaly
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div className="vayu-card p-6 overflow-x-auto text-xs">
          <table className="w-full text-left">
            <thead className="border-b border-white/10 font-mono text-[10.5px] uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Auth</th>
                <th className="py-2 pr-3">City</th>
                <th className="py-2">Assigned Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-slate-200">
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td className="py-3 pr-3 font-semibold text-white">{u.full_name}</td>
                  <td className="py-3 pr-3 font-mono text-[11px]">{u.email}</td>
                  <td className="py-3 pr-3">{u.auth_provider}</td>
                  <td className="py-3 pr-3">{u.city}</td>
                  <td className="py-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value)}
                      className="vayu-select py-1 text-xs"
                    >
                      {Object.entries(ROLE_LABELS).map(([rk, rv]) => (
                        <option key={rk} value={rk}>{rv.title}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'broadcast' && (
        <form onSubmit={sendBroadcast} className="vayu-card p-6 max-w-2xl space-y-4 text-xs">
          <h2 className="font-display text-lg font-bold text-white">Broadcast Environmental Notification</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <select value={bcast.city_filter} onChange={(e) => setBcast({ ...bcast, city_filter: e.target.value })} className="vayu-select text-xs">
              <option value="All">All Cities</option>
              {SUPPORTED_CITY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={bcast.category} onChange={(e) => setBcast({ ...bcast, category: e.target.value })} className="vayu-select text-xs">
              <option value="pollution_event">Pollution Event</option>
              <option value="aqi_alert">AQI Advisory</option>
              <option value="community">Community Notice</option>
              <option value="campus">Campus Broadcast</option>
            </select>
            <select value={bcast.severity} onChange={(e) => setBcast({ ...bcast, severity: e.target.value })} className="vayu-select text-xs">
              <option value="info">Informational</option>
              <option value="warning">Elevated Warning</option>
              <option value="critical">High Priority</option>
            </select>
          </div>
          <input required minLength={4} value={bcast.title} onChange={(e) => setBcast({ ...bcast, title: e.target.value })} placeholder="Notification title..." className="vayu-input text-xs" />
          <textarea required minLength={8} rows={3} value={bcast.body} onChange={(e) => setBcast({ ...bcast, body: e.target.value })} placeholder="Grounded advisory message citing source & practical actions..." className="vayu-input text-xs" />
          <button type="submit" className="vayu-btn-primary text-xs">
            <Send className="h-3.5 w-3.5" /> Send Broadcast
          </button>
        </form>
      )}

      {tab === 'audit' && (
        <div className="vayu-card p-6 space-y-2 text-xs">
          {data.audit_logs.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#071224] px-3.5 py-2.5">
              <span className="font-mono text-vayu-cyan">{a.action}</span>
              <span className="text-slate-400">
                {a.actor_email || 'system'} · {a.target_type} · {formatIstTime(a.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
