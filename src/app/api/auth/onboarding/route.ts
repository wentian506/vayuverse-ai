import { NextRequest, NextResponse } from 'next/server';
import {
  getFastApiBase,
  getRequestSessionToken,
  setSessionCookie,
  signServerlessToken,
  verifyToken,
} from '@/lib/auth-server';
import { SERVERLESS_CITIES, buildServerlessUserFromClaims } from '@/lib/serverless-fallback';

export async function POST(req: NextRequest) {
  const token = getRequestSessionToken(req);
  if (!token) {
    return NextResponse.json({ detail: 'Authentication required.' }, { status: 401 });
  }
  const body = await req.json();
  const claims = await verifyToken(token);
  const backend = getFastApiBase();

  if (backend && claims && !claims.serverless_mode) {
    const upstream = await fetch(`${backend}/api/v1/auth/onboarding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return NextResponse.json({ detail: data.detail || 'Could not save onboarding.' }, { status: upstream.status });
    }
    const res = NextResponse.json({ user: data.user });
    if (data.token) setSessionCookie(res, req, data.token);
    return res;
  }

  // Netlify Phase-1 Google Session onboarding persistence via signed HttpOnly cookie
  if (!claims) {
    return NextResponse.json({ detail: 'Invalid session.' }, { status: 401 });
  }
  const cityMeta = SERVERLESS_CITIES[body.city] || SERVERLESS_CITIES.Ludhiana;
  const updatedClaims = {
    ...claims,
    name: String(body.full_name || claims.name || 'Member'),
    picture: body.avatar_url ?? claims.picture ?? '',
    city: cityMeta.city,
    state: cityMeta.state,
    lang: String(body.preferred_language || 'en'),
    role: String(body.role || 'individual'),
    aqi_threshold: Number(body.aqi_alert_threshold || 150),
    onboarding_completed: true,
    serverless_mode: true,
  };
  const nextJwt = await signServerlessToken(updatedClaims);
  const res = NextResponse.json({ user: buildServerlessUserFromClaims(updatedClaims) });
  setSessionCookie(res, req, nextJwt);
  return res;
}
