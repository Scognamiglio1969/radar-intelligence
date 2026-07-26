import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { ingestSport } from '@/lib/sport';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  try {
    // Route API a sé stante: senza questo la chiave salvata dall'utente resta
    // invisibile a cfg() (la cache è per-processo e questa funzione serverless
    // non condivide memoria con quella che l'ha appena idratata) — il fetch
    // falliva silenziosamente (0 partite, nessun errore mostrato).
    await hydrateConnectorCredentials();
    const { tried, matches, prices } = await ingestSport(project.id);
    if (tried === 0) return NextResponse.json({ error: 'no team configured yet — add one below' }, { status: 400 });
    return NextResponse.json({ matches, prices });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
