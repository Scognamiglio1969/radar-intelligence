import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { factCheckEnabled, ingestFactChecks } from '@/lib/factcheck';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  try {
    await hydrateConnectorCredentials();
    if (!factCheckEnabled()) return NextResponse.json({ error: 'manca la chiave Google Fact Check — inseriscila qui sotto' }, { status: 400 });
    const r = await ingestFactChecks(project.id);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
