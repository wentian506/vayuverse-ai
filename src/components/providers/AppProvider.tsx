'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { AuthUser, LanguageCode, SelectedLocation } from '@/lib/types';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface AppContextValue {
  user: AuthUser | null;
  loadingAuth: boolean;
  startingDemo: boolean;
  demoModeEnabled: boolean;
  googleOAuthConfigured: boolean;
  googleCallbackUrl: string;
  deploymentPhase: 'phase1_netlify_oauth' | 'phase2_fullstack';
  selectedCity: string;
  selectedLocation: SelectedLocation;
  setSelectedCity: (city: string) => void;
  selectLocation: (loc: SelectedLocation) => void;
  aqiStandard: 'IN' | 'US';
  setAqiStandard: (std: 'IN' | 'US') => void;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  refreshSession: () => Promise<AuthUser | null>;
  setUserDirect: (u: AuthUser | null) => void;
  enterDemoMode: (nextPath?: string, city?: string) => Promise<void>;
  exitDemoTo: (destination?: string) => Promise<void>;
  logout: () => Promise<void>;
  toast: (type: ToastItem['type'], title: string, description?: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [startingDemo, setStartingDemo] = useState(false);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [googleOAuthConfigured, setGoogleOAuthConfigured] = useState(false);
  const [googleCallbackUrl, setGoogleCallbackUrl] = useState('');
  const [deploymentPhase, setDeploymentPhase] = useState<'phase1_netlify_oauth' | 'phase2_fullstack'>('phase2_fullstack');
  const [selectedLocation, setSelectedLocationState] = useState<SelectedLocation>({
    city: 'Ludhiana',
    state: 'Punjab',
    country: 'India',
    lat: null,
    lon: null,
    isCustomPin: false,
  });
  const selectedCity = selectedLocation.city;

  const setSelectedCity = useCallback((city: string) => {
    const cleaned = (city || 'Ludhiana').trim();
    setSelectedLocationState({
      city: cleaned,
      lat: null,
      lon: null,
      isCustomPin: false,
    });
  }, []);

  const selectLocation = useCallback((loc: SelectedLocation) => {
    setSelectedLocationState({
      city: (loc.city || 'Ludhiana').trim(),
      state: loc.state,
      country: loc.country,
      lat: loc.lat ?? null,
      lon: loc.lon ?? null,
      isCustomPin: Boolean(loc.isCustomPin),
    });
  }, []);
  const [aqiStandard, setAqiStandard] = useState<'IN' | 'US'>('IN');
  const [language, setLanguageState] = useState<LanguageCode>('en');
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((type: ToastItem['type'], title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      setGoogleOAuthConfigured(Boolean(data.google_oauth_configured));
      setGoogleCallbackUrl(String(data.google_callback_url || ''));
      if (typeof data.demo_mode_enabled === 'boolean') setDemoModeEnabled(data.demo_mode_enabled);
      if (data.deployment_phase) setDeploymentPhase(data.deployment_phase);
      if (data.authenticated && data.user) {
        setUser(data.user);
        if (data.user.profile?.city) setSelectedCity(data.user.profile.city);
        if (data.user.profile?.preferred_language) setLanguageState(data.user.profile.preferred_language);
        return data.user as AuthUser;
      }
      setUser(null);
      return null;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const setUserDirect = useCallback((u: AuthUser | null) => {
    setUser(u);
    if (u?.profile?.city) setSelectedCity(u.profile.city);
    if (u?.profile?.preferred_language) setLanguageState(u.profile.preferred_language);
  }, []);

  const setLanguage = useCallback(
    (lang: LanguageCode) => {
      setLanguageState(lang);
      if (user) {
        fetch('/api/v1/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ preferred_language: lang }),
        }).catch(() => {});
      }
    },
    [user]
  );

  const enterDemoMode = useCallback(
    async (nextPath = '/dashboard', city?: string) => {
      if (startingDemo) return;
      setStartingDemo(true);
      try {
        const res = await fetch('/api/auth/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            next: nextPath,
            city: city || selectedCity || 'Ludhiana',
            language,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast('error', 'Demo Mode unavailable', data.detail || 'Please sign in instead.');
          setStartingDemo(false);
          return;
        }
        if (data.user) {
          setUserDirect(data.user);
        }
        if (data.deployment_phase) setDeploymentPhase(data.deployment_phase);
        toast('success', 'Demo Mode Active', 'Exploring the full VAYUVERSE AI dashboard.');
        window.location.href = data.redirect_to || '/dashboard';
      } catch {
        // Direct server navigation fallback
        window.location.href = `/api/auth/demo?next=${encodeURIComponent(nextPath)}&city=${encodeURIComponent(city || selectedCity || 'Ludhiana')}`;
      }
    },
    [startingDemo, selectedCity, language, setUserDirect, toast]
  );

  const exitDemoTo = useCallback(async (destination = '/') => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
    window.location.href = destination;
  }, []);

  const logout = useCallback(async () => {
    const wasDemo = Boolean(user?.is_demo || user?.auth_provider === 'demo');
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    toast(
      'info',
      wasDemo ? 'Exited Demo Mode' : 'Signed out securely',
      wasDemo ? 'Temporary demo workspace closed.' : 'Your VAYUVERSE session has ended.'
    );
    window.location.href = wasDemo ? '/' : '/login';
  }, [toast, user]);

  const reducedPref = user?.preferences?.reduced_motion ? 'always' : 'user';

  return (
    <MotionConfig reducedMotion={reducedPref}>
      <AppContext.Provider
        value={{
          user,
          loadingAuth,
          startingDemo,
          demoModeEnabled,
          googleOAuthConfigured,
          googleCallbackUrl,
          deploymentPhase,
          selectedCity,
          selectedLocation,
          setSelectedCity,
          selectLocation,
          aqiStandard,
          setAqiStandard,
          language,
          setLanguage,
          refreshSession,
          setUserDirect,
          enterDemoMode,
          exitDemoTo,
          logout,
          toast,
        }}
      >
        {children}

        {/* Global Toast Stack */}
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
        >
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto flex items-start gap-3 rounded-xl border border-white/15 bg-[#0B1E38]/95 p-3.5 shadow-glass backdrop-blur-xl"
              >
                {t.type === 'success' && <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-vayu-teal" />}
                {t.type === 'error' && <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />}
                {t.type === 'info' && <Info className="mt-0.5 h-5 w-5 shrink-0 text-vayu-cyan" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-xs text-slate-300">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  aria-label="Dismiss notification"
                  className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </AppContext.Provider>
    </MotionConfig>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
