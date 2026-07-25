import { AlertTriangle } from 'lucide-react';
import { and, eq, gte, sql } from 'drizzle-orm';
import { aiStatus } from '@/lib/claude';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { GenerateRefresh } from '@/components/generate-refresh';

/** Quante mention sono state raccolte di recente: distingue "raccolta ferma"
 *  da "ciclo notturno non passato", che sono problemi diversi. */
async function collected(projectId: number, days: number): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, new Date(Date.now() - days * 86400_000)),
    ));
  return Number(r?.n ?? 0);
}

/** Data di oggi in ora italiana, nello stesso formato usato per salvare i brief. */
export function todayKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
}

/**
 * Controllo di freschezza del brief.
 *
 * Un brief vecchio mostrato senza avvisi è peggio di nessun brief: sembra
 * attuale e non lo è. Il ciclo notturno può saltare (cron non eseguito, tetto
 * di spesa raggiunto, chiave mancante) e finora falliva in silenzio.
 * Qui lo diciamo, spieghiamo la causa e diamo il modo di rimediare subito.
 */
export async function BriefFreshness({ latestDate }: { latestDate: string | Date | null }) {
  const today = todayKey();
  const latest = latestDate
    ? (typeof latestDate === 'string' ? latestDate.slice(0, 10)
      : new Date(latestDate).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' }))
    : null;
  if (latest === today) return null;   // tutto a posto: nessun rumore

  const project = await getCurrentProject();
  const [status, recent] = await Promise.all([
    aiStatus(),
    project ? collected(project.id, 30) : Promise.resolve(0),
  ]);
  const daysOld = latest
    ? Math.round((new Date(today).getTime() - new Date(latest).getTime()) / 86400_000)
    : null;

  // La raccolta ferma viene PRIMA di tutto il resto: se non entra nulla, non è
  // un problema di AI né di cron, e generare un brief non risolverebbe niente.
  const noData = recent === 0;
  const why = noData
    ? 'Nothing has been collected for this project in the last 30 days, so there is nothing to brief on. Check the keywords and sources in Settings, then use “Refresh now”.'
    : !status.hasKey
      ? 'No AI key is configured, so it cannot be written.'
      : status.capReached
        ? `The spend cap was reached ($${status.spend.toFixed(2)} of $${status.budget}), so the nightly cycle skipped it. Raise the cap in Settings → Budget.`
        : 'The nightly cycle has not produced it yet — it runs at 07:00. You can generate it now: if the last day was quiet the briefing widens to the last week and says so.';

  return (
    <div className="panel mb-4 border-amber-500/40 px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-300">
            {latest
              ? `Today's brief is missing — the latest one is from ${latest}${
                daysOld === 1 ? ' (yesterday)' : daysOld && daysOld > 1 ? ` (${daysOld} days old)` : ''}.`
              : 'No brief has been written yet.'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{why}</p>
        </div>
        {status.ready && !noData && (
          <GenerateRefresh endpoint="/api/brief" label="Generate today's brief" busyLabel="Writing the brief…" />
        )}
      </div>
    </div>
  );
}
