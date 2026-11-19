import { NextRequest, NextResponse } from 'next/server';
import { getFastApiBase, setSessionCookie } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const backend = getFastApiBase();
  if (!backend) {
    return NextResponse.json(
      {
        detail:
          'Netlify Phase-1 Mode active: Use "Continue with Google" for instant sign-in, or connect FASTAPI_BACKEND_URL in Phase 2 to enable email/password account storage.',
      },
      { status: 503 }
    );
  }
  try {
    const body = await req.json();
    const upstream = await fetch(`${backend}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return NextResponse.json({ detail: data.detail || 'Registration failed.' }, { status: upstream.status });
    }
    const res = NextResponse.json({ user: data.user, is_new_user: true });
    setSessionCookie(res, req, data.token);
    return res;
  } catch {
    return NextResponse.json(
      { detail: 'Registration service temporarily unreachable. Check backend status.' },
      { status: 502 }
    );
  }
}
