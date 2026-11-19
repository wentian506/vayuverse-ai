'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertOctagon,
  BarChart3,
  Bell,
  Bot,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Compass,
  Download,
  FileWarning,
  Globe,
  HeartHandshake,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Radar,
  Route,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import { VayuLogo } from '@/components/ui/VayuUI';
import { CitySearchPicker } from '@/components/ui/CitySearchPicker';
import { useApp } from '@/components/providers/AppProvider';
import { LANGUAGE_OPTIONS, ROLE_LABELS, tr } from '@/lib/i18n';
import { LanguageCode } from '@/lib/types';
import { cn, downloadTextFile, SUPPORTED_CITY_NAMES } from '@/lib/utils';

interface NavGroup {
  id: string;
  label: string;
  items: {
    href: string;
    labelKey: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'core',
    label: 'Air Intelligence',
    items: [
      { href: '/dashboard', labelKey: 'nav_overview', icon: LayoutDashboard },
      { href: '/dashboard/live-air', labelKey: 'nav_live', icon: Activity },
      { href: '/dashboard/pollution-shadow', labelKey: 'nav_shadow', icon: Radar },
    ],
  },
  {
    id: 'personal',
    label: 'Personal Optimisation',
    items: [
      { href: '/dashboard/future-me', labelKey: 'nav_future', icon: Compass },
      { href: '/dashboard/routes', labelKey: 'nav_routes', icon: Route },
      { href: '/dashboard/replanner', labelKey: 'nav_replanner', icon: CalendarClock },
    ],
  },
  {
    id: 'spaces',
    label: 'Spaces & Protection',
    items: [
      { href: '/dashboard/home', labelKey: 'nav_home', icon: Home },
      { href: '/dashboard/family', labelKey: 'nav_family', icon: HeartHandshake },
      { href: '/dashboard/campus', labelKey: 'nav_campus', icon: Building2 },
    ],
  },
  {
    id: 'civic',
    label: 'Community & Civic',
    items: [
      { href: '/dashboard/community', labelKey: 'nav_community', icon: Users },
      { href: '/dashboard/incidents', labelKey: 'nav_incidents', icon: FileWarning },
    ],
  },
  {
    id: 'governance',
    label: 'AI, Trust & Analytics',
    items: [
      { href: '/dashboard/assistant', labelKey: 'nav_assistant', icon: Bot },
      { href: '/dashboard/alerts', labelKey: 'nav_alerts', icon: Bell },
      { href: '/dashboard/trust', labelKey: 'nav_trust', icon: ShieldCheck },
      { href: '/dashboard/reports', labelKey: 'nav_reports', icon: BarChart3 },
      { href: '/dashboard/admin', labelKey: 'nav_admin', icon: ShieldAlert, adminOnly: true },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { href: '/dashboard/settings', labelKey: 'nav_settings', icon: Settings },
      { href: '/dashboard/profile', labelKey: 'nav_profile', icon: User },
    ],
  },
];

const FEATURE_ACCENTS: Record<string, { color: string; tag: string }> = {
  '/dashboard': { color: '#3898FF', tag: 'AQI · Weather · Gases' },
  '/dashboard/live-air': { color: '#22C55E', tag: 'Corridor & Station Grid' },
  '/dashboard/pollution-shadow': { color: '#8B5CF6', tag: '72h Plume & Wind Drift' },
  '/dashboard/future-me': { color: '#EC4899', tag: 'Habit & Exposure Twin' },
  '/dashboard/routes': { color: '#14B8A6', tag: 'Route & Emission Matrix' },
  '/dashboard/replanner': { color: '#F59E0B', tag: '24h Schedule Optimiser' },
  '/dashboard/home': { color: '#10B981', tag: 'Indoor Air & Filtration' },
  '/dashboard/family': { color: '#F43F5E', tag: 'Household Protection' },
  '/dashboard/campus': { color: '#0EA5E9', tag: 'School & Activity Ops' },
  '/dashboard/community': { color: '#84CC16', tag: 'Sensors & Clean Spaces' },
  '/dashboard/incidents': { color: '#F97316', tag: 'Civic Signal Reports' },
  '/dashboard/assistant': { color: '#21D4E8', tag: 'Grounded AI Copilot' },
  '/dashboard/alerts': { color: '#EAB308', tag: 'Threshold Alert Rules' },
  '/dashboard/trust': { color: '#60A5FA', tag: 'Provenance & Audit' },
  '/dashboard/reports': { color: '#A78BFA', tag: 'Briefings & Exports' },
  '/dashboard/profile': { color: '#38BDF8', tag: 'Account & Privacy' },
  '/dashboard/admin': { color: '#EF4444', tag: 'Moderation Console' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    loadingAuth,
    deploymentPhase,
    selectedCity,
    setSelectedCity,
    aqiStandard,
    setAqiStandard,
    language,
    setLanguage,
    exitDemoTo,
    logout,
    toast,
  } = useApp();
  const activeTheme = FEATURE_ACCENTS[pathname] || FEATURE_ACCENTS['/dashboard'];
  const isDemoSession = Boolean(user?.is_demo || user?.auth_provider === 'demo');

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenu, setProfileMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);
  const [emergencyModal, setEmergencyModal] = useState(false);
  const [quickNotifs, setQuickNotifs] = useState<
    { id: string; title: string; body: string; is_read: boolean; action_url?: string }[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!loadingAuth && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loadingAuth, user, router, pathname]);

  useEffect(() => {
    if (!user) return;
    setUnreadCount(user.unread_notifications || 0);
    fetch('/api/v1/notifications', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setQuickNotifs((d.notifications || []).slice(0, 5));
          setUnreadCount(d.unread_count || 0);
        }
      })
      .catch(() => {});
  }, [user, pathname]);

  const allItems = useMemo(() => {
    return NAV_GROUPS.flatMap((g) =>
      g.items
        .filter((it) => !it.adminOnly || user?.is_admin)
        .map((it) => ({ ...it, label: tr(language, it.labelKey), group: g.label }))
    );
  }, [user?.is_admin, language]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { pages: allItems.slice(0, 6), cities: SUPPORTED_CITY_NAMES.slice(0, 4) };
    return {
      pages: allItems.filter(
        (it) => it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q)
      ),
      cities: SUPPORTED_CITY_NAMES.filter((c) => c.toLowerCase().includes(q)),
    };
  }, [searchQuery, allItems]);

  const currentPageLabel = useMemo(() => {
    const found = allItems.find((i) => i.href === pathname);
    return found ? found.label : 'Overview';
  }, [allItems, pathname]);

  const handleDownloadOfflinePack = () => {
    const pack = `# VAYUVERSE AI — OFFLINE AIR PROTECTION PACK
Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
Primary City: ${selectedCity} | Member: ${user?.profile.full_name || 'Member'}

## 1. INDIAN NATIONAL AQI (CPCB) QUICK REFERENCE
- 0–50 (Good): Normal outdoor activity & open-window cross-ventilation.
- 51–100 (Satisfactory): Favourable overall; prefer low-traffic streets for vigorous exercise.
- 101–200 (Moderate): Shift prolonged strenuous workouts toward midday mixing hours (13:00–16:00).
- 201–300 (Poor): Shorten long outdoor exertion; close street-facing windows morning & night; pack N95/FFP2.
- 301–400 (Very Poor): Move workouts indoors; run HEPA filtration if available; wear fitted N95/FFP2 outdoors.
- 401–500 (Severe / Emergency): Avoid non-essential outdoor trips; seal one clean-air sleeping room; follow CPCB/GRAP advisories.

## 2. POLLUTION EMERGENCY ROOM CHECKLIST (WORKS WITHOUT INTERNET)
[ ] Close exterior windows and seal large door gaps with damp towels during heavy smoke/smog.
[ ] Run indoor HEPA purifier on medium-high (no ioniser/ozone mode) or maintain one designated clean room.
[ ] Avoid all indoor combustion: no incense, mosquito coils, candles, or unvented high-smoke frying.
[ ] Use wet mopping instead of dry sweeping to keep settled PM10 down.
[ ] Wear a snug, nose-clip-fitted N95 / FFP2 respirator for essential outdoor travel (cloth masks do not block fine PM2.5 effectively).
[ ] Keep drinking water handy and check on children and older household members.

## 3. IMPORTANT BOUNDARY
This guide provides non-medical environmental preparedness steps. For respiratory distress, chest pain, or personal medical questions, contact a qualified physician or local emergency medical services immediately.
`;
    downloadTextFile(`vayuverse-offline-pack-${selectedCity.toLowerCase()}.md`, pack, 'text/markdown');
    toast('success', 'Offline Protection Pack saved', 'Ready for offline reading or printing.');
  };

  const renderSidebarContent = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4">
        <Link href="/" onClick={onNavigate}>
          <VayuLogo size="sm" showTagline />
        </Link>
        {onNavigate && (
          <button
            type="button"
            onClick={onNavigate}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-label="Dashboard navigation">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((i) => !i.adminOnly || user?.is_admin);
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsedGroups[group.id] || false;

          return (
            <div key={group.id}>
              <button
                type="button"
                onClick={() =>
                  setCollapsedGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))
                }
                className="flex w-full items-center justify-between px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-200"
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn('h-3 w-3 transition-transform', isCollapsed && '-rotate-90')}
                />
              </button>
              {!isCollapsed && (
                <div className="mt-1 space-y-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    const itemAccent = FEATURE_ACCENTS[item.href]?.color || '#3898FF';
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        style={
                          active
                            ? {
                                backgroundColor: `${itemAccent}1F`,
                                borderLeft: `3px solid ${itemAccent}`,
                              }
                            : undefined
                        }
                        className={cn(
                          'group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-all',
                          active ? 'text-white shadow-sm' : 'text-slate-300/85 hover:bg-white/[0.05] hover:text-white'
                        )}
                      >
                        <span
                          className="inline-flex shrink-0 transition"
                          style={{ color: active ? itemAccent : undefined }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="truncate">{tr(language, item.labelKey)}</span>
                        {item.href === '/dashboard/alerts' && unreadCount > 0 && (
                          <span className="ml-auto rounded-full bg-[#3898FF]/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#60A5FA]">
                            {unreadCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Quick Preparedness Footer */}
      <div className="border-t border-white/[0.07] p-3 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setEmergencyModal(true)}
            className="flex items-center justify-center gap-1 rounded-lg border border-orange-400/30 bg-orange-500/10 px-2 py-1.5 text-[11px] font-semibold text-orange-200 transition hover:bg-orange-500/20"
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            <span className="truncate">Emergency</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadOfflinePack}
            className="flex items-center justify-center gap-1 rounded-lg border border-vayu-teal/30 bg-vayu-teal/10 px-2 py-1.5 text-[11px] font-semibold text-vayu-teal transition hover:bg-vayu-teal/20"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="truncate">{tr(language, 'offline_pack')}</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (loadingAuth || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vayu-midnight">
        <div className="flex flex-col items-center gap-3">
          <VayuLogo size="lg" />
          <p className="font-mono text-xs text-slate-400">Verifying encrypted session...</p>
        </div>
      </div>
    );
  }

  const initials = (user.profile.full_name || user.email)
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-[#11161D]">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-white/[0.08] bg-[#141A23] lg:block">
        <div className="sticky top-0 h-screen">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile Drawer Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 h-full w-72 border-r border-white/10 bg-[#071223]"
            >
              {renderSidebarContent(() => setMobileOpen(false))}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Navigation */}
        <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#081426]/88 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-white lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Search */}
              <div className="relative hidden max-w-xs flex-1 sm:block">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={tr(language, 'search_placeholder')}
                  aria-label="Search modules and locations"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-xs text-white placeholder-slate-400 focus:border-vayu-cyan/50 focus:outline-none"
                />
                {searchOpen && (
                  <div className="absolute left-0 right-0 top-11 rounded-xl border border-white/15 bg-[#0A1A32] p-2 shadow-glass">
                    {searchResults.pages.length > 0 && (
                      <div className="mb-1">
                        <p className="px-2 py-1 font-mono text-[10px] uppercase text-slate-400">Modules</p>
                        {searchResults.pages.slice(0, 5).map((p) => (
                          <button
                            key={p.href}
                            type="button"
                            onMouseDown={() => {
                              router.push(p.href);
                              setSearchQuery('');
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-white/10"
                          >
                            <span>{p.label}</span>
                            <span className="text-[10px] text-slate-400">{p.group}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchResults.cities.length > 0 && (
                      <div>
                        <p className="px-2 py-1 font-mono text-[10px] uppercase text-slate-400">Switch City</p>
                        {searchResults.cities.slice(0, 4).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onMouseDown={() => {
                              setSelectedCity(c);
                              setSearchQuery('');
                              toast('info', `Location set to ${c}`);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-vayu-cyan hover:bg-white/10"
                          >
                            <MapPin className="h-3 w-3" /> {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Controls: Location, Language, Notifications, Profile */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Universal Live City Search & GPS Selector */}
              <CitySearchPicker variant="header" />

              {/* AQI Standard Selector (IN NAQI / US EPA) */}
              <div className="hidden items-center rounded-xl border border-white/10 bg-[#0F141B] p-0.5 text-[11px] sm:flex">
                {(['IN', 'US'] as const).map((std) => (
                  <button
                    key={std}
                    type="button"
                    onClick={() => setAqiStandard(std)}
                    className={cn(
                      'rounded-lg px-2 py-1 font-bold transition',
                      aqiStandard === std ? 'bg-[#3898FF] text-white' : 'text-slate-400 hover:text-white'
                    )}
                  >
                    AQI-{std}
                  </button>
                ))}
              </div>

              {/* Language Selector */}
              <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 md:flex">
                <Globe className="h-3.5 w-3.5 text-vayu-teal" />
                <select
                  aria-label="Interface language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                  className="bg-transparent text-xs font-medium text-slate-200 focus:outline-none"
                >
                  {LANGUAGE_OPTIONS.map((l) => (
                    <option key={l.code} value={l.code} className="bg-vayu-midnight text-white">
                      {l.native}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notification Centre */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifMenu((v) => !v);
                    setProfileMenu(false);
                  }}
                  aria-label="Notifications"
                  className="relative rounded-xl border border-white/10 bg-white/[0.04] p-2 text-slate-200 transition hover:border-vayu-cyan/40 hover:text-white"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-vayu-cyan px-1 font-mono text-[9px] font-bold text-vayu-midnight">
                      {unreadCount}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {notifMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute right-0 top-11 w-80 rounded-2xl border border-white/15 bg-[#0A1A32] p-3 shadow-glass"
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-2">
                        <span className="text-xs font-bold text-white">Notification Centre</span>
                        <Link
                          href="/dashboard/alerts"
                          onClick={() => setNotifMenu(false)}
                          className="text-[11px] font-semibold text-vayu-cyan hover:underline"
                        >
                          View all →
                        </Link>
                      </div>
                      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                        {quickNotifs.length === 0 ? (
                          <p className="py-4 text-center text-xs text-slate-400">No recent alerts</p>
                        ) : (
                          quickNotifs.map((n) => (
                            <Link
                              key={n.id}
                              href={n.action_url || '/dashboard/alerts'}
                              onClick={() => setNotifMenu(false)}
                              className={cn(
                                'block rounded-xl p-2.5 text-xs transition hover:bg-white/10',
                                n.is_read ? 'bg-white/[0.02] text-slate-400' : 'bg-vayu-electric/15 text-slate-100'
                              )}
                            >
                              <p className="font-semibold text-white line-clamp-1">{n.title}</p>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-300">{n.body}</p>
                            </Link>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* User Avatar & Profile Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenu((v) => !v);
                    setNotifMenu(false);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1 pr-2.5 transition hover:border-vayu-cyan/40"
                >
                  <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-vayu-electric to-vayu-teal text-xs font-bold text-white">
                    {user.profile.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.profile.avatar_url} alt={user.profile.full_name} className="h-full w-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>
                  <span className="hidden max-w-[110px] truncate text-xs font-semibold text-white sm:block">
                    {user.profile.full_name.split(' ')[0]}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>

                <AnimatePresence>
                  {profileMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="absolute right-0 top-11 w-60 rounded-2xl border border-white/15 bg-[#0A1A32] p-2 shadow-glass"
                    >
                      <div className="border-b border-white/10 px-3 py-2.5">
                        <p className="truncate text-xs font-bold text-white">{user.profile.full_name}</p>
                        <p className="truncate text-[11px] text-slate-400">{user.email}</p>
                        <span className="mt-1 inline-block rounded-md bg-vayu-cyan/15 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-vayu-cyan">
                          {isDemoSession ? 'DEMO EXPLORER (GUEST)' : ROLE_LABELS[user.role]?.title || user.role}
                        </span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-xs">
                        {isDemoSession && (
                          <button
                            type="button"
                            onClick={() => exitDemoTo('/register')}
                            className="flex w-full items-center gap-2 rounded-lg bg-vayu-teal/15 px-3 py-2 text-left font-semibold text-vayu-teal hover:bg-vayu-teal/25"
                          >
                            <User className="h-3.5 w-3.5" /> Create Personal Account
                          </button>
                        )}
                        <Link
                          href="/dashboard/profile"
                          onClick={() => setProfileMenu(false)}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10"
                        >
                          <User className="h-3.5 w-3.5 text-vayu-cyan" /> My Profile
                        </Link>
                        <Link
                          href="/dashboard/settings"
                          onClick={() => setProfileMenu(false)}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10"
                        >
                          <Settings className="h-3.5 w-3.5 text-slate-400" /> Settings &amp; Consent
                        </Link>
                        <Link
                          href="/dashboard/trust"
                          onClick={() => setProfileMenu(false)}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-200 hover:bg-white/10"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-vayu-teal" /> Trust &amp; Sources
                        </Link>
                        <button
                          type="button"
                          onClick={logout}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/15"
                        >
                          <LogOut className="h-3.5 w-3.5" /> {isDemoSession ? 'Exit Demo Mode' : tr(language, 'logout')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Breadcrumb & Phase Indicator Bar */}
          <div className="flex items-center justify-between border-t border-white/[0.05] px-4 py-1.5 text-[11px] text-slate-400 sm:px-6">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
              <Link href="/dashboard" className="hover:text-vayu-cyan">Dashboard</Link>
              {pathname !== '/dashboard' && (
                <>
                  <ChevronRight className="h-3 w-3 text-slate-600" />
                  <span className="font-medium text-slate-200">{currentPageLabel}</span>
                </>
              )}
            </nav>
            {deploymentPhase === 'phase1_netlify_oauth' && (
              <span className="font-mono text-[10px] text-vayu-cyan">
                Phase 1 Netlify Live (Add FASTAPI_BACKEND_URL for Phase 2 DB)
              </span>
            )}
          </div>
          {/* Interactive Demo Mode Disclosure & Quick Upgrade Banner */}
          {isDemoSession && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-vayu-teal/30 bg-gradient-to-r from-vayu-teal/15 via-vayu-cyan/10 to-vayu-electric/15 px-4 py-2 text-xs sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-slate-200">
                <span className="rounded-full border border-vayu-teal/50 bg-vayu-teal/20 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-vayu-teal">
                  Demo Mode
                </span>
                <span>
                  Live Open-Meteo air &amp; weather telemetry with a temporary 24h guest sandbox (admin actions restricted).
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exitDemoTo('/register')}
                  className="rounded-lg bg-vayu-electric px-2.5 py-1 text-[11px] font-semibold text-white transition hover:brightness-110"
                >
                  Create Account / Google Sign-In
                </button>
                <button
                  type="button"
                  onClick={() => exitDemoTo('/')}
                  className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-white/15 hover:text-white"
                >
                  Exit Demo
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Page Content with feature-accent breadcrumb & smooth transition */}
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 max-w-[1440px] w-full mx-auto">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href="/dashboard" className="font-semibold text-[#4DA3FF] hover:underline">
                Dashboard
              </Link>
              <span>&gt;</span>
              <span className="text-slate-300">India</span>
              <span>&gt;</span>
              <span className="font-semibold text-[#4DA3FF]">{selectedCity}</span>
              {pathname !== '/dashboard' && (
                <>
                  <span>&gt;</span>
                  <span className="font-semibold text-white">{activeTheme.tag}</span>
                </>
              )}
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold"
              style={{
                backgroundColor: `${activeTheme.color}20`,
                color: activeTheme.color,
                border: `1px solid ${activeTheme.color}40`,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeTheme.color }} />
              {activeTheme.tag}
            </span>
          </div>
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Pollution Emergency Mode Modal (MVP Feature) */}
      <AnimatePresence>
        {emergencyModal && (
          <div
            className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="emg-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="vayu-card w-full max-w-lg border-orange-400/40 p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-xl bg-orange-500/20 p-2 text-orange-300">
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 id="emg-title" className="font-display text-lg font-bold text-white">
                      Pollution Emergency Mode Protocol
                    </h2>
                    <p className="text-xs text-orange-200">
                      Rapid protective checklist for Indian NAQI &gt; 200 (Poor / Very Poor / Severe)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEmergencyModal(false)}
                  aria-label="Close emergency modal"
                  className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-4 space-y-2.5 text-xs leading-relaxed text-slate-200">
                <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <strong>1. Seal &amp; Filter One Clean Room:</strong> Close street-facing windows, switch AC/car ventilation to internal recirculate, and run HEPA filtration without ionisers.
                </li>
                <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <strong>2. Pause Strenuous Outdoor Exertion:</strong> High breathing rates multiply particulate intake. Use <em>Daily Replanner</em> to move workouts indoors.
                </li>
                <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <strong>3. Respirator Protection Outdoors:</strong> Use a snug, nose-bridge-sealed N95 / FFP2 respirator for essential trips.
                </li>
                <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <strong>4. Zero Indoor Smoke Sources:</strong> Avoid incense, candles, mosquito coils, and unvented high-smoke frying.
                </li>
              </ul>
              <p className="mt-3 text-[11px] text-slate-400">
                Non-medical preparedness protocol. Seek prompt clinical care from a licensed physician if experiencing acute breathing difficulty.
              </p>
              <div className="mt-5 flex justify-end gap-2.5">
                <button type="button" onClick={handleDownloadOfflinePack} className="vayu-btn-secondary text-xs">
                  <Download className="h-3.5 w-3.5" /> Save Offline Copy
                </button>
                <button type="button" onClick={() => setEmergencyModal(false)} className="vayu-btn-primary text-xs">
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
