import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookies,
  getFastApiBase,
  getRequestSessionToken,
  isDemoModeEnabled,
  isGoogleOAuthConfigured,
  resolveAppOrigin,
  verifyToken,
} from '@/lib/auth-server';
import { buildServerlessUserFromClaims } from '@/lib/serverless-fallback';

export async function GET(req: NextRequest) {
  const origin = resolveAppOrigin(req);
  const googleConfigured = isGoogleOAuthConfigured();
  const backend = getFastApiBase();
  const token = getRequestSessionToken(req);

  const meta = {
    google_oauth_configured: googleConfigured,
    google_callback_url: `${origin}/api/auth/callback/google`,
    demo_mode_enabled: isDemoModeEnabled(),
    deployment_phase: backend ? 'phase2_fullstack' : 'phase1_netlify_oauth',
  };

  if (!token) {
    return NextResponse.json({ authenticated: false, user: null, ...meta });
  }

  const claims = await verifyToken(token);
  if (!claims) {
    const res = NextResponse.json({ authenticated: false, user: null, ...meta });
    clearSessionCookies(res, req);
    return res;
  }

  if (backend && !claims.serverless_mode) {
    try {
      const upstream = await fetch(`${backend}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (upstream.ok) {
        const data = await upstream.json();
        return NextResponse.json({ authenticated: true, user: data.user, ...meta });
      }
      if (upstream.status === 401) {
        const res = NextResponse.json({ authenticated: false, user: null, ...meta });
        clearSessionCookies(res, req);
        return res;
      }
    } catch {
      // Fall through to claims representation if backend momentarily restarting
    }
  }

  return NextResponse.json({
    authenticated: true,
    user: buildServerlessUserFromClaims(claims),
    ...meta,
  });
}
