import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { extractTimelineEvents } from '@/lib/timeline';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Estrazione on-demand (oltre a quella del ciclo giornaliero); max 1/giorno.
export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  const created = await extractTimelineEvents(project.id);
  return NextResponse.json({ created });
}
