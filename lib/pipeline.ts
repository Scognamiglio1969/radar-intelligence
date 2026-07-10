import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { mentions, projects } from '@/lib/db/schema';
import { ingestProject } from '@/lib/ingest';
import {
  analyzePendingMentions, clusterNewsStories, generateDailyBrief, scoreTopContent,
} from '@/lib/claude';
import { detectAlerts } from '@/lib/alerts';
import { computeTrends, explainTrends } from '@/lib/trends';
import { detectNarratives } from '@/lib/narratives';
import { notifyAlerts, notifyDailyDigest } from '@/lib/notify';
import { extractTimelineEvents } from '@/lib/timeline';
import { alerts as alertsTable, users as usersTable } from '@/lib/db/schema';
import { getTrends } from '@/lib/trends';

/** L'AI è attiva per il proprietario del progetto? (admin/legacy sempre sì; membri solo se abilitati) */
async function ownerAiEnabled(db: Awaited<ReturnType<typeof getDb>>, ownerId: number | null): Promise<boolean> {
  if (ownerId == null) return true; // progetti legacy senza proprietario
  const [owner] = await db.select({ role: usersTable.role, ai: usersTable.aiEnabled })
    .from(usersTable).where(eq(usersTable.id, ownerId));
  return Boolean(owner && (owner.role === 'admin' || owner.ai === 1));
}

const LOCK_KEY = 'pipeline_lock';
const LOCK_TTL_MS = 5 * 60_000;

/**
 * Pipeline completa: ingestion → analisi Claude → alert.
 * Con full=true (cron giornaliero) aggiunge storie, content ratings e daily brief.
 */
export async function runPipeline(opts: { full?: boolean } = {}) {
  const db = await getDb();

  const lock = await getMeta<string>(LOCK_KEY);
  if (lock && Date.now() - new Date(lock).getTime() < LOCK_TTL_MS) {
    return { skipped: true, reason: 'pipeline già in esecuzione' };
  }
  await setMeta(LOCK_KEY, new Date().toISOString());

  try {
    const allProjects = await db.select().from(projects);
    const summary: Record<string, unknown>[] = [];

    for (const project of allProjects) {
      console.log(`[pipeline] ingestion per "${project.name}"…`);
      const ingest = await ingestProject(project);
      console.log(`[pipeline] ingestion completata: ${ingest.inserted} nuove mention`);
      // Se il proprietario è "dormiente" (membro senza AI), si raccolgono i dati
      // ma si saltano tutte le analisi Claude (nessun costo API).
      const aiOn = await ownerAiEnabled(db, project.ownerId);
      const theme = [project.name, project.semanticContext, `termini: ${project.keywords.join(', ')}`]
        .filter(Boolean).join(' — ');
      const analysis = aiOn
        ? await analyzePendingMentions(project.id, theme)
        : { analyzed: 0, pending: 0 };
      console.log(`[pipeline] analisi: ${analysis.analyzed} analizzate, ${analysis.pending} in attesa${aiOn ? '' : ' (AI dormiente)'}`);
      const newAlerts = await detectAlerts(project.id, { aiContext: aiOn });
      const trendCount = await computeTrends(project.id);
      const row: Record<string, unknown> = {
        project: project.name, aiOn, inserted: ingest.inserted,
        analyzed: analysis.analyzed, alerts: newAlerts, trends: trendCount,
      };

      // Notifica push solo per gli alert appena creati (mai più di un messaggio a giro)
      if (newAlerts > 0) {
        const fresh = await db.select({
          message: alertsTable.message, severity: alertsTable.severity, data: alertsTable.data,
        })
          .from(alertsTable)
          .where(eq(alertsTable.projectId, project.id))
          .orderBy(desc(alertsTable.createdAt))
          .limit(newAlerts);
        await notifyAlerts(project.name, fresh.map((f) => ({
          severity: f.severity,
          // La spiegazione AI viaggia anche nella notifica push
          message: (f.data as { explanation?: string } | null)?.explanation
            ? `${f.message}\n${(f.data as { explanation?: string }).explanation}`
            : f.message,
        })));
      }

      if (opts.full && aiOn) {
        row.timeline = await extractTimelineEvents(project.id);
        row.trendsExplained = await explainTrends(project.id);
        row.narratives = await detectNarratives(project.id);
        row.stories = await clusterNewsStories(project.id);
        row.rated = await scoreTopContent(project.id, project.name);
        const briefData = await collectBriefData(project.id);
        row.brief = await generateDailyBrief(project.id, project.name, briefData);

        // Digest silenzioso del mattino: una riga di numeri + link al brief
        if (row.brief) {
          const h24 = new Date(Date.now() - 24 * 3600_000);
          const [agg] = await db.select({
            n: sql<number>`count(*)`,
            avg: sql<number | null>`avg(${mentions.sentimentScore})`,
          }).from(mentions)
            .where(and(eq(mentions.projectId, project.id), gte(mentions.publishedAt, h24)));
          const avg = agg.avg === null ? null : Number(agg.avg);
          const topTrend = (await getTrends(project.id))[0]?.topic;
          await notifyDailyDigest(project.name, {
            mentions24h: Number(agg.n),
            sentiment: avg === null ? 'in analisi' : avg > 0.15 ? 'positivo' : avg < -0.15 ? 'negativo' : 'neutro',
            topTrend,
          });
        }
      }
      summary.push(row);
    }

    // Retention: 90 giorni (free tier Neon)
    await db.execute(sql`DELETE FROM mentions WHERE published_at < now() - interval '90 days'`);

    return { skipped: false, summary };
  } finally {
    await setMeta(LOCK_KEY, null);
  }
}

/** Dati aggregati delle ultime 24h da passare a Claude per il daily brief. */
async function collectBriefData(projectId: number) {
  const db = await getDb();
  const h24 = new Date(Date.now() - 24 * 3600_000);

  const bySource = await db.select({
    source: mentions.source, n: sql<number>`count(*)`,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, h24)))
    .groupBy(mentions.source);

  const bySentiment = await db.select({
    sentiment: mentions.sentiment, n: sql<number>`count(*)`,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, h24)))
    .groupBy(mentions.sentiment);

  const topTopics = await db.execute(sql`
    SELECT t AS topic, count(*) AS n
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${h24.toISOString()}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 10
  `);

  const topMentions = await db.select({
    source: mentions.source, title: mentions.title, content: mentions.content,
    sentiment: mentions.sentiment, engagementScore: mentions.engagementScore,
    community: mentions.community,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, h24)))
    .orderBy(desc(mentions.engagementScore))
    .limit(15);

  return {
    volumePerFonte: bySource,
    sentiment: bySentiment,
    temiPrincipali: topTopics.rows,
    contenutiTop: topMentions.map((m) => ({
      fonte: m.source, dove: m.community, sentiment: m.sentiment,
      testo: `${m.title ?? ''} ${m.content}`.slice(0, 250).trim(),
    })),
  };
}
