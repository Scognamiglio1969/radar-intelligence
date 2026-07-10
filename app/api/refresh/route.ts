import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Aggiornamento on-demand dal pulsante in UI (e auto-refresh se dati stantii):
// ingestion + analisi + alert, senza brief/storie (riservati al cron giornaliero).
export async function POST() {
  try {
    const result = await runPipeline({ full: false });
    return NextResponse.json(result);
  } catch (e) {
    console.error('Refresh fallito:', e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
