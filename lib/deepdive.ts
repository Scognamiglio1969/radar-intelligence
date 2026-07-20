import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { normSentimentValue } from '@/lib/data';

// Deep-dive per fonte: una LENTE sugli stessi dati del progetto (stesse mention,
// solo filtrate per canale e confrontate col totale). Ogni numero del deep-dive
// è un sottoinsieme verificabile dei numeri complessivi del progetto.

const TZ = 'Europe/Rome';

export type SentDist = { positive: number; neutral: number; negative: number };

function foldSentiment(rows: { sentiment: string | null; n: number }[]): SentDist {
  const out: SentDist = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) out[normSentimentValue(r.sentiment)] += Number(r.n);
  return out;
}

export async function sourceDeepDive(projectId: number, source: string) {
  const db = await getDb();
  const d7 = new Date(Date.now() - 7 * 86400_000);
  const d14 = new Date(Date.now() - 14 * 86400_000);
  const d30 = new Date(Date.now() - 30 * 86400_000);
  const inSource = eq(mentions.source, source);
  const inProject = eq(mentions.projectId, projectId);

  // --- KPI 7 giorni: canale vs progetto intero -----------------------------
  const [kpiSrc] = await db.select({
    n: sql<number>`count(*)`,
    avgSentiment: sql<number | null>`avg(${mentions.sentimentScore})`,
    authors: sql<number>`count(DISTINCT coalesce(${mentions.authorHandle}, ${mentions.author}))`,
  }).from(mentions).where(and(inProject, inSource, gte(mentions.publishedAt, d7)));

  const [kpiAll] = await db.select({
    n: sql<number>`count(*)`,
    avgSentiment: sql<number | null>`avg(${mentions.sentimentScore})`,
  }).from(mentions).where(and(inProject, gte(mentions.publishedAt, d7)));

  // --- Volume giornaliero 14 giorni: canale e totale -----------------------
  const volume = await db.execute(sql`
    SELECT to_char(date_trunc('day', published_at), 'YYYY-MM-DD') AS day,
           count(*) AS total,
           count(*) FILTER (WHERE source = ${source}) AS src
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${d14.toISOString()}::timestamptz
    GROUP BY 1 ORDER BY 1
  `);

  // --- Distribuzione sentiment 7 giorni: canale vs totale ------------------
  const sentSrc = await db.select({ sentiment: mentions.sentiment, n: sql<number>`count(*)` })
    .from(mentions)
    .where(and(inProject, inSource, gte(mentions.publishedAt, d7), isNotNull(mentions.sentiment)))
    .groupBy(mentions.sentiment);
  const sentAll = await db.select({ sentiment: mentions.sentiment, n: sql<number>`count(*)` })
    .from(mentions)
    .where(and(inProject, gte(mentions.publishedAt, d7), isNotNull(mentions.sentiment)))
    .groupBy(mentions.sentiment);

  // --- Topic del canale (30gg) con il loro peso sul totale ------------------
  const topics = await db.execute(sql`
    WITH src_topics AS (
      SELECT t AS topic, count(*) AS n_src
      FROM mentions, jsonb_array_elements_text(topics) AS t
      WHERE project_id = ${projectId} AND source = ${source}
        AND published_at >= ${d30.toISOString()}::timestamptz
      GROUP BY t
    ),
    all_topics AS (
      SELECT t AS topic, count(*) AS n_all
      FROM mentions, jsonb_array_elements_text(topics) AS t
      WHERE project_id = ${projectId}
        AND published_at >= ${d30.toISOString()}::timestamptz
      GROUP BY t
    )
    SELECT s.topic, s.n_src, a.n_all
    FROM src_topics s JOIN all_topics a USING (topic)
    ORDER BY s.n_src DESC LIMIT 12
  `);

  // --- Top autori del canale (30gg) ----------------------------------------
  const authors = await db.execute(sql`
    SELECT coalesce(author_handle, author) AS author,
           count(*) AS n,
           avg(sentiment_score) AS avg_sent,
           sum(engagement_score) AS engagement
    FROM mentions
    WHERE project_id = ${projectId} AND source = ${source}
      AND published_at >= ${d30.toISOString()}::timestamptz
      AND coalesce(author_handle, author) IS NOT NULL
    GROUP BY 1 ORDER BY n DESC, engagement DESC LIMIT 12
  `);

  // --- Trend emergenti del canale: topic ultimi 7g vs 14g precedenti -------
  const emerging = await db.execute(sql`
    WITH recent AS (
      SELECT t AS topic, count(*) AS n_now
      FROM mentions, jsonb_array_elements_text(topics) AS t
      WHERE project_id = ${projectId} AND source = ${source}
        AND published_at >= ${d7.toISOString()}::timestamptz
      GROUP BY t
    ),
    previous AS (
      SELECT t AS topic, count(*) AS n_prev
      FROM mentions, jsonb_array_elements_text(topics) AS t
      WHERE project_id = ${projectId} AND source = ${source}
        AND published_at >= ${new Date(Date.now() - 21 * 86400_000).toISOString()}::timestamptz
        AND published_at < ${d7.toISOString()}::timestamptz
      GROUP BY t
    )
    SELECT r.topic, r.n_now, coalesce(p.n_prev, 0) AS n_prev,
           r.n_now::float / greatest(coalesce(p.n_prev, 0) / 2.0, 0.5) AS growth
    FROM recent r LEFT JOIN previous p USING (topic)
    WHERE r.n_now >= 2
    ORDER BY growth DESC, r.n_now DESC LIMIT 8
  `);

  // --- Identikit del canale --------------------------------------------------
  const [peak] = (await db.execute(sql`
    SELECT EXTRACT(DOW FROM (published_at AT TIME ZONE ${TZ}))::int AS dow,
           EXTRACT(HOUR FROM (published_at AT TIME ZONE ${TZ}))::int AS hour,
           count(*) AS n
    FROM mentions
    WHERE project_id = ${projectId} AND source = ${source}
      AND published_at >= ${d30.toISOString()}::timestamptz
    GROUP BY 1, 2 ORDER BY n DESC LIMIT 1
  `)).rows as { dow: number; hour: number; n: number }[];

  const languages = await db.execute(sql`
    SELECT language, count(*) AS n
    FROM mentions
    WHERE project_id = ${projectId} AND source = ${source}
      AND published_at >= ${d30.toISOString()}::timestamptz AND language IS NOT NULL
    GROUP BY 1 ORDER BY n DESC LIMIT 3
  `);

  const [conc] = (await db.execute(sql`
    WITH per_author AS (
      SELECT coalesce(author_handle, author) AS a, count(*) AS n
      FROM mentions
      WHERE project_id = ${projectId} AND source = ${source}
        AND published_at >= ${d30.toISOString()}::timestamptz
        AND coalesce(author_handle, author) IS NOT NULL
      GROUP BY 1
    )
    SELECT sum(n) AS total,
           (SELECT sum(n) FROM (SELECT n FROM per_author ORDER BY n DESC LIMIT 3) top3) AS top3
    FROM per_author
  `)).rows as { total: number | null; top3: number | null }[];

  const [rel] = (await db.execute(sql`
    SELECT avg(relevance) FILTER (WHERE source = ${source}) AS rel_src,
           avg(relevance) AS rel_all
    FROM mentions
    WHERE project_id = ${projectId}
      AND published_at >= ${d30.toISOString()}::timestamptz AND relevance IS NOT NULL
  `)).rows as { rel_src: number | null; rel_all: number | null }[];

  // --- Dove il canale dissente: sentiment per topic, canale vs resto --------
  const disagreements = await db.execute(sql`
    WITH per_topic AS (
      SELECT t AS topic,
             avg(sentiment_score) FILTER (WHERE source = ${source}) AS s_src,
             count(*) FILTER (WHERE source = ${source}) AS n_src,
             avg(sentiment_score) FILTER (WHERE source <> ${source}) AS s_rest,
             count(*) FILTER (WHERE source <> ${source}) AS n_rest
      FROM mentions, jsonb_array_elements_text(topics) AS t
      WHERE project_id = ${projectId} AND sentiment_score IS NOT NULL
        AND published_at >= ${d30.toISOString()}::timestamptz
      GROUP BY t
    )
    SELECT topic, s_src, n_src, s_rest, n_rest, abs(s_src - s_rest) AS gap
    FROM per_topic
    WHERE n_src >= 3 AND n_rest >= 3 AND s_src IS NOT NULL AND s_rest IS NOT NULL
    ORDER BY gap DESC LIMIT 6
  `);

  // --- Ultime mention del canale -------------------------------------------
  const latest = await db.select().from(mentions)
    .where(and(inProject, inSource))
    .orderBy(desc(mentions.publishedAt)).limit(8);

  return {
    kpi: {
      src7: Number(kpiSrc.n),
      all7: Number(kpiAll.n),
      share: Number(kpiAll.n) > 0 ? Number(kpiSrc.n) / Number(kpiAll.n) : 0,
      avgSentimentSrc: kpiSrc.avgSentiment === null ? null : Number(kpiSrc.avgSentiment),
      avgSentimentAll: kpiAll.avgSentiment === null ? null : Number(kpiAll.avgSentiment),
      authors7: Number(kpiSrc.authors),
    },
    volume: (volume.rows as { day: string; total: number; src: number }[])
      .map((r) => ({ day: r.day, total: Number(r.total), src: Number(r.src) })),
    sentimentSrc: foldSentiment(sentSrc as { sentiment: string | null; n: number }[]),
    sentimentAll: foldSentiment(sentAll as { sentiment: string | null; n: number }[]),
    topics: (topics.rows as { topic: string; n_src: number; n_all: number }[])
      .map((r) => ({ topic: r.topic, nSrc: Number(r.n_src), nAll: Number(r.n_all) })),
    authors: (authors.rows as { author: string; n: number; avg_sent: number | null; engagement: number | null }[])
      .map((r) => ({
        author: r.author, n: Number(r.n),
        avgSent: r.avg_sent === null ? null : Number(r.avg_sent),
        engagement: Number(r.engagement ?? 0),
      })),
    emerging: (emerging.rows as { topic: string; n_now: number; n_prev: number; growth: number }[])
      .map((r) => ({
        topic: r.topic, nNow: Number(r.n_now), nPrev: Number(r.n_prev), growth: Number(r.growth),
      })),
    character: {
      peak: peak ? { dow: Number(peak.dow), hour: Number(peak.hour), n: Number(peak.n) } : null,
      languages: (languages.rows as { language: string; n: number }[])
        .map((r) => ({ language: r.language, n: Number(r.n) })),
      authorsTotal: Number(conc?.total ?? 0),
      top3Share: conc?.total ? Number(conc.top3 ?? 0) / Number(conc.total) : null,
      relevanceSrc: rel?.rel_src === null || rel?.rel_src === undefined ? null : Number(rel.rel_src),
      relevanceAll: rel?.rel_all === null || rel?.rel_all === undefined ? null : Number(rel.rel_all),
    },
    disagreements: (disagreements.rows as {
      topic: string; s_src: number; n_src: number; s_rest: number; n_rest: number; gap: number;
    }[]).map((r) => ({
      topic: r.topic, sSrc: Number(r.s_src), nSrc: Number(r.n_src),
      sRest: Number(r.s_rest), nRest: Number(r.n_rest), gap: Number(r.gap),
    })),
    latest,
  };
}
