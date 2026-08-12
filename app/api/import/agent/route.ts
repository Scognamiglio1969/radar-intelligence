import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { applyAction, buildDossier, readFile, type AgentAction } from '@/lib/import-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Leggere le distribuzioni di quaranta fogli e farci ragionare sopra il modello
// è lavoro di decine di secondi, non di millisecondi.
export const maxDuration = 300;

async function guard(projectId: number) {
  if (!isAdmin(await getCurrentUser())) return 'Solo gli amministratori';
  if (!projectId) return 'Progetto mancante';
  const db = await getDb();
  const [p] = await db.select({ id: projects.id, mode: projects.mode }).from(projects).where(eq(projects.id, projectId));
  if (!p) return 'Progetto non trovato';
  if (p.mode !== 'upload') return 'Questo progetto non è di tipo import';
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const projectId = Number(body.projectId);
  const err = await guard(projectId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Eseguire una risposta è un'altra cosa dal leggere: stessa via, azioni diverse.
  if (body.action) {
    try {
      return NextResponse.json(await applyAction(projectId, body.action as AgentAction));
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  try {
    const dossier = await buildDossier(projectId, true);
    if (!dossier.sheets.length) {
      return NextResponse.json({ error: 'Non c’è ancora nessun foglio da leggere.' }, { status: 400 });
    }
    // Quello che si è CALCOLATO viaggia comunque, anche se il modello non
    // risponde: le relazioni fra le tabelle sono aritmetica, non un parere, e
    // sono la parte che salva un'analisi. Perderle perché una chiave è scaduta
    // sarebbe assurdo.
    const found = { groups: dossier.groups, relations: dossier.relations };

    const out = await readFile(dossier);
    if ('failure' in out) {
      // Il motivo VERO, non un elenco di possibilità: chi ha la chiave e il
      // budget non deve andare a controllare la chiave e il budget.
      return NextResponse.json(
        { error: out.failure.message, why: out.failure.why, ...found },
        { status: out.failure.why === 'call-failed' ? 502 : 503 },
      );
    }
    return NextResponse.json({ reading: out.reading, ...found });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
