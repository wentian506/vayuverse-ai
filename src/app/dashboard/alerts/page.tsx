'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Radio, Save } from 'lucide-react';
import { ErrorBanner, LoadingSkeleton, PageHeader } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';
import { FeatureInteractiveStudio } from '@/components/ui/FeatureStudio';
import { cn, formatIstTime } from '@/lib/utils';

interface NotifItem {
  id: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

export default function AlertsPage() {
  const { selectedCity, toast, refreshSession } = useApp();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [filter, setFilter] = useState('all');
  const [prefs, setPrefs] = useState({
    aqi_alert_threshold: 150,
    notify_aqi_alerts: true,
    notify_forecast_spikes: true,
    notify_community_updates: true,
    notify_campus_alerts: false,
    notify_routine_reminders: true,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/notifications', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not load notifications.');
      setItems(data.notifications || []);
      if (data.preferences) setPrefs(data.preferences);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'POST', credentials: 'include' });
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
    refreshSession();
  };

  const markAllRead = async () => {
    await fetch('/api/v1/notifications/read-all', { method: 'POST', credentials: 'include' });
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    refreshSession();
    toast('success', 'All notifications marked as read');
  };

  const runLiveAlertCheck = async () => {
    const res = await fetch('/api/v1/notifications/evaluate-live', {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const d = await res.json();
      toast('info', 'Live threshold check completed', d.created?.title);
      load();
      refreshSession();
    }
  };

  const savePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/profile/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(prefs),
    });
    if (res.ok) {
      toast('success', 'Notification preferences saved');
      refreshSession();
    }
  };

  if (loading && items.length === 0) return <LoadingSkeleton rows={2} />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  const filtered = items.filter((i) => {
    if (filter === 'unread') return !i.is_read;
    if (filter === 'all') return true;
    return i.category === filter;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts & Notifications"
        subtitle="Real-time Indian NAQI threshold alerts, forecast spike early warnings, routine reminders, community report status updates, and campus advisories."
        badge="MVP"
        actions={
          <>
            <button type="button" onClick={runLiveAlertCheck} className="vayu-btn-primary text-xs">
              <Radio className="h-3.5 w-3.5" /> Run Live {selectedCity} Alert Check
            </button>
            <button type="button" onClick={markAllRead} className="vayu-btn-secondary text-xs">
              <CheckCheck className="h-3.5 w-3.5" /> Mark All Read
            </button>
          </>
        }
      />

      <FeatureInteractiveStudio variant="alerts" />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="vayu-card p-6 lg:col-span-8 space-y-4">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              ['all', 'All'],
              ['unread', 'Unread'],
              ['aqi_alert', 'AQI Alerts'],
              ['pollution_event', 'Events'],
              ['forecast', 'Forecast'],
              ['reminder', 'Reminders'],
              ['community', 'Community'],
              ['campus', 'Campus'],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  'rounded-lg px-2.5 py-1 font-medium transition',
                  filter === k ? 'bg-vayu-electric text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                )}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">No notifications in this view.</p>
            ) : (
              filtered.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'rounded-2xl border p-4 text-xs transition',
                    n.is_read
                      ? 'border-white/[0.07] bg-[#071224]/60 text-slate-400'
                      : 'border-vayu-cyan/35 bg-vayu-deep/55 text-slate-100'
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bell className={cn('h-4 w-4', n.severity === 'warning' || n.severity === 'critical' ? 'text-orange-300' : 'text-vayu-cyan')} />
                      <h3 className="font-display text-sm font-bold text-white">{n.title}</h3>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">{formatIstTime(n.created_at)}</span>
                  </div>
                  <p className="mt-1.5 leading-relaxed text-slate-300">{n.body}</p>
                  <div className="mt-3 flex items-center justify-between">
                    {n.action_url ? (
                      <Link href={n.action_url} className="font-semibold text-vayu-cyan hover:underline">
                        Open related module →
                      </Link>
                    ) : (
                      <span />
                    )}
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notification Preferences */}
        <form onSubmit={savePrefs} className="vayu-card p-6 lg:col-span-4 space-y-4 text-xs h-fit">
          <h2 className="font-display text-lg font-bold text-white">Alert Preferences</h2>
          <div>
            <div className="mb-1 flex justify-between">
              <span className="text-slate-300">Indian NAQI Threshold</span>
              <strong className="font-mono text-vayu-cyan">{prefs.aqi_alert_threshold}</strong>
            </div>
            <input
              type="range"
              min={50}
              max={400}
              step={10}
              value={prefs.aqi_alert_threshold}
              onChange={(e) => setPrefs({ ...prefs, aqi_alert_threshold: Number(e.target.value) })}
              className="w-full accent-vayu-cyan"
            />
          </div>

          {(
            [
              ['notify_aqi_alerts', 'Ambient AQI Threshold Alerts'],
              ['notify_forecast_spikes', 'Pollution Event & Forecast Spikes'],
              ['notify_routine_reminders', 'Personal Routine & Ventilation Reminders'],
              ['notify_community_updates', 'Community Report Status Updates'],
              ['notify_campus_alerts', 'VAYU Campus Institutional Advisories'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#071224] p-3 cursor-pointer">
              <span className="text-slate-200">{label}</span>
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
              />
            </label>
          ))}

          <button type="submit" className="vayu-btn-primary w-full text-xs">
            <Save className="h-3.5 w-3.5" /> Save Alert Preferences
          </button>
        </form>
      </div>
    </div>
  );
}
