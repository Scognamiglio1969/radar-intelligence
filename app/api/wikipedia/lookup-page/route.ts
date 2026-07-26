import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { searchWikiPages } from '@/lib/wikipedia';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });

  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ pages: [] });

  try {
    const pages = await searchWikiPages(q);
    return NextResponse.json({ pages });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
