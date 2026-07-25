import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { translatePointOfView } from '@/lib/pov';
import type { ContentLocale } from '@/lib/content-locale';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Traduce la tesi già generata: è l'azione delle bandierine "AI writes in" sulla
 * pagina Point of View — veloce, non rilegge i dati. Per rifare l'analisi da capo
 * si usa "Rebuild the argument" (POST /api/pov).
 */
export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const locale: ContentLocale = body?.locale === 'it' ? 'it' : 'en';

  const { pov, reason } = await translatePointOfView(project.id, 90, locale);
  if (!pov) {
    const msg = reason === 'not_built' ? 'no point of view to translate yet — build it first'
      : reason === 'no_ai' ? 'AI key missing or spend cap reached'
        : 'translation took too long or failed — try again';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ pov });
}
