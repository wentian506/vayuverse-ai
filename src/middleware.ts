import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'vayu_session';

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || 'vayuverse-local-dev-secret-key-2026-32b'
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    // Enforce admin-only access on /dashboard/admin at the edge as well as in the API
    if (pathname.startsWith('/dashboard/admin')) {
      const role = String(payload.role || 'individual');
      if (!['community_moderator', 'civic_team', 'campus_admin'].includes(role)) {
        return NextResponse.redirect(new URL('/dashboard?notice=admin_restricted', req.url));
      }
    }
    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error', 'session_expired');
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding'],
};
