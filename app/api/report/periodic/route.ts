import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import {
  buildPeriodicReport, deleteEdition, isCadence, listEditions, saveEdition,
} from '@/lib/periodic-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Dal mensile in su viene generata una tesi nuova: è la chiamata più pesante
// che fa Radar, e va tenuta sotto il limite della piattaforma.
export const maxDuration = 300;

async function ctx() {
  if (!isAdmin(await getCurrentUser())) return { error: 'Solo gli amministratori possono generare report' as const };
  const project = await getCurrentProject();
  if (!project) return { error: 'Nessun progetto selezionato' as const };
  return { project };
}

export async function GET() {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  return NextResponse.json({ editions: await listEditions(c.project.id) });
}

/** Genera un'edizione e la archivia. */
export async function POST(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!isCadence(body.cadence)) return NextResponse.json({ error: 'Cadenza non valida' }, { status: 400 });

  try {
    const built = await buildPeriodicReport(c.project, body.cadence);
    const id = await saveEdition(c.project.id, body.cadence, built);
    return NextResponse.json({ id, provenance: built.provenance, pages: built.pages.length });
  } catch (e) {
    console.error('[periodic] generazione fallita:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Edizione mancante' }, { status: 400 });
  await deleteEdition(id, c.project.id);
  return NextResponse.json({ ok: true });
}
