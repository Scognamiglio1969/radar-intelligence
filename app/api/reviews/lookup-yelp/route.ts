import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { searchYelpBusinesses } from '@/lib/reviews/yelp';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });

  const term = req.nextUrl.searchParams.get('term') ?? '';
  const location = req.nextUrl.searchParams.get('location') ?? '';
  if (term.trim().length < 2 || location.trim().length < 2) return NextResponse.json({ businesses: [] });

  await hydrateConnectorCredentials();
  try {
    const businesses = await searchYelpBusinesses(term, location);
    return NextResponse.json({ businesses });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
