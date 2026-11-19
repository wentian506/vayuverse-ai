import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'vayu_session';
export const OAUTH_STATE_COOKIE = 'vayu_oauth_state';
export const PROFILE_COOKIE = 'vayu_p1_profile';

export function getAuthSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET || 'vayuverse-local-dev-secret-key-2026-32b';
  return new TextEncoder().encode(raw);
}

export function getInternalSecret(): string {
  return process.env.INTERNAL_API_SECRET || 'vayuverse-internal-sync-2026';
}

export function getFastApiBase(): string | null {
  const explicit = process.env.FASTAPI_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL;
  if (explicit !== undefined) {
    const trimmed = explicit.trim().replace(/\/+$/, '');
    return trimmed.length > 0 ? trimmed : null;
  }
  // On Vercel or Netlify before FASTAPI_BACKEND_URL is configured, use built-in serverless live engine
  if (process.env.VERCEL === '1' || process.env.NETLIFY === 'true') {
    return null;
  }
  return 'http://127.0.0.1:8000';
}

export function isGoogleOAuthConfigured(): boolean {
  const id = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  return id.length > 10 && secret.length > 6;
}

export function isDemoModeEnabled(): boolean {
  const flag = (process.env.ENABLE_DEMO_MODE || 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(flag);
}

export function resolveAppOrigin(req: NextRequest): string {
  const explicit = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');
  if (explicit && !explicit.includes('localhost')) {
    return explicit;
  }
  const fwdHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const fwdProto =
    req.headers.get('x-forwarded-proto') ||
    (fwdHost?.includes('localhost') || fwdHost?.startsWith('127.0.0.1') ? 'http' : 'https');
  if (fwdHost) {
    return `${fwdProto}://${fwdHost}`;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, '')}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  }
  if (process.env.URL) {
    return process.env.URL.replace(/\/+$/, '');
  }
  return explicit || 'http://localhost:3000';
}

export function setSessionCookie(res: NextResponse, req: NextRequest, token: string, maxAgeSec = 60 * 60 * 24 * 14) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || (req.nextUrl.protocol === 'https:' ? 'https' : 'http');
  const isHttps = proto === 'https';
  const isEmbeddedPreview = isHttps && host.endsWith('.e2b.app');

  if (isEmbeddedPreview) {
    // Use CHIPS Partitioned HttpOnly Secure cookie so embedded HTTPS preview iframes preserve sessions
    res.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSec,
    });
  }
}

export function clearSessionCookies(res: NextResponse, req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  const proto = req.headers.get('x-forwarded-proto') || (req.nextUrl.protocol === 'https:' ? 'https' : 'http');
  const isEmbeddedPreview = proto === 'https' && host.endsWith('.e2b.app');

  if (isEmbeddedPreview) {
    res.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
    );
    res.headers.append(
      'Set-Cookie',
      `${PROFILE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
    );
  } else {
    res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    res.cookies.set(PROFILE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  }
}

export async function signServerlessToken(payload: Record<string, unknown>, expiresIn = '14d'): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getAuthSecret());
}

export async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ['HS256'] });
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getRequestSessionToken(req?: NextRequest): string | null {
  if (req) {
    const fromCookie = req.cookies.get(SESSION_COOKIE)?.value;
    if (fromCookie) return fromCookie;
    const auth = req.headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
    return null;
  }
  return cookies().get(SESSION_COOKIE)?.value || null;
}
