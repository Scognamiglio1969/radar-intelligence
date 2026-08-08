import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { auditProject } from '@/lib/import-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** La quadratura: righe e colonne, e dove sono finite tutte. */
export async function GET(req: Request) {
  if (!isAdmin(await getCurrentUser())) {
    return NextResponse.json({ error: 'Solo gli amministratori' }, { status: 403 });
  }
  const projectId = Number(new URL(req.url).searchParams.get('project'));
  if (!projectId) return NextResponse.json({ error: 'Progetto mancante' }, { status: 400 });
  const db = await getDb();
  const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId));
  if (!p) return NextResponse.json({ error: 'Progetto non trovato' }, { status: 404 });

  return NextResponse.json({ audit: await auditProject(projectId) });
}
