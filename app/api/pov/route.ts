import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { buildPointOfView } from '@/lib/pov';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const { pov, reason } = await buildPointOfView(project.id, 90);
  if (!pov) {
    const msg = reason === 'thin_data' ? 'not enough data yet for a point of view'
      : reason === 'no_ai' ? 'AI key missing or spend cap reached'
        : 'the model took too long or did not return a usable argument — try again in a moment';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ pov });
}
