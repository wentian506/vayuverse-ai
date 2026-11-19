'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useApp } from '@/components/providers/AppProvider';
import { VayuLogo } from '@/components/ui/VayuUI';
import { SUPPORTED_CITY_NAMES } from '@/lib/utils';

function GoogleGIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
  );
}

const OAUTH_ERRORS: Record<string, string> = {
  oauth_not_configured:
    'Google OAuth credentials (GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET) are not set yet. Add your Google Cloud Client ID & Secret in Vercel environment variables (or .env.local) to activate Google Sign-In.',
  google_access_denied: 'Google Sign-In was cancelled. You can try again anytime.',
  invalid_oauth_state: 'Security state expired. Please click continue with Google again.',
  google_token_exchange_failed: 'Google token exchange failed. Check GOOGLE_CLIENT_SECRET and Authorized Redirect URI.',
  google_userinfo_failed: 'Could not retrieve verified profile from Google.',
  google_email_unverified: 'Your Google email address must be verified before signing in.',
  demo_disabled: 'Please sign in with your account or continue with Google.',
  session_expired: 'Your session expired. Please log in again.',
};

export function SplitScreenAuthView({ initialTab = 'login' }: { initialTab?: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const {
    setUserDirect,
    googleOAuthConfigured,
    googleCallbackUrl,
    toast,
  } = useApp();

  const nextPath = params.get('next') || '/dashboard';
  const tabParam = params.get('tab');
  const urlError = params.get('error');
  const callbackHint = params.get('callback') || googleCallbackUrl;

  const [tab, setTab] = useState<'login' | 'signup'>(
    tabParam === 'signup' ? 'signup' : initialTab
  );
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState('Ludhiana');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (tabParam === 'signup') setTab('signup');
    if (tabParam === 'login') setTab('login');
  }, [tabParam]);

  const handleGoogleAuth = () => {
    const dest = tab === 'signup' ? '/onboarding' : nextPath;
    window.location.href = `/api/auth/google?next=${encodeURIComponent(dest)}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, remember_me: rememberMe }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || 'Invalid email or password.');
          return;
        }
        setUserDirect(data.user);
        toast('success', `Welcome back, ${data.user.profile.full_name}`);
        router.push(data.is_new_user ? '/onboarding' : nextPath);
      } else {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          return;
        }
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            full_name: fullName,
            email,
            password,
            city,
            consent_accepted: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || 'Could not create account.');
          return;
        }
        setUserDirect(data.user);
        toast('success', 'Account created!', 'Complete quick setup to open your dashboard.');
        router.push('/onboarding');
      }
    } catch {
      setError('Unable to reach authentication server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyCallback = () => {
    if (!callbackHint) return;
    navigator.clipboard?.writeText(callbackHint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayError = error || (urlError ? OAUTH_ERRORS[urlError] || 'Authentication error.' : null);

  const pillInputClass =
    'w-full rounded-full border border-white/35 bg-white/[0.06] px-5 py-3 text-sm text-white placeholder:text-white/80 backdrop-blur-sm transition focus:border-white/80 focus:bg-white/[0.12] focus:outline-none';

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#121B1D] px-4 py-14 text-white">
      {/* Full-Bleed Moody Alpine Snow-Peak, Pine Forest & Lake Backdrop */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/login-alpine-bg.jpg"
        alt="Snow-capped alpine mountains over dark pine forest and calm lake"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center"
      />
      {/* Subtle cool dark atmospheric tint so glass card pops effortlessly */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-[#0F1C1E]/25 to-black/35"
      />

      {/* Top-Left Brand Logo Link back to Landing Page */}
      <div className="absolute left-6 top-6 z-20 flex items-center gap-3">
        <Link href="/" aria-label="Back to VAYUVERSE AI Home" className="transition hover:opacity-90">
          <VayuLogo size="md" />
        </Link>
      </div>

      {/* Centered Frosted Glass Login / Register Card (exact reference design) */}
      <div
        className="relative z-10 w-full max-w-[400px] rounded-xl border border-white/40 px-8 py-9 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        style={{
          background:
            'linear-gradient(165deg, rgba(44, 62, 66, 0.56) 0%, rgba(30, 44, 48, 0.52) 55%, rgba(18, 28, 31, 0.64) 100%)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <h1 className="mb-7 text-center font-sans text-3xl font-bold tracking-tight text-white">
          {tab === 'login' ? 'login' : 'register'}
        </h1>

        {displayError && (
          <div className="mb-4 rounded-xl border border-white/30 bg-black/45 p-3 text-xs text-white/95">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="leading-relaxed">{displayError}</p>
                {urlError === 'oauth_not_configured' && callbackHint && (
                  <div className="rounded-lg border border-white/20 bg-black/40 p-2">
                    <p className="font-mono text-[9.5px] uppercase text-white/60">
                      Authorized Redirect URI:
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <code className="truncate font-mono text-[10px] text-sky-300">{callbackHint}</code>
                      <button
                        type="button"
                        onClick={copyCallback}
                        className="shrink-0 rounded bg-white/15 p-1 text-white hover:bg-white/25"
                        title="Copy Redirect URI"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="full name"
                aria-label="Full name"
                className={pillInputClass}
              />
            </div>
          )}

          <div>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tab === 'login' ? 'email' : 'email address'}
              aria-label="Email"
              className={pillInputClass}
            />
          </div>

          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              required
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'login' ? 'password' : 'password (min 8 chars)'}
              aria-label="Password"
              className={`${pillInputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? 'Hide password' : 'Show password'}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/65 transition hover:text-white"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {tab === 'signup' && (
            <div>
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                aria-label="Primary city"
                className={pillInputClass}
              >
                {SUPPORTED_CITY_NAMES.map((c) => (
                  <option key={c} value={c} className="bg-[#162124] text-white">
                    city: {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {tab === 'login' && (
            <div className="flex items-center justify-between px-1 pt-0.5 text-xs text-white/95">
              <label className="inline-flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-3.5 w-3.5 rounded-sm border-white/60 bg-white accent-white"
                />
                <span>remember me</span>
              </label>
              <Link href="/forgot-password" className="text-white/95 transition hover:underline">
                forget password
              </Link>
            </div>
          )}

          {/* Crisp Solid White Pill Primary Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-white py-3 text-sm font-bold text-black shadow-lg transition hover:bg-white/90 active:scale-[0.99] disabled:opacity-60"
          >
            {loading
              ? tab === 'login'
                ? 'logging in...'
                : 'creating account...'
              : tab === 'login'
                ? 'login'
                : 'register'}
          </button>
        </form>

        {/* Subtle Frosted Glass Google OAuth 2.0 + PKCE Pill */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/[0.08] py-2.5 text-xs font-medium text-white backdrop-blur-sm transition hover:border-white/60 hover:bg-white/[0.15]"
        >
          <GoogleGIcon />
          <span>{tab === 'signup' ? 'sign up with Google' : 'continue with Google'}</span>
        </button>
        {googleOAuthConfigured && (
          <p className="mt-1 text-center text-[10.5px] text-emerald-300">Google OAuth active</p>
        )}

        {/* Register / Login Toggle Row (exact reference wording & style) */}
        <p className="mt-5 text-center text-xs text-white/90">
          {tab === 'login' ? (
            <>
              Don&apos;t have an account{' '}
              <button
                type="button"
                onClick={() => {
                  setTab('signup');
                  setError(null);
                }}
                className="font-bold text-white hover:underline"
              >
                register
              </button>
            </>
          ) : (
            <>
              Already have an account{' '}
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                }}
                className="font-bold text-white hover:underline"
              >
                login
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
