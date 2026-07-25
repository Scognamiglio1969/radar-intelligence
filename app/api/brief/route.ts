import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { generateDailyBrief, aiStatus } from '@/lib/claude';
import { collectBriefData } from '@/lib/pipeline';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Genera il brief di OGGI su richiesta, per quando il ciclo notturno non l'ha
 * prodotto (cron saltato, tetto di spesa raggiunto, chiave mancante).
 * L'errore restituito dice ESATTAMENTE perché, invece di fallire in silenzio.
 */
export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });

  const status = await aiStatus();
  if (!status.hasKey) {
    return NextResponse.json({ error: 'no AI key configured — add one in Settings → Budget' }, { status: 400 });
  }
  if (status.capReached) {
    return NextResponse.json({
      error: `spend cap reached ($${status.spend.toFixed(2)} of $${status.budget}) — raise it in Settings → Budget`,
    }, { status: 400 });
  }

  const data = await collectBriefData(project.id);
  // Distinguere "non ho dati" da "il modello ha fallito": è la differenza fra
  // un problema di raccolta e un problema di generazione, e l'utente deve
  // sapere quale dei due ha davanti.
  if (!data.total) {
    return NextResponse.json({
      error: 'nothing has been collected for this project in the last 30 days — check the keywords and sources in Settings, then use “Refresh now”',
    }, { status: 400 });
  }
  const ok = await generateDailyBrief(project.id, project.name, data);
  if (!ok) return NextResponse.json({ error: 'the model did not return a brief — try again' }, { status: 400 });
  return NextResponse.json({ generated: true, window: data.window, mentions: data.total });
}
