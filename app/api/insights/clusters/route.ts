import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getClusters } from '@/lib/insights';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  const clusters = await getClusters(project.id, true);
  if (!clusters) return NextResponse.json({ error: 'dati insufficienti o tetto API raggiunto' }, { status: 400 });
  return NextResponse.json({ clusters });
}
