import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookies,
  getFastApiBase,
  getRequestSessionToken,
  verifyToken,
} from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  // If ending an ephemeral guest Demo Mode session, automatically remove its sandbox workspace
  const token = getRequestSessionToken(req);
  const backend = getFastApiBase();
  if (token && backend) {
    const claims = await verifyToken(token);
    if (claims && (claims.is_demo || claims.provider === 'demo') && !claims.serverless_mode) {
      try {
        await fetch(`${backend}/api/v1/profile/account`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Stale demo sessions also auto-expire after 24h
      }
    }
  }

  const res = NextResponse.json({ status: 'logged_out' });
  clearSessionCookies(res, req);
  return res;
}
