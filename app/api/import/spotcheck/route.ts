import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { spotCheck } from '@/lib/import-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Ri-derivare un file intero per ritrovare le righe può richiedere qualche
// secondo su un foglio da decine di migliaia di righe.
export const maxDuration = 120;

/** Il confronto riga per riga fra il foglio e l'archivio. */
export async function GET(req: Request) {
  if (!isAdmin(await getCurrentUser())) {
    return NextResponse.json({ error: 'Solo gli amministratori' }, { status: 403 });
  }
  const url = new URL(req.url);
  const fileId = Number(url.searchParams.get('file'));
  const projectId = Number(url.searchParams.get('project'));
  if (!fileId || !projectId) {
    return NextResponse.json({ error: 'Serve il file e il progetto' }, { status: 400 });
  }

  const db = await getDb();
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!p) return NextResponse.json({ error: 'Progetto non trovato' }, { status: 404 });

  const n = Math.min(8, Math.max(1, Number(url.searchParams.get('n')) || 3));
  try {
    return NextResponse.json(await spotCheck(fileId, projectId, n));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
