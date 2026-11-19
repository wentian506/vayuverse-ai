import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_STATE_COOKIE,
  isGoogleOAuthConfigured,
  resolveAppOrigin,
  signServerlessToken,
} from '@/lib/auth-server';

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * GET /api/auth/google
 * Initiates a genuine Google OAuth 2.0 Authorization Code + PKCE (S256) flow.
 * Never fakes authentication: if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset,
 * redirects back to /login with an explicit configuration diagnostic code.
 */
export async function GET(req: NextRequest) {
  const origin = resolveAppOrigin(req);
  const nextPath = req.nextUrl.searchParams.get('next') || '/dashboard';
  const safeNext = nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/dashboard';

  if (!isGoogleOAuthConfigured()) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'oauth_not_configured');
    url.searchParams.set('callback', `${origin}/api/auth/callback/google`);
    return NextResponse.redirect(url);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const state = base64Url(crypto.randomBytes(32));
  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  const redirectUri = `${origin}/api/auth/callback/google`;

  const stateJwt = await signServerlessToken(
    { state, codeVerifier, redirectUri, next: safeNext },
    '10m'
  );

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', clientId);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('code_challenge', codeChallenge);
  googleAuthUrl.searchParams.set('code_challenge_method', 'S256');
  googleAuthUrl.searchParams.set('prompt', 'select_account');
  googleAuthUrl.searchParams.set('access_type', 'online');

  const res = NextResponse.redirect(googleAuthUrl.toString());
  const isHttps = origin.startsWith('https://');
  res.cookies.set(OAUTH_STATE_COOKIE, stateJwt, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
