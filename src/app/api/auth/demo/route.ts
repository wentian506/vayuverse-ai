import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  getFastApiBase,
  isDemoModeEnabled,
  resolveAppOrigin,
  setSessionCookie,
  signServerlessToken,
} from '@/lib/auth-server';
import { buildServerlessUserFromClaims, SERVERLESS_CITIES } from '@/lib/serverless-fallback';

const DEMO_MAX_AGE_SEC = 60 * 60 * 24; // 24 hours

function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '/dashboard';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/dashboard')) return '/dashboard';
  // Never route a demo user to the RBAC-protected admin console
  if (trimmed.startsWith('/dashboard/admin')) return '/dashboard';
  return trimmed;
}

async function createDemoSession(cityInput: string, langInput: string) {
  const backend = getFastApiBase();
  const safeLang = ['en', 'hi', 'pa'].includes(langInput) ? langInput : 'en';

  if (backend) {
    try {
      const upstream = await fetch(`${backend}/api/v1/auth/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: cityInput || 'Ludhiana', language: safeLang }),
        cache: 'no-store',
      });
      if (upstream.ok) {
        const data = await upstream.json();
        return {
          token: String(data.token),
          user: data.user,
          mode: 'phase2_fullstack' as const,
        };
      }
      if (upstream.status === 403) {
        const err = await upstream.json().catch(() => ({}));
        throw new Error(err.detail || 'Interactive Demo Mode is disabled.');
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('disabled')) throw e;
      // Fall through to serverless demo session if backend unreachable (e.g. Netlify Stage 1)
    }
  }

  // Netlify Phase-1 / Serverless fallback demo session (strictly non-admin)
  const meta = SERVERLESS_CITIES[cityInput] || SERVERLESS_CITIES.Ludhiana;
  const tag = crypto.randomBytes(4).toString('hex');
  const claims = {
    sub: `demo-${tag}`,
    email: `guest-${tag}@demo.vayuverse.app`,
    name: 'Demo Explorer',
    provider: 'demo',
    is_demo: true,
    role: 'individual',
    city: meta.city,
    state: meta.state,
    lang: safeLang,
    onboarding_completed: true,
    serverless_mode: true,
    created_at: new Date().toISOString(),
  };
  const token = await signServerlessToken(claims, '24h');
  return {
    token,
    user: buildServerlessUserFromClaims(claims),
    mode: 'phase1_netlify_oauth' as const,
  };
}

export async function POST(req: NextRequest) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      { detail: 'Interactive Demo Mode is disabled on this deployment.' },
      { status: 403 }
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const nextPath = sanitizeNextPath(body?.next);
    const { token, user, mode } = await createDemoSession(
      String(body?.city || 'Ludhiana'),
      String(body?.language || 'en')
    );
    const res = NextResponse.json({
      is_demo: true,
      is_new_user: false,
      deployment_phase: mode,
      redirect_to: nextPath,
      user,
    });
    setSessionCookie(res, req, token, DEMO_MAX_AGE_SEC);
    return res;
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : 'Unable to start Demo Mode.' },
      { status: 403 }
    );
  }
}

export async function GET(req: NextRequest) {
  const origin = resolveAppOrigin(req);
  if (!isDemoModeEnabled()) {
    return NextResponse.redirect(new URL('/login?error=demo_disabled', origin), 303);
  }
  try {
    const city = req.nextUrl.searchParams.get('city') || 'Ludhiana';
    const lang = req.nextUrl.searchParams.get('lang') || 'en';
    const nextPath = sanitizeNextPath(req.nextUrl.searchParams.get('next'));
    const { token } = await createDemoSession(city, lang);
    const res = NextResponse.redirect(new URL(nextPath, origin), 303);
    setSessionCookie(res, req, token, DEMO_MAX_AGE_SEC);
    return res;
  } catch {
    return NextResponse.redirect(new URL('/login?error=demo_disabled', origin), 303);
  }
}
