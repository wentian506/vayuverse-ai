import { NextRequest, NextResponse } from 'next/server';
import { getFastApiBase, setSessionCookie } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const backend = getFastApiBase();
  if (!backend) {
    return NextResponse.json(
      {
        detail:
          'Netlify Phase-1 Mode active: Please click "Continue with Google" to sign in, or configure FASTAPI_BACKEND_URL in Netlify Environment Variables to enable email/password database accounts.',
      },
      { status: 503 }
    );
  }
  try {
    const body = await req.json();
    const upstream = await fetch(`${backend}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return NextResponse.json({ detail: data.detail || 'Authentication failed.' }, { status: upstream.status });
    }
    const res = NextResponse.json({ user: data.user, is_new_user: data.is_new_user });
    setSessionCookie(res, req, data.token);
    return res;
  } catch {
    return NextResponse.json(
      { detail: 'Authentication service is temporarily unreachable. Please verify FASTAPI_BACKEND_URL.' },
      { status: 502 }
    );
  }
}
