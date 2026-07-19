import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { analyzePendingMentions, claudeAvailable } from '@/lib/claude';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Tagga ora (sentiment/emozioni/topic/rilevanza) un lotto di mention appena caricate. */
export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  if (!(await claudeAvailable())) return NextResponse.json({ error: 'No AI engine key configured (Settings → Budget)' }, { status: 400 });
  const { projectId } = (await req.json()) as { projectId?: number };
  if (!projectId) return NextResponse.json({ error: 'No project' }, { status: 400 });

  const db = await getDb();
  const [p] = await db.select({ name: projects.name, keywords: projects.keywords, semanticContext: projects.semanticContext })
    .from(projects).where(eq(projects.id, projectId));
  if (!p) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const theme = [p.name, p.semanticContext, `terms: ${(p.keywords ?? []).join(', ')}`].filter(Boolean).join(' — ');
  const r = await analyzePendingMentions(projectId, theme);
  return NextResponse.json(r);
}
