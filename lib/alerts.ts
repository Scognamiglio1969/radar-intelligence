import { and, eq, gte, sql, desc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { alerts, mentions } from '@/lib/db/schema';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

/** Contesto salvato dentro l'alert: spiega COSA lo ha fatto scattare. */
export type AlertContext = {
  explanation?: string;
  topics?: string[];
  bySource?: { source: string; n: number }[];
  keyMentions?: { title: string; url?: string; source: string; sentiment?: string }[];
};

/** Fotografa le ultime 24h: fonti, temi e contenuti chiave + spiegazione AI. */
async function buildAlertContext(projectId: number, kind: 'volume' | 'sentiment'): Promise<AlertContext> {
  const db = await getDb();
  const h24 = new Date(Date.now() - 24 * 3600_000);
  const base = and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, h24));

  const bySource = await db.select({ source: mentions.source, n: sql<number>`count(*)` })
    .from(mentions).where(base)
    .groupBy(mentions.source).orderBy(desc(sql`count(*)`)).limit(5);

  const topicsRes = await db.execute(sql`
    SELECT t AS topic, count(*) AS n FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${h24.toISOString()}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 5
  `);

  const key = await db.select({
    title: mentions.title, content: mentions.content, url: mentions.url,
    source: mentions.source, sentiment: mentions.sentiment,
  }).from(mentions)
    .where(kind === 'sentiment' ? and(base, eq(mentions.sentiment, 'negative')) : base)
    .orderBy(
      kind === 'sentiment'
        ? sql`${mentions.sentimentScore} ASC NULLS LAST`
        : sql`${mentions.relevance} DESC NULLS LAST, ${mentions.engagementScore} DESC`,
    )
    .limit(3);

  const topics = (topicsRes.rows as { topic: string }[]).map((r) => r.topic);
  const keyMentions = key.map((k) => ({
    title: (k.title ?? k.content).slice(0, 160),
    url: k.url ?? undefined,
    source: k.source,
    sentiment: k.sentiment ?? undefined,
  }));

  let explanation: string | undefined;
  if (await claudeAvailable()) {
    const text = await callClaude(
      MODELS.haiku, 'alert_explanation',
      `You are a media analyst. Explain in at most 2 sentences in English what is causing this ${kind === 'volume' ? 'spike in conversations' : 'drop in sentiment'} and why it deserves attention. Be concrete, cite facts from the provided content. Respond only with the 2 sentences.`,
      `Topics of the last 24h: ${topics.join(', ') || 'n/a'}\n\nKey content:\n${keyMentions.map((m) => `- [${m.source}] ${m.title}`).join('\n')}`,
      200,
    );
    if (text) explanation = text.trim();
  }

  return {
    explanation,
    topics,
    bySource: bySource.map((s) => ({ source: s.source, n: Number(s.n) })),
    keyMentions,
  };
}

/**
 * Rileva anomalie sulle ultime 24 ore rispetto alla settimana precedente:
 * - picco di volume (mention 24h > 2.5x la media giornaliera dei 7 giorni prima)
 * - crollo di sentiment (media 24h molto sotto la baseline, con abbastanza dati)
 * Evita duplicati: non crea alert dello stesso tipo se ne esiste uno nelle 24h.
 */
export async function detectAlerts(projectId: number, opts: { aiContext?: boolean } = {}): Promise<number> {
  const withAi = opts.aiContext ?? true;
  const db = await getDb();
  const now = Date.now();
  const h24 = new Date(now - 24 * 3600_000);
  const d8 = new Date(now - 8 * 86400_000);

  const recentAlerts = await db.select({ type: alerts.type }).from(alerts)
    .where(and(eq(alerts.projectId, projectId), gte(alerts.createdAt, h24)));
  const hasRecent = (type: string) => recentAlerts.some((a) => a.type === type);

  let created = 0;

  // --- Volume ---
  const [vol] = await db.select({
    last24: sql<number>`count(*) FILTER (WHERE ${mentions.publishedAt} >= ${h24})`,
    prev7: sql<number>`count(*) FILTER (WHERE ${mentions.publishedAt} < ${h24})`,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, d8)));

  const last24 = Number(vol.last24);
  const avgDaily = Number(vol.prev7) / 7;
  if (!hasRecent('volume_spike') && avgDaily >= 3 && last24 > Math.max(10, 2.5 * avgDaily)) {
    const context = withAi ? await buildAlertContext(projectId, 'volume') : {};
    await db.insert(alerts).values({
      projectId,
      type: 'volume_spike',
      severity: last24 > 5 * avgDaily ? 'high' : 'medium',
      message: `Volume spike: ${last24} mentions in the last 24h vs an average of ${avgDaily.toFixed(0)}/day.`,
      data: { last24, avgDaily: Math.round(avgDaily), ...context },
    });
    created++;
  }

  // --- Sentiment ---
  const [sent] = await db.select({
    avg24: sql<number | null>`avg(${mentions.sentimentScore}) FILTER (WHERE ${mentions.publishedAt} >= ${h24})`,
    n24: sql<number>`count(${mentions.sentimentScore}) FILTER (WHERE ${mentions.publishedAt} >= ${h24})`,
    avgPrev: sql<number | null>`avg(${mentions.sentimentScore}) FILTER (WHERE ${mentions.publishedAt} < ${h24})`,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, d8)));

  const avg24 = sent.avg24 === null ? null : Number(sent.avg24);
  const avgPrev = sent.avgPrev === null ? null : Number(sent.avgPrev);
  if (!hasRecent('sentiment_drop') && avg24 !== null && avgPrev !== null
    && Number(sent.n24) >= 10 && avg24 < avgPrev - 0.25 && avg24 < 0) {
    const context = withAi ? await buildAlertContext(projectId, 'sentiment') : {};
    await db.insert(alerts).values({
      projectId,
      type: 'sentiment_drop',
      severity: avg24 < avgPrev - 0.4 ? 'high' : 'medium',
      message: `Sharp sentiment drop: average ${avg24.toFixed(2)} in the last 24h (baseline ${avgPrev.toFixed(2)}).`,
      data: { avg24, avgPrev, ...context },
    });
    created++;
  }

  return created;
}

export async function getRecentAlerts(projectId: number, limit = 50) {
  const db = await getDb();
  return db.select().from(alerts)
    .where(eq(alerts.projectId, projectId))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);
}
