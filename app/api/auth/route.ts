import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { verifyPasswordHash } from '@/lib/password';
import { SESSION_COOKIE, signSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json() as { email?: string; password?: string; logout?: boolean };

  // Logout: cancella il cookie di sessione
  if (body.logout) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  // Piccola attesa fissa: rallenta il brute force
  await new Promise((r) => setTimeout(r, 400));

  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) {
    return NextResponse.json({ error: 'missing credentials' }, { status: 400 });
  }

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !verifyPasswordHash(password, user.passwordHash)) {
    return NextResponse.json({ error: 'incorrect email or password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword === 1 });
  res.cookies.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 86400,
    path: '/',
  });
  return res;
}
