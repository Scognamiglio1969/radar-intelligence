import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { reviewSources, reviews } from '@/lib/db/schema';
import { fetchAppStoreReviews } from './appstore';
import { fetchGooglePlacesReviews, googlePlacesEnabled } from './googleplaces';
import { fetchYelpReviews, yelpEnabled } from './yelp';

const TZ = 'Europe/Rome';

/**
 * Interroga le fonti configurate e salva le recensioni nuove.
 * Le fonti "upload" non si interrogano: sono state popolate una volta sola
 * al momento dell'import, non hanno un endpoint da rileggere.
 */
export async function ingestReviews(projectId: number): Promise<{ tried: number; fetched: number }> {
  const db = await getDb();
  const sources = await db.select().from(reviewSources).where(eq(reviewSources.projectId, projectId));
  let tried = 0;
  let fetched = 0;

  for (const src of sources) {
    if (src.type === 'upload') continue;
    tried++;
    let raw: Awaited<ReturnType<typeof fetchAppStoreReviews>> = [];
    try {
      if (src.type === 'appstore') raw = await fetchAppStoreReviews(src.identifier, src.country ?? 'us');
      else if (src.type === 'googleplaces') raw = await fetchGooglePlacesReviews(src.identifier);
      else if (src.type === 'yelp') raw = await fetchYelpReviews(src.identifier);
    } catch (e) {
      console.error(`[reviews] fetch fallita per la fonte #${src.id} (${src.type} · ${src.identifier}):`, e);
    }
    if (raw.length) {
      fetched += raw.length;
      const rows = raw.map((r) => ({ projectId, sourceId: src.id, ...r }));
      // onConflictDoNothing SENZA target: reviews ha un solo vincolo UNIQUE
      // (source_id, external_id), quindi ogni conflitto è già inequivocabile.
      for (let i = 0; i < rows.length; i += 100) {
        await db.insert(reviews).values(rows.slice(i, i + 100)).onConflictDoNothing();
      }
    }
    await db.update(reviewSources).set({ lastFetchedAt: new Date() }).where(eq(reviewSources.id, src.id));
  }
  return { tried, fetched };
}

export type ReviewSourceRow = {
  id: number; type: string; identifier: string; label: string;
  country: string | null; lastFetchedAt: Date | null;
  total: number; avgRating: number | null;
};

export type ReviewRow = {
  id: number; rating: number; title: string | null; content: string;
  author: string | null; url: string | null; publishedAt: Date;
  sourceLabel: string; sourceType: string;
};

export type ReviewStats = {
  googlePlacesEnabled: boolean;
  yelpEnabled: boolean;
  sources: ReviewSourceRow[];
  total: number;
  avgRating: number | null;
  /** Indice 0 = un voto, ... indice 4 = cinque voti. Su tutto lo storico. */
  distribution: number[];
  /** Ultimi 30 giorni vs i 30 prima: per dire se sta migliorando o peggiorando. */
  recentAvg: number | null;
  priorAvg: number | null;
  trend: { week: string; avgRating: number | null; n: number }[];
  recent: ReviewRow[];
};

export async function reviewStats(projectId: number, weeks = 12): Promise<ReviewStats> {
  const db = await getDb();

  const sourceRows = await db.select({
    id: reviewSources.id, type: reviewSources.type, identifier: reviewSources.identifier,
    label: reviewSources.label, country: reviewSources.country, lastFetchedAt: reviewSources.lastFetchedAt,
    total: sql<number>`count(${reviews.id})`,
    avgRating: sql<number | null>`avg(${reviews.rating})`,
  }).from(reviewSources)
    .leftJoin(reviews, eq(reviews.sourceId, reviewSources.id))
    .where(eq(reviewSources.projectId, projectId))
    .groupBy(reviewSources.id);

  const sources: ReviewSourceRow[] = sourceRows.map((s) => ({
    ...s, total: Number(s.total), avgRating: s.avgRating === null ? null : Math.round(Number(s.avgRating) * 100) / 100,
  }));

  const [totals] = await db.select({
    total: sql<number>`count(*)`, avg: sql<number | null>`avg(${reviews.rating})`,
  }).from(reviews).where(eq(reviews.projectId, projectId));

  const distRows = await db.select({ rating: reviews.rating, n: sql<number>`count(*)` })
    .from(reviews).where(eq(reviews.projectId, projectId)).groupBy(reviews.rating);
  const distribution = [0, 0, 0, 0, 0];
  for (const r of distRows) { const i = Number(r.rating) - 1; if (i >= 0 && i < 5) distribution[i] = Number(r.n); }

  const since30 = new Date(Date.now() - 30 * 86400_000);
  const since60 = new Date(Date.now() - 60 * 86400_000);
  const [recentP] = await db.select({ avg: sql<number | null>`avg(${reviews.rating})` }).from(reviews)
    .where(and(eq(reviews.projectId, projectId), gte(reviews.publishedAt, since30)));
  const [priorP] = await db.select({ avg: sql<number | null>`avg(${reviews.rating})` }).from(reviews)
    .where(and(eq(reviews.projectId, projectId), gte(reviews.publishedAt, since60), sql`${reviews.publishedAt} < ${since30}`));

  const since = new Date(Date.now() - weeks * 7 * 86400_000);
  const trendRows = (await db.execute(sql`
    SELECT to_char(date_trunc('week', published_at AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS week,
      avg(rating) AS avg, count(*) AS n
    FROM reviews
    WHERE project_id = ${projectId} AND published_at >= ${since.toISOString()}::timestamptz
    GROUP BY 1 ORDER BY 1
  `)).rows as { week: string; avg: number | null; n: number }[];

  const recentRows = await db.select({
    id: reviews.id, rating: reviews.rating, title: reviews.title, content: reviews.content,
    author: reviews.author, url: reviews.url, publishedAt: reviews.publishedAt,
    sourceLabel: reviewSources.label, sourceType: reviewSources.type,
  }).from(reviews)
    .innerJoin(reviewSources, eq(reviewSources.id, reviews.sourceId))
    .where(eq(reviews.projectId, projectId))
    .orderBy(desc(reviews.publishedAt))
    .limit(30);

  return {
    googlePlacesEnabled: googlePlacesEnabled(),
    yelpEnabled: yelpEnabled(),
    sources,
    total: Number(totals?.total ?? 0),
    avgRating: totals?.avg === null || totals?.avg === undefined ? null : Math.round(Number(totals.avg) * 100) / 100,
    distribution,
    recentAvg: recentP?.avg === null || recentP?.avg === undefined ? null : Math.round(Number(recentP.avg) * 100) / 100,
    priorAvg: priorP?.avg === null || priorP?.avg === undefined ? null : Math.round(Number(priorP.avg) * 100) / 100,
    trend: trendRows.map((r) => ({
      week: r.week, n: Number(r.n),
      avgRating: r.avg === null ? null : Math.round(Number(r.avg) * 100) / 100,
    })),
    recent: recentRows,
  };
}
