import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { ingestTrials } from '@/lib/trials';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  try {
    const r = await ingestTrials(project.id);
    if (r.tried === 0) return NextResponse.json({ error: 'scegli prima che cosa seguire (farmaci, condizioni, sponsor)' }, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
