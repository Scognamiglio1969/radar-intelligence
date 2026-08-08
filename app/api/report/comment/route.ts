import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { collectExportData } from '@/lib/export-data';
import { ALL_SECTION_IDS, type SectionId } from '@/lib/export-sections';
import { generateComments, type CommentRequest } from '@/lib/custom-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Una raccolta dati completa più una chiamata al modello.
export const maxDuration = 120;

/**
 * Commenti AI per le sezioni scelte. Accetta una LISTA: commentare dieci
 * grafici costa una raccolta dati e una chiamata al modello, non dieci.
 */
export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) {
    return NextResponse.json({ error: 'Solo gli amministratori possono generare commenti' }, { status: 403 });
  }
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'Nessun progetto selezionato' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const days = Math.min(90, Math.max(1, Number(body.days) || 30));
  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .filter((s: unknown): s is SectionId => ALL_SECTION_IDS.includes(s as SectionId));
  if (!sections.length) return NextResponse.json({ error: 'Nessun grafico selezionato' }, { status: 400 });

  const role: CommentRequest = ['intro', 'comment', 'both', 'synthesis'].includes(body.role)
    ? body.role : 'comment';

  try {
    const data = await collectExportData(project, days);
    const { comments, synthesis, empty, available, noFacts } = await generateComments(data, sections, role);
    if (!available) {
      // `empty` viaggia anche qui: sapere QUALI grafici sono senza dati resta
      // un'informazione utile pure quando il motore AI è spento.
      return NextResponse.json({
        error: 'Motore AI non disponibile: manca la chiave o il tetto di spesa è stato raggiunto. Puoi comunque scrivere il commento a mano.',
        empty,
      }, { status: 503 });
    }
    if (noFacts) {
      return NextResponse.json({
        error: 'I grafici scelti non hanno dati da descrivere nel periodo impostato: aggiungi un grafico con dei numeri, o allarga il periodo del report.',
        empty,
      }, { status: 400 });
    }
    return NextResponse.json({ comments, synthesis, empty });
  } catch (e) {
    console.error('[report] generazione commenti fallita:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
