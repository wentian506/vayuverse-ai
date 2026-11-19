'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { VayuLogo } from '@/components/ui/VayuUI';
import { useApp } from '@/components/providers/AppProvider';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useApp();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not process request.');
      setMessage(data.message);
      if (data.sandbox_reset_code) {
        setSandboxCode(data.sandbox_reset_code);
        setToken(data.sandbox_reset_code);
      }
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  const resetPwd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reset failed.');
      toast('success', 'Password updated', 'Please sign in with your new password.');
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#121B1D] px-4 py-12 text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/login-alpine-bg.jpg"
        alt="Alpine mountain background"
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-[#0F1C1E]/25 to-black/40"
      />
      <div className="absolute left-6 top-6 z-20">
        <Link href="/" className="inline-block"><VayuLogo size="md" /></Link>
      </div>
      <div className="relative z-10 w-full max-w-[400px]">
        <div
          className="rounded-xl border border-white/40 px-8 py-9 space-y-4 shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
          style={{
            background:
              'linear-gradient(165deg, rgba(44, 62, 66, 0.56) 0%, rgba(30, 44, 48, 0.52) 55%, rgba(18, 28, 31, 0.64) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
          }}
        >
          <div className="pb-1 text-center">
            <h1 className="font-sans text-2xl font-bold tracking-tight text-white">reset password</h1>
            <p className="mt-1 text-xs text-white/75">
              Secure time-limited recovery for email accounts.
            </p>
          </div>
          {error && (
            <div className="rounded-xl border border-red-400/35 bg-red-950/30 p-3 text-xs text-red-200">{error}</div>
          )}
          {message && (
            <div className="rounded-xl border border-vayu-teal/35 bg-vayu-teal/10 p-3 text-xs text-slate-200">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-vayu-teal" />
                <div>
                  <p>{message}</p>
                  {sandboxCode && (
                    <p className="mt-1.5 font-mono text-[11px] text-vayu-cyan">
                      Sandbox verification code (SMTP not configured): <strong>{sandboxCode}</strong>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'request' ? (
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <label htmlFor="fp-email" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Account email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="fp-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="vayu-input pl-10"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="vayu-btn-primary w-full py-2.5">
                {loading ? 'Sending...' : 'Generate Reset Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={resetPwd} className="space-y-4">
              <div>
                <label htmlFor="fp-code" className="mb-1.5 block text-xs font-medium text-slate-300">
                  Verification code
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="fp-code"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter 12-character code"
                    className="vayu-input pl-10 font-mono"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="fp-new" className="mb-1.5 block text-xs font-medium text-slate-300">
                  New password (min. 8 characters)
                </label>
                <input
                  id="fp-new"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="vayu-input"
                />
              </div>
              <button type="submit" disabled={loading} className="vayu-btn-primary w-full py-2.5">
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          <div className="pt-2 text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-vayu-cyan">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
