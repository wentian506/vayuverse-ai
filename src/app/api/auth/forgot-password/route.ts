import { NextRequest, NextResponse } from 'next/server';
import { getFastApiBase } from '@/lib/auth-server';

export async function POST(req: NextRequest) {
  const backend = getFastApiBase();
  if (!backend) {
    return NextResponse.json(
      { detail: 'Password reset requires Phase-2 FastAPI backend. Google Sign-In accounts manage passwords via Google.' },
      { status: 503 }
    );
  }
  const body = await req.json();
  const upstream = await fetch(`${backend}/api/v1/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
