import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { studioCharts } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { runStudio, studioFields, type StudioSpec, type StudioSource } from '@/lib/studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function ctx() {
  if (!isAdmin(await getCurrentUser())) return { error: 'Solo gli amministratori' as const };
  const project = await getCurrentProject();
  if (!project) return { error: 'Nessun progetto selezionato' as const };
  return { project };
}

/** I campi disponibili e i grafici già salvati. */
export async function GET(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const source = (new URL(req.url).searchParams.get('source') ?? 'mentions') as StudioSource;
  const db = await getDb();
  const [fields, saved] = await Promise.all([
    studioFields(c.project.id, source === 'metrics' ? 'metrics' : 'mentions'),
    db.select().from(studioCharts)
      .where(eq(studioCharts.projectId, c.project.id))
      .orderBy(desc(studioCharts.updatedAt)),
  ]);
  return NextResponse.json({ fields, saved });
}

/** Esegue una specifica e restituisce i dati del grafico. */
export async function POST(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const spec = (await req.json().catch(() => null)) as StudioSpec | null;
  if (!spec?.x || !spec?.y) {
    return NextResponse.json({ error: 'Scegli almeno un campo per l’asse X e uno per l’asse Y' }, { status: 400 });
  }
  try {
    return NextResponse.json(await runStudio(c.project.id, spec));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Salva o aggiorna un grafico: si conserva la domanda, mai i numeri. */
export async function PUT(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '').trim() || 'Grafico senza titolo';
  const db = await getDb();

  if (body.id) {
    await db.update(studioCharts)
      .set({ title, spec: body.spec, updatedAt: new Date() })
      .where(and(eq(studioCharts.id, Number(body.id)), eq(studioCharts.projectId, c.project.id)));
    return NextResponse.json({ id: Number(body.id) });
  }
  const [row] = await db.insert(studioCharts)
    .values({ projectId: c.project.id, title, spec: body.spec })
    .returning({ id: studioCharts.id });
  return NextResponse.json({ id: row.id });
}

export async function DELETE(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Grafico mancante' }, { status: 400 });
  const db = await getDb();
  await db.delete(studioCharts)
    .where(and(eq(studioCharts.id, id), eq(studioCharts.projectId, c.project.id)));
  return NextResponse.json({ ok: true });
}
