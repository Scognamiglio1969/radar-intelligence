import { and, desc, eq, gte, ilike, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb, getMeta } from '@/lib/db';
import {
  apiUsage, benchmarkEntities, briefs, mentions, projects, stories,
} from '@/lib/db/schema';
import { NEWS_SOURCES } from '@/lib/connectors';
import { getCurrentUser, isAdmin } from '@/lib/auth';

/** Progetti visibili all'utente corrente: i propri + quelli condivisi (admin: tutti). */
export async function getProjects() {
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user) return [];
  if (isAdmin(user)) return db.select().from(projects).orderBy(projects.id);
  const cond = or(eq(projects.ownerId, user.id), eq(projects.visibility, 'shared'));
  return db.select().from(projects).where(cond).orderBy(projects.id);
}

/** Progetto attivo: dal cookie sr_project (se accessibile), altrimenti il primo. */
export async function getCurrentProject() {
  const all = await getProjects();
  const cookieStore = await cookies();
  const wanted = Number(cookieStore.get('sr_project')?.value);
  return all.find((p) => p.id === wanted) ?? all[0] ?? null;
}

export async function getLastIngestAt(): Promise<Date | null> {
  const iso = await getMeta<string>('last_ingest_at');
  return iso ? new Date(iso) : null;
}

// ---------------------------------------------------------------------------

export async function dashboardData(projectId: number) {
  const db = await getDb();
  const d7 = new Date(Date.now() - 7 * 86400_000);
  const d14 = new Date(Date.now() - 14 * 86400_000);

  const [kpi] = await db.select({
    total7: sql<number>`count(*)`,
    avgSentiment: sql<number | null>`avg(${mentions.sentimentScore})`,
    sources: sql<number>`count(DISTINCT ${mentions.source})`,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, d7)));

  const volumeByDay = await db.execute(sql`
    SELECT to_char(date_trunc('day', published_at), 'YYYY-MM-DD') AS day, source, count(*) AS n
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${d14.toISOString()}::timestamptz
    GROUP BY 1, 2 ORDER BY 1
  `);

  const sentimentDist = await db.select({
    sentiment: mentions.sentiment, n: sql<number>`count(*)`,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, d7), isNotNull(mentions.sentiment)))
    .groupBy(mentions.sentiment);

  const topTopics = await db.execute(sql`
    SELECT t AS topic, count(*) AS n
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${d7.toISOString()}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 14
  `);

  const latest = await db.select().from(mentions)
    .where(eq(mentions.projectId, projectId))
    .orderBy(desc(mentions.publishedAt)).limit(6);

  const [latestBrief] = await db.select().from(briefs)
    .where(eq(briefs.projectId, projectId))
    .orderBy(desc(briefs.briefDate)).limit(1);

  return {
    kpi: {
      total7: Number(kpi.total7),
      avgSentiment: kpi.avgSentiment === null ? null : Number(kpi.avgSentiment),
      sources: Number(kpi.sources),
    },
    volumeByDay: volumeByDay.rows as { day: string; source: string; n: number }[],
    sentimentDist: sentimentDist.map((r) => ({ sentiment: r.sentiment ?? 'in attesa', n: Number(r.n) })),
    topTopics: topTopics.rows as { topic: string; n: number }[],
    latest,
    latestBrief: latestBrief ?? null,
  };
}

// ---------------------------------------------------------------------------

export type ListeningFilters = {
  source?: string; sentiment?: string; language?: string; q?: string; days?: number; page?: number;
  /** Ricerca semantica: termini espansi dall'AI, cercati in OR */
  semanticTerms?: string[];
  /** Solo contenuti con rilevanza AI >= N stelle */
  minRelevance?: number;
  /** Filtra per autore (handle o nome) */
  author?: string;
  sortBy?: 'data' | 'engagement' | 'rilevanza';
};

export async function listeningData(projectId: number, f: ListeningFilters) {
  const db = await getDb();
  const pageSize = 40;
  const page = Math.max(1, f.page ?? 1);
  const conds: SQL[] = [eq(mentions.projectId, projectId)];
  if (f.source) conds.push(eq(mentions.source, f.source));
  if (f.sentiment) conds.push(eq(mentions.sentiment, f.sentiment));
  if (f.language) conds.push(eq(mentions.language, f.language));
  if (f.days) conds.push(gte(mentions.publishedAt, new Date(Date.now() - f.days * 86400_000)));
  if (f.semanticTerms?.length) {
    const c = or(...f.semanticTerms.flatMap((t) => [
      ilike(mentions.content, `%${t}%`), ilike(mentions.title, `%${t}%`),
    ]));
    if (c) conds.push(c);
  } else if (f.q) {
    const c = or(ilike(mentions.content, `%${f.q}%`), ilike(mentions.title, `%${f.q}%`));
    if (c) conds.push(c);
  }
  if (f.minRelevance) conds.push(gte(mentions.relevance, f.minRelevance));
  if (f.author) {
    const c = or(ilike(mentions.author, f.author), ilike(mentions.authorHandle, f.author));
    if (c) conds.push(c);
  }
  const where = and(...conds);

  const orderBy = f.sortBy === 'engagement'
    ? [desc(mentions.engagementScore), desc(mentions.publishedAt)]
    : f.sortBy === 'rilevanza'
      ? [sql`${mentions.relevance} DESC NULLS LAST`, desc(mentions.publishedAt)]
      : [desc(mentions.publishedAt)];

  const [count] = await db.select({ n: sql<number>`count(*)` }).from(mentions).where(where);
  const rows = await db.select().from(mentions).where(where)
    .orderBy(...orderBy)
    .limit(pageSize).offset((page - 1) * pageSize);

  const languages = await db.select({ language: mentions.language, n: sql<number>`count(*)` })
    .from(mentions)
    .where(and(eq(mentions.projectId, projectId), isNotNull(mentions.language)))
    .groupBy(mentions.language).orderBy(desc(sql`count(*)`)).limit(12);

  return { rows, total: Number(count.n), page, pageSize, languages };
}

// ---------------------------------------------------------------------------

export async function mediaData(projectId: number) {
  const db = await getDb();
  const d7 = new Date(Date.now() - 7 * 86400_000);

  const storyList = await db.select().from(stories)
    .where(and(eq(stories.projectId, projectId), gte(stories.createdAt, d7)))
    .orderBy(desc(stories.createdAt)).limit(20);

  const storyMentions = storyList.length
    ? await db.select().from(mentions)
      .where(inArray(mentions.storyId, storyList.map((s) => s.id)))
      .orderBy(desc(mentions.publishedAt))
    : [];

  const news = await db.select().from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      inArray(mentions.source, NEWS_SOURCES),
      gte(mentions.publishedAt, d7),
    ))
    .orderBy(desc(mentions.publishedAt)).limit(60);

  const topOutlets = await db.select({ community: mentions.community, n: sql<number>`count(*)` })
    .from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      inArray(mentions.source, NEWS_SOURCES),
      gte(mentions.publishedAt, d7),
      isNotNull(mentions.community),
    ))
    .groupBy(mentions.community).orderBy(desc(sql`count(*)`)).limit(10);

  return { stories: storyList, storyMentions, news, topOutlets };
}

// ---------------------------------------------------------------------------

export async function benchmarkData(projectId: number) {
  const db = await getDb();
  const entities = await db.select().from(benchmarkEntities)
    .where(eq(benchmarkEntities.projectId, projectId));
  const d14 = new Date(Date.now() - 14 * 86400_000);

  const results = [];
  for (const entity of entities) {
    if (entity.keywords.length === 0) continue;
    const match = or(...entity.keywords.flatMap((k) => [
      ilike(mentions.content, `%${k}%`), ilike(mentions.title, `%${k}%`),
    ]));
    const where = and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, d14), match);

    const [agg] = await db.select({
      n: sql<number>`count(*)`,
      avgSentiment: sql<number | null>`avg(${mentions.sentimentScore})`,
    }).from(mentions).where(where);

    const byDay = await db.select({
      day: sql<string>`to_char(date_trunc('day', ${mentions.publishedAt}), 'YYYY-MM-DD')`,
      n: sql<number>`count(*)`,
    }).from(mentions).where(where).groupBy(sql`1`).orderBy(sql`1`);

    results.push({
      entity,
      total: Number(agg.n),
      avgSentiment: agg.avgSentiment === null ? null : Number(agg.avgSentiment),
      byDay: byDay.map((r) => ({ day: r.day, n: Number(r.n) })),
    });
  }
  return results;
}

// ---------------------------------------------------------------------------

export async function audienceData(projectId: number) {
  const db = await getDb();
  const d14 = new Date(Date.now() - 14 * 86400_000);
  const base = and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, d14));

  const communities = await db.select({
    community: mentions.community, source: mentions.source,
    n: sql<number>`count(*)`,
    avgSentiment: sql<number | null>`avg(${mentions.sentimentScore})`,
  }).from(mentions)
    .where(and(base, isNotNull(mentions.community)))
    .groupBy(mentions.community, mentions.source)
    .orderBy(desc(sql`count(*)`)).limit(15);

  const languages = await db.select({ language: mentions.language, n: sql<number>`count(*)` })
    .from(mentions)
    .where(and(base, isNotNull(mentions.language)))
    .groupBy(mentions.language).orderBy(desc(sql`count(*)`)).limit(10);

  const authors = await db.select({
    author: mentions.author, authorHandle: mentions.authorHandle, source: mentions.source,
    n: sql<number>`count(*)`,
    engagement: sql<number>`sum(${mentions.engagementScore})`,
  }).from(mentions)
    .where(and(base, isNotNull(mentions.author), sql`${mentions.source} NOT IN ('googlenews','gdelt')`))
    .groupBy(mentions.author, mentions.authorHandle, mentions.source)
    .orderBy(desc(sql`sum(${mentions.engagementScore})`)).limit(15);

  const topicsByCommunity = await db.execute(sql`
    SELECT community, t AS topic, count(*) AS n
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${d14.toISOString()}::timestamptz
      AND community IS NOT NULL
    GROUP BY community, t ORDER BY n DESC LIMIT 30
  `);

  return {
    communities: communities.map((c) => ({
      ...c, n: Number(c.n),
      avgSentiment: c.avgSentiment === null ? null : Number(c.avgSentiment),
    })),
    languages: languages.map((l) => ({ language: l.language ?? '?', n: Number(l.n) })),
    authors: authors.map((a) => ({ ...a, n: Number(a.n), engagement: Number(a.engagement) })),
    topicsByCommunity: topicsByCommunity.rows as { community: string; topic: string; n: number }[],
  };
}

// ---------------------------------------------------------------------------

export async function contentData(projectId: number) {
  const db = await getDb();
  const d7 = new Date(Date.now() - 7 * 86400_000);
  const rows = await db.select().from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, d7),
      sql`${mentions.engagementScore} > 0`,
    ))
    .orderBy(desc(mentions.engagementScore)).limit(60);

  // Percentile di engagement calcolato per fonte (normalizza tra piattaforme)
  const bySource = new Map<string, number[]>();
  for (const r of rows) {
    if (!bySource.has(r.source)) bySource.set(r.source, []);
    bySource.get(r.source)!.push(r.engagementScore);
  }
  return rows.map((r) => {
    const scores = bySource.get(r.source)!;
    const below = scores.filter((s) => s < r.engagementScore).length;
    return { ...r, percentile: Math.round((below / Math.max(1, scores.length - 1)) * 100) };
  });
}

// ---------------------------------------------------------------------------

export async function briefList(projectId: number) {
  const db = await getDb();
  return db.select().from(briefs)
    .where(eq(briefs.projectId, projectId))
    .orderBy(desc(briefs.briefDate)).limit(30);
}

export async function monthCost() {
  const db = await getDb();
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  const [row] = await db.select({
    cost: sql<number | null>`sum(${apiUsage.costUsd})`,
    calls: sql<number>`count(*)`,
    inTok: sql<number | null>`sum(${apiUsage.inputTokens})`,
    outTok: sql<number | null>`sum(${apiUsage.outputTokens})`,
  }).from(apiUsage).where(gte(apiUsage.ts, start));
  const byPurpose = await db.select({
    purpose: apiUsage.purpose,
    cost: sql<number | null>`sum(${apiUsage.costUsd})`,
    calls: sql<number>`count(*)`,
  }).from(apiUsage).where(gte(apiUsage.ts, start)).groupBy(apiUsage.purpose);
  return {
    cost: Number(row.cost ?? 0), calls: Number(row.calls),
    inTok: Number(row.inTok ?? 0), outTok: Number(row.outTok ?? 0),
    byPurpose: byPurpose.map((p) => ({ purpose: p.purpose, cost: Number(p.cost ?? 0), calls: Number(p.calls) })),
  };
}

export async function getBenchmarkEntities(projectId: number) {
  const db = await getDb();
  return db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId));
}

/** Alert delle ultime 24h: alimenta il badge rosso in sidebar. */
/** Battito del progetto per la favicon live: volume e tono delle ultime 24h. */
export async function getPulse(projectId: number): Promise<{ mentions24h: number; sentiment: number | null }> {
  const db = await getDb();
  const since = new Date(Date.now() - 24 * 3600_000);
  const [row] = await db
    .select({
      n: sql<number>`count(*)`,
      s: sql<number | null>`avg(${mentions.sentimentScore})`,
    })
    .from(mentions)
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, since)));
  return { mentions24h: Number(row?.n ?? 0), sentiment: row?.s === null || row?.s === undefined ? null : Number(row.s) };
}

export async function getRecentAlertCount(projectId: number): Promise<number> {
  const db = await getDb();
  const { alerts } = await import('@/lib/db/schema');
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(alerts)
    .where(and(eq(alerts.projectId, projectId), gte(alerts.createdAt, new Date(Date.now() - 24 * 3600_000))));
  return Number(row.n);
}
