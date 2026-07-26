import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { searchTeams } from '@/lib/sport/football-data';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });

  const competition = req.nextUrl.searchParams.get('competition') ?? '';
  const q = req.nextUrl.searchParams.get('q') ?? '';
  if (!competition || q.trim().length < 2) return NextResponse.json({ teams: [] });

  await hydrateConnectorCredentials();
  try {
    const { teams, keyMissing } = await searchTeams(competition, q);
    return NextResponse.json({ teams, keyMissing });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
