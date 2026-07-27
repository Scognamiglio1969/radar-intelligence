import { NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';
import { getCurrentProject } from '@/lib/data';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Aggiornamento on-demand dal pulsante "Refresh now": aggiornamento COMPLETO
// (ingestion + analisi + alert + storie + ratings + narrazioni + timeline + daily brief)
// ma SOLO del progetto che stai guardando — vedi il commento su runPipeline:
// aggiornarli tutti in sequenza a ogni click supera il limite di durata della
// funzione e il progetto in questione non veniva mai raggiunto. Tutti i
// progetti restano coperti dal cron notturno.
// Il digest Telegram resta escluso (solo cron) per non notificare a ogni click.
export async function POST() {
  try {
    const project = await getCurrentProject();
    const result = await runPipeline({ full: true, projectId: project?.id });
    return NextResponse.json(result);
  } catch (e) {
    console.error('Refresh fallito:', e);
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
