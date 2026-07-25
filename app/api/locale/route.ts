import { NextResponse } from 'next/server';
import { setContentLocale } from '@/lib/content-locale';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * La bandierina cambia due cose:
 *  - il cookie sr_locale → lingua dell'INTERFACCIA (per utente);
 *  - l'impostazione content_locale → lingua dei CONTENUTI generati dall'AI
 *    (a livello di app, perché anche il cron notturno deve saperla).
 * I dati raccolti non vengono mai toccati.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  const value = locale === 'it' ? 'it' : 'en';

  await setContentLocale(value);

  const res = NextResponse.json({ locale: value });
  res.cookies.set('sr_locale', value, {
    path: '/', maxAge: 31536000, sameSite: 'lax',
  });
  return res;
}
