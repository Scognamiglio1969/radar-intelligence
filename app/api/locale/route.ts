import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Lingua dell'INTERFACCIA (cookie per utente). Volutamente separata dalla lingua
 * dei CONTENUTI generati dall'AI (/api/content-locale): si può leggere l'app in
 * italiano e far scrivere all'AI in inglese, o viceversa.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  const value = locale === 'it' ? 'it' : 'en';

  const res = NextResponse.json({ locale: value });
  res.cookies.set('sr_locale', value, {
    path: '/', maxAge: 31536000, sameSite: 'lax',
  });
  return res;
}
