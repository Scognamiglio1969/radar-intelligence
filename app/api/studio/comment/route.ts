import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { callClaude, MODELS } from '@/lib/claude';
import {
  chartComment, fingerprint, runStudio, saveChartComment, studioFacts,
  type StudioSpec,
} from '@/lib/studio';
import { AI_DISCLOSURE_SHORT } from '@/lib/ai-disclosure';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM = `Sei un analista di media intelligence. Ricevi le CIFRE già calcolate di UN grafico.
Scrivi un commento di 2-4 frasi:
- parti da ciò che il grafico mostra davvero, citando i numeri che ti sono stati dati;
- di' che cosa significa per chi legge, non limitarti a ripetere la classifica;
- segnala l'anomalia o il dato controintuitivo, se c'è.
Regole ferree:
- NON inventare cifre, nomi o cause che non sono nei dati ricevuti;
- niente elenchi puntati, niente markdown: prosa continua;
- rispondi SOLO con il testo del commento, senza preamboli.`;

/** Il commento salvato, se i dati sono ancora quelli che descriveva. */
export async function GET(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Solo gli amministratori' }, { status: 403 });
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'Nessun progetto' }, { status: 400 });

  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));
  const now = url.searchParams.get('for') ?? '';
  if (!id || !now) return NextResponse.json({ comment: null });

  return NextResponse.json({ comment: await chartComment(id, project.id, now) });
}

/** Scrive il commento su un grafico salvato. */
export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Solo gli amministratori' }, { status: 403 });
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'Nessun progetto' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const spec = body.spec as StudioSpec | undefined;
  if (!id) return NextResponse.json({ error: 'Salva prima il grafico: il commento vive attaccato a lui.' }, { status: 400 });
  if (!spec?.x || !spec?.y) return NextResponse.json({ error: 'Grafico incompleto' }, { status: 400 });

  try {
    // Il modello non vede mai le righe: riceve le cifre già calcolate dal
    // database, come ovunque nel report. E il commento si lega ESATTAMENTE a
    // quelle: l'impronta si prende adesso, non prima.
    const result = await runStudio(project.id, spec);
    if (!result.rows.length) {
      return NextResponse.json({ error: 'Questo grafico non ha dati da commentare nel periodo scelto.' }, { status: 400 });
    }
    const facts = studioFacts({
      title: String(body.title ?? '').trim() || `${result.yLabel} per ${result.xLabel}`,
      xLabel: result.xLabel, yLabel: result.yLabel, zLabel: result.zLabel,
      days: spec.days, palette: [], rows: result.rows,
    });

    const user = `Progetto: ${project.name}\nTema seguito: ${(project.keywords ?? []).join(', ')}\n\n${facts}`;
    const text = await callClaude(MODELS.sonnet, 'studio-comment', SYSTEM, user, 500, true);
    if (text === null) {
      return NextResponse.json({
        error: 'Motore AI non disponibile: manca la chiave o il tetto di spesa è stato raggiunto.',
      }, { status: 503 });
    }
    const clean = text.trim();
    if (!clean) return NextResponse.json({ error: 'Il modello non ha scritto niente. Riprova.' }, { status: 502 });

    const at = await saveChartComment(id, project.id, clean, fingerprint(spec, result));
    return NextResponse.json({ comment: { text: clean, at, stale: false }, disclosure: AI_DISCLOSURE_SHORT });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Toglie il commento a mano. */
export async function DELETE(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Solo gli amministratori' }, { status: 403 });
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'Nessun progetto' }, { status: 400 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Grafico mancante' }, { status: 400 });
  await saveChartComment(id, project.id, '', '');
  return NextResponse.json({ ok: true });
}
