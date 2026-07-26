import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { linkedin } from '@/lib/connectors/linkedin';
import { facebook } from '@/lib/connectors/facebook';

const TZ = 'Europe/Rome';

/**
 * Fonti che portano i TUOI post, non ciò che altri dicono di te: la pagina
 * Facebook e la pagina aziendale LinkedIn, prese dalle rispettive API
 * ufficiali con le TUE credenziali (l'app non può leggere pagine di terzi
 * con questi connettori — è scritto nei loro stessi commenti). Instagram,
 * X, YouTube e tutto il resto restano earned anche quando cercano hashtag o
 * parole chiave sulla stessa piattaforma: cercare non è possedere.
 */
export const OWNED_SOURCES = ['linkedin', 'facebook'] as const;
export type OwnedSource = (typeof OWNED_SOURCES)[number];
const OWNED_CONNECTORS: Record<OwnedSource, { enabled(): boolean }> = { linkedin, facebook };

export type OwnedVsEarned = {
  /** Connettori owned con credenziali impostate — non necessariamente con dati raccolti. */
  configured: OwnedSource[];
  ownedVolume: number; earnedVolume: number;
  ownedEngagement: number; earnedEngagement: number;
  bySource: { source: OwnedSource; volume: number; engagement: number; avgEngagement: number }[];
  /** Attività dei soli canali owned: quando i tuoi post escono davvero. */
  heat: number[][];
};

export async function ownedVsEarned(projectId: number, days = 30): Promise<OwnedVsEarned> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const ownedList = sql.join(OWNED_SOURCES.map((s) => sql`${s}`), sql`, `);

  const configured = OWNED_SOURCES.filter((s) => OWNED_CONNECTORS[s].enabled());

  const [totals] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE source IN (${ownedList})) AS owned_n,
      count(*) FILTER (WHERE source NOT IN (${ownedList})) AS earned_n,
      coalesce(sum(engagement_score) FILTER (WHERE source IN (${ownedList})), 0) AS owned_eng,
      coalesce(sum(engagement_score) FILTER (WHERE source NOT IN (${ownedList})), 0) AS earned_eng
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
  `)).rows as { owned_n: number; earned_n: number; owned_eng: number; earned_eng: number }[];

  const bySourceRows = (await db.execute(sql`
    SELECT source, count(*) AS n, coalesce(sum(engagement_score), 0) AS eng
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
      AND source IN (${ownedList})
    GROUP BY source
  `)).rows as { source: OwnedSource; n: number; eng: number }[];
  const bySource = OWNED_SOURCES
    .map((s) => {
      const r = bySourceRows.find((x) => x.source === s);
      const volume = Number(r?.n ?? 0);
      const engagement = Math.round(Number(r?.eng ?? 0));
      return { source: s, volume, engagement, avgEngagement: volume ? Math.round(engagement / volume) : 0 };
    })
    .filter((s) => s.volume > 0 || configured.includes(s.source));

  const heatRows = (await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM (published_at AT TIME ZONE ${TZ}))::int AS dow,
      EXTRACT(HOUR FROM (published_at AT TIME ZONE ${TZ}))::int AS hour,
      count(*) AS n
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
      AND source IN (${ownedList})
    GROUP BY 1, 2
  `)).rows as { dow: number; hour: number; n: number }[];
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of heatRows) heat[Number(r.dow)][Number(r.hour)] = Number(r.n);

  return {
    configured,
    ownedVolume: Number(totals?.owned_n ?? 0),
    earnedVolume: Number(totals?.earned_n ?? 0),
    ownedEngagement: Math.round(Number(totals?.owned_eng ?? 0)),
    earnedEngagement: Math.round(Number(totals?.earned_eng ?? 0)),
    bySource,
    heat,
  };
}
