import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { backfillCountries } from '@/lib/country-codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Ripassare decine di migliaia di righe è lavoro di secondi, non di minuti:
// una lettura, qualche UPDATE raggruppato per paese.
export const maxDuration = 120;

/**
 * Ricava il paese dalle mention già in archivio.
 *
 * Esiste come azione a sé perché è quello che serve davvero: chiedere una
 * raccolta nuova solo per rileggere dati che ci sono già costa quota API e
 * minuti, e non aggiunge un solo paese in più.
 */
export async function POST() {
  if (!isAdmin(await getCurrentUser())) {
    return NextResponse.json({ error: 'Solo gli amministratori' }, { status: 403 });
  }
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'Nessun progetto selezionato' }, { status: 400 });

  try {
    const recovered = await backfillCountries(project.id);
    return NextResponse.json({ recovered });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
