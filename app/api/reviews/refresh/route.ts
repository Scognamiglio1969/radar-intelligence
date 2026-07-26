import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { ingestReviews } from '@/lib/reviews';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  try {
    const { tried, fetched } = await ingestReviews(project.id);
    if (tried === 0) return NextResponse.json({ error: 'no review source configured yet — add one below' }, { status: 400 });
    return NextResponse.json({ fetched });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
