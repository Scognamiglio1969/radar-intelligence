import { NextResponse } from 'next/server';
import { setContentLocale, getContentLocale } from '@/lib/content-locale';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Lingua in cui l'AI SCRIVE (brief, Point of View, risposte, narrazioni…).
 * Indipendente dalla lingua dell'interfaccia: leggere l'app in italiano e far
 * scrivere all'AI in inglese è una combinazione legittima e frequente.
 * È un'impostazione dell'app, non del singolo utente, perché anche il ciclo
 * notturno deve sapere in che lingua generare.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  await setContentLocale(locale === 'it' ? 'it' : 'en');
  return NextResponse.json({ contentLocale: await getContentLocale() });
}
