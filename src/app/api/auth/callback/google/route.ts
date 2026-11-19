import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_STATE_COOKIE,
  getFastApiBase,
  getInternalSecret,
  isGoogleOAuthConfigured,
  resolveAppOrigin,
  setSessionCookie,
  signServerlessToken,
  verifyToken,
} from '@/lib/auth-server';

function timingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * GET /api/auth/callback/google
 * Handles Google OAuth 2.0 redirect callback:
 * 1. Validates CSRF `state` and extracts PKCE `code_verifier` from signed HttpOnly cookie.
 * 2. Exchanges authorization `code` with Google's token endpoint server-side.
 * 3. Fetches verified user identity from Google OpenID Connect userinfo endpoint.
 * 4. Syncs user with FastAPI + database (Phase 2) OR issues verified signed JWT session (Phase 1 Netlify).
 * 5. Redirects new users to /onboarding and returning users to /dashboard.
 */
export async function GET(req: NextRequest) {
  const origin = resolveAppOrigin(req);
  const fail = (code: string) => {
    const u = new URL('/login', origin);
    u.searchParams.set('error', code);
    const r = NextResponse.redirect(u);
    r.cookies.set(OAUTH_STATE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return r;
  };

  const oauthErr = req.nextUrl.searchParams.get('error');
  if (oauthErr) {
    return fail(oauthErr === 'access_denied' ? 'google_access_denied' : 'google_oauth_error');
  }

  if (!isGoogleOAuthConfigured()) {
    return fail('oauth_not_configured');
  }

  const code = req.nextUrl.searchParams.get('code');
  const returnedState = req.nextUrl.searchParams.get('state');
  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !returnedState || !stateCookie) {
    return fail('invalid_oauth_state');
  }

  const saved = await verifyToken(stateCookie);
  if (
    !saved ||
    typeof saved.state !== 'string' ||
    typeof saved.codeVerifier !== 'string' ||
    !timingSafeEq(returnedState, saved.state)
  ) {
    return fail('invalid_oauth_state');
  }

  const redirectUri = String(saved.redirectUri || `${origin}/api/auth/callback/google`);
  const nextPath = String(saved.next || '/dashboard');

  try {
    // 1. Server-side authorization code + PKCE exchange with Google
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: saved.codeVerifier,
      }),
      cache: 'no-store',
    });

    if (!tokenRes.ok) {
      return fail('google_token_exchange_failed');
    }
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token as string | undefined;
    if (!accessToken) {
      return fail('google_token_exchange_failed');
    }

    // 2. Retrieve verified OpenID profile from Google
    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!userRes.ok) {
      return fail('google_userinfo_failed');
    }
    const gUser = await userRes.json();
    if (!gUser.sub || !gUser.email || gUser.email_verified === false) {
      return fail('google_email_unverified');
    }

    // 3. Phase 2: Sync to FastAPI + database if configured; otherwise Phase 1 Netlify verified session
    const backend = getFastApiBase();
    let sessionJwt = '';
    let isNewUser = true;

    if (backend) {
      try {
        const syncRes = await fetch(`${backend}/api/v1/auth/google-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': getInternalSecret(),
          },
          body: JSON.stringify({
            google_sub: String(gUser.sub),
            email: String(gUser.email),
            full_name: String(gUser.name || gUser.email.split('@')[0]),
            avatar_url: gUser.picture ? String(gUser.picture) : null,
            email_verified: Boolean(gUser.email_verified),
          }),
          cache: 'no-store',
        });
        if (syncRes.ok) {
          const synced = await syncRes.json();
          sessionJwt = synced.token;
          isNewUser = Boolean(synced.is_new_user);
        }
      } catch {
        // Graceful fallback to Phase-1 Netlify serverless verified Google session
      }
    }

    if (!sessionJwt) {
      sessionJwt = await signServerlessToken({
        sub: `google:${gUser.sub}`,
        email: String(gUser.email),
        name: String(gUser.name || gUser.email.split('@')[0]),
        picture: gUser.picture ? String(gUser.picture) : '',
        provider: 'google',
        role: 'individual',
        city: 'Ludhiana',
        state: 'Punjab',
        lang: 'en',
        onboarding_completed: false,
        created_at: new Date().toISOString(),
        serverless_mode: true,
      });
      isNewUser = true;
    }

    const destination = isNewUser ? '/onboarding' : nextPath;
    const res = NextResponse.redirect(new URL(destination, origin));
    res.cookies.set(OAUTH_STATE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    setSessionCookie(res, req, sessionJwt);
    return res;
  } catch {
    return fail('google_callback_exception');
  }
}
