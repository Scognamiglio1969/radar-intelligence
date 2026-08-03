import { NextResponse } from 'next/server';
import { runDueEditions } from '@/lib/periodic-report';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Secondo cron: le edizioni periodiche scadute. Sta separato da quello della
// pipeline perché gira DOPO — un report deve leggere i dati del giro appena
// concluso — e perché un timeout qui non deve poter uccidere la raccolta dati,
// che è la funzione vitale dell'app.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'non autorizzato' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runDueEditions());
  } catch (e) {
    console.error('Cron report periodici fallito:', e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
