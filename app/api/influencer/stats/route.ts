import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { tregEnabled } from '@/lib/treg';
import {
  fetchHandleStats, saveHandleStats, latestHandleStats, isHandlePlatform,
} from '@/lib/handle-stats';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// GET: l'ultima rilevazione per ogni handle tracciato nel progetto (read-back).
export async function GET() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const rows = await latestHandleStats(project.id);
  return NextResponse.json({ handles: rows });
}

// POST { platform, handle }: legge la reach via treg, la salva, la restituisce.
export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!tregEnabled()) {
    return NextResponse.json(
      { error: 'treg not configured — set TREG_TOKEN in Settings to track reach' },
      { status: 400 },
    );
  }

  const { platform, handle } = (await req.json()) as { platform?: string; handle?: string };
  if (!platform || !isHandlePlatform(platform)) {
    return NextResponse.json({ error: 'platform must be one of x, instagram, tiktok' }, { status: 400 });
  }
  if (!handle || !handle.trim()) {
    return NextResponse.json({ error: 'missing handle' }, { status: 400 });
  }

  const stats = await fetchHandleStats(platform, handle);
  if (!stats) {
    return NextResponse.json({ error: 'no profile found (miss or provider error)' }, { status: 404 });
  }

  await saveHandleStats(project.id, stats);
  return NextResponse.json({ stats });
}
