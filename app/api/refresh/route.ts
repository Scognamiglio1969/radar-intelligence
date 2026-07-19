import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Aggiornamento on-demand dal pulsante "Refresh now": aggiornamento COMPLETO
// (ingestion + analisi + alert + storie + ratings + narrazioni + timeline + daily brief).
// Il digest Telegram resta escluso (solo cron) per non notificare a ogni click.
export async function POST() {
  try {
    const result = await runPipeline({ full: true });
    return NextResponse.json(result);
  } catch (e) {
    console.error('Refresh fallito:', e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
