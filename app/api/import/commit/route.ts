import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { commitSheet, type ColumnMap } from '@/lib/import';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  const form = await req.formData();
  const file = form.get('file');
  const projectId = Number(form.get('projectId'));
  let map: ColumnMap;
  try { map = JSON.parse(String(form.get('map') ?? '{}')); } catch { return NextResponse.json({ error: 'Bad mapping' }, { status: 400 }); }
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: 'No project' }, { status: 400 });
  if (!map.content) return NextResponse.json({ error: 'Map the text/content column first' }, { status: 400 });

  // Il progetto deve esistere ed essere in modalità upload.
  const db = await getDb();
  const [p] = await db.select({ id: projects.id, mode: projects.mode }).from(projects).where(eq(projects.id, projectId));
  if (!p) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (p.mode !== 'upload') return NextResponse.json({ error: 'This project is not an upload project' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await commitSheet(projectId, buf, file.name, map);
  return NextResponse.json(result);
}
