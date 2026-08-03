import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createReport, deleteReport, listReports, saveReport } from '@/lib/custom-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Il report appartiene al progetto corrente: nessun id di progetto dal client. */
async function ctx() {
  if (!isAdmin(await getCurrentUser())) return { error: 'Solo gli amministratori possono modificare i report' as const };
  const project = await getCurrentProject();
  if (!project) return { error: 'Nessun progetto selezionato' as const };
  return { project };
}

export async function GET() {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  return NextResponse.json({ reports: await listReports(c.project.id) });
}

export async function POST(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const id = await createReport(c.project.id, String(body.title ?? ''), Number(body.days) || 30);
  return NextResponse.json({ id });
}

export async function PATCH(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  if (!id) return NextResponse.json({ error: 'Report mancante' }, { status: 400 });
  await saveReport(id, c.project.id, {
    title: typeof body.title === 'string' ? body.title : undefined,
    days: body.days === undefined ? undefined : Number(body.days),
    pages: body.pages,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const c = await ctx();
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'Report mancante' }, { status: 400 });
  await deleteReport(id, c.project.id);
  return NextResponse.json({ ok: true });
}
