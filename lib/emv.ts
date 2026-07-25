import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { NEWS_SOURCES } from '@/lib/connectors';

// ---------------------------------------------------------------------------
// Earned Media Value — "quanto vale in euro questa copertura?"
//
// È la domanda che arriva sempre dal management, ed è anche la metrica più
// abusata del settore: chi la vende come un numero preciso sta bluffando.
// Qui è dichiaratamente una STIMA, con ogni assunzione visibile a schermo e
// ogni cifra ricalcolabile a mano. Regole scelte per essere conservative:
//  - se conosciamo la reach reale la usiamo, altrimenti stimiamo per tipo fonte;
//  - la copertura NEGATIVA vale zero (non è valore, è esposizione: la mostriamo
//    a parte invece di gonfiare il totale, come fanno i modelli AVE classici);
//  - nessun "moltiplicatore PR" arbitrario (i famigerati ×3 dell'AVE).
// ---------------------------------------------------------------------------

/** Impression stimate quando la reach reale non è disponibile. */
const NEWS_BASE_IMPRESSIONS = 5_000;
const SOCIAL_ENGAGEMENT_MULTIPLIER = 30; // 1 interazione ≈ 30 visualizzazioni
const SOCIAL_MIN_IMPRESSIONS = 200;

/** Costo per mille impression (EUR), per tipo di fonte. */
const CPM_NEWS = 12;
const CPM_SOCIAL = 8;

/** Il sentiment pesa: il negativo non produce valore, lo contiamo a parte. */
const SENTIMENT_FACTOR: Record<string, number> = {
  positive: 1, neutral: 0.5, negative: 0,
};

export const EMV_ASSUMPTIONS = {
  newsBaseImpressions: NEWS_BASE_IMPRESSIONS,
  socialEngagementMultiplier: SOCIAL_ENGAGEMENT_MULTIPLIER,
  cpmNews: CPM_NEWS,
  cpmSocial: CPM_SOCIAL,
  factorPositive: SENTIMENT_FACTOR.positive,
  factorNeutral: SENTIMENT_FACTOR.neutral,
  factorNegative: SENTIMENT_FACTOR.negative,
};

export type EmvBySource = { source: string; items: number; impressions: number; emv: number };
export type EmvTopItem = {
  id: number; title: string; source: string; date: string;
  sentiment: string | null; impressions: number; emv: number;
};
export type EmvReport = {
  days: number;
  items: number;
  impressions: number;
  emv: number;
  /** Quota di impression con sentiment negativo: esposizione, non valore. */
  negativeImpressions: number;
  negativeItems: number;
  /** Quanti contenuti avevano una reach reale (il resto è stimato). */
  withRealReach: number;
  bySource: EmvBySource[];
  daily: { day: string; emv: number }[];
  top: EmvTopItem[];
};

const TZ = 'Europe/Rome';

/**
 * SQL condiviso: impression e valore per singola mention, così ogni riga del
 * report è ricalcolabile con le stesse regole (nessuna magia lato applicativo).
 */
function emvExpr() {
  const newsList = sql.join(NEWS_SOURCES.map((s) => sql`${s}`), sql`, `);
  // I cast espliciti servono: senza, i parametri numerici arrivano come testo
  // e Postgres rifiuta "double precision * text".
  const impressions = sql`
    CASE
      WHEN reach IS NOT NULL AND reach > 0 THEN reach::double precision
      WHEN source IN (${newsList}) THEN ${NEWS_BASE_IMPRESSIONS}::double precision
      ELSE GREATEST(${SOCIAL_MIN_IMPRESSIONS}::double precision,
                    engagement_score::double precision * ${SOCIAL_ENGAGEMENT_MULTIPLIER}::double precision)
    END`;
  const cpm = sql`CASE WHEN source IN (${newsList})
                       THEN ${CPM_NEWS}::double precision
                       ELSE ${CPM_SOCIAL}::double precision END`;
  const factor = sql`
    CASE coalesce(sentiment, 'neutral')
      WHEN 'positive' THEN ${SENTIMENT_FACTOR.positive}::double precision
      WHEN 'negative' THEN ${SENTIMENT_FACTOR.negative}::double precision
      ELSE ${SENTIMENT_FACTOR.neutral}::double precision
    END`;
  return { impressions, value: sql`(${impressions}) / 1000.0 * (${cpm}) * (${factor})` };
}

export async function emvReport(projectId: number, days = 30): Promise<EmvReport> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { impressions, value } = emvExpr();

  const [tot] = (await db.execute(sql`
    SELECT count(*) AS items,
           coalesce(sum(${impressions}), 0) AS impressions,
           coalesce(sum(${value}), 0) AS emv,
           count(*) FILTER (WHERE reach IS NOT NULL AND reach > 0) AS with_reach,
           count(*) FILTER (WHERE sentiment = 'negative') AS neg_items,
           coalesce(sum(${impressions}) FILTER (WHERE sentiment = 'negative'), 0) AS neg_impressions
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
  `)).rows as Record<string, number>[];

  const bySource = (await db.execute(sql`
    SELECT source, count(*) AS items,
           coalesce(sum(${impressions}), 0) AS impressions,
           coalesce(sum(${value}), 0) AS emv
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY source ORDER BY emv DESC
  `)).rows as Record<string, number | string>[];

  const daily = (await db.execute(sql`
    SELECT to_char(date_trunc('day', published_at AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day,
           coalesce(sum(${value}), 0) AS emv
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY 1 ORDER BY 1
  `)).rows as { day: string; emv: number }[];

  const top = (await db.execute(sql`
    SELECT id, coalesce(title, left(content, 120)) AS title, source, sentiment,
           to_char(published_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS date,
           (${impressions}) AS impressions, (${value}) AS emv
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    ORDER BY emv DESC LIMIT 12
  `)).rows as Record<string, string | number | null>[];

  return {
    days,
    items: Number(tot?.items ?? 0),
    impressions: Math.round(Number(tot?.impressions ?? 0)),
    emv: Math.round(Number(tot?.emv ?? 0)),
    negativeImpressions: Math.round(Number(tot?.neg_impressions ?? 0)),
    negativeItems: Number(tot?.neg_items ?? 0),
    withRealReach: Number(tot?.with_reach ?? 0),
    bySource: bySource.map((r) => ({
      source: String(r.source),
      items: Number(r.items),
      impressions: Math.round(Number(r.impressions)),
      emv: Math.round(Number(r.emv)),
    })),
    daily: daily.map((r) => ({ day: r.day, emv: Math.round(Number(r.emv)) })),
    top: top.map((r) => ({
      id: Number(r.id),
      title: String(r.title ?? ''),
      source: String(r.source),
      date: String(r.date),
      sentiment: r.sentiment === null ? null : String(r.sentiment),
      impressions: Math.round(Number(r.impressions)),
      emv: Math.round(Number(r.emv)),
    })),
  };
}
