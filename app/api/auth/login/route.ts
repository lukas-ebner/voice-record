import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, setSessionCookie } from '../../../../lib/auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const expected = process.env.AUTH_PASSWORD;

  if (!expected) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (password.length === 0 || password !== expected) {
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: 'Falsches Passwort' }, { status: 401 });
  }

  const token = await createSessionToken();
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const isHttps = proto === 'https';
  await setSessionCookie(token, isHttps);
  return NextResponse.json({ ok: true });
}
