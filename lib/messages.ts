import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { KeyMessage } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Message pull-through — i TUOI messaggi chiave vengono ripresi o no?
//
// È la domanda che gli strumenti di listening rispondono peggio: misurano il
// volume, non se ciò che volevi dire è arrivato. Qui ogni messaggio porta con sé
// i suoi termini (espansi una volta sola dall'AI, poi riusati): il conteggio è
// SQL puro, quindi verificabile e a costo zero a ogni apertura.
// ---------------------------------------------------------------------------

const TZ = 'Europe/Rome';

export type MessageUptake = {
  id: string;
  text: string;
  terms: string[];
  /** Contenuti che riprendono il messaggio nella finestra. */
  mentions: number;
  /** Quota sul totale della copertura del periodo. */
  sharePct: number;
  sentiment: number | null;
  /** Fonti che lo hanno ripreso, per volume. */
  sources: { source: string; n: number }[];
  /** Andamento settimanale della ripresa. */
  weekly: { week: string; n: number }[];
  /** Esempi cliccabili (id delle mention). */
  examples: { id: number; title: string; source: string; date: string }[];
};

export type PullThrough = {
  days: number;
  totalCoverage: number;
  /** Contenuti che riprendono ALMENO un messaggio. */
  covered: number;
  /** Il numero che conta: quanta della tua copertura veicola i tuoi messaggi. */
  pullThroughPct: number;
  messages: MessageUptake[];
};

/** Condizione SQL "il testo contiene almeno uno dei termini del messaggio". */
function matchClause(terms: string[]) {
  const safe = terms.map((t) => t.trim()).filter(Boolean).slice(0, 12);
  if (safe.length === 0) return null;
  return sql.join(
    safe.map((t) => sql`(coalesce(title, '') || ' ' || content) ILIKE ${'%' + t + '%'}`),
    sql` OR `,
  );
}

export async function messagePullThrough(
  projectId: number, messages: KeyMessage[], days = 30,
): Promise<PullThrough> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [tot] = (await db.execute(sql`
    SELECT count(*) AS n FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
  `)).rows as { n: number }[];
  const totalCoverage = Number(tot?.n ?? 0);

  const out: MessageUptake[] = [];
  const allClauses = [];

  for (const m of messages) {
    const clause = matchClause(m.terms.length ? m.terms : [m.text]);
    if (!clause) {
      out.push({ ...m, mentions: 0, sharePct: 0, sentiment: null, sources: [], weekly: [], examples: [] });
      continue;
    }
    allClauses.push(clause);

    const [agg] = (await db.execute(sql`
      SELECT count(*) AS n, avg(sentiment_score) AS s FROM mentions
      WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz AND (${clause})
    `)).rows as { n: number; s: number | null }[];

    const sources = (await db.execute(sql`
      SELECT source, count(*) AS n FROM mentions
      WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz AND (${clause})
      GROUP BY source ORDER BY n DESC LIMIT 6
    `)).rows as { source: string; n: number }[];

    const weekly = (await db.execute(sql`
      SELECT to_char(date_trunc('week', published_at AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS week,
             count(*) AS n
      FROM mentions
      WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz AND (${clause})
      GROUP BY 1 ORDER BY 1
    `)).rows as { week: string; n: number }[];

    const examples = (await db.execute(sql`
      SELECT id, coalesce(title, left(content, 120)) AS title, source,
             to_char(published_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS date
      FROM mentions
      WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz AND (${clause})
      ORDER BY engagement_score DESC LIMIT 4
    `)).rows as { id: number; title: string; source: string; date: string }[];

    const n = Number(agg?.n ?? 0);
    out.push({
      ...m,
      mentions: n,
      sharePct: totalCoverage ? Math.round((n / totalCoverage) * 1000) / 10 : 0,
      sentiment: agg?.s == null ? null : Math.round(Number(agg.s) * 100) / 100,
      sources: sources.map((r) => ({ source: r.source, n: Number(r.n) })),
      weekly: weekly.map((r) => ({ week: r.week, n: Number(r.n) })),
      examples: examples.map((r) => ({ ...r, id: Number(r.id) })),
    });
  }

  // Copertura che veicola ALMENO un messaggio (non la somma: i messaggi si sovrappongono).
  let covered = 0;
  if (allClauses.length) {
    const any = sql.join(allClauses.map((c) => sql`(${c})`), sql` OR `);
    const [cov] = (await db.execute(sql`
      SELECT count(*) AS n FROM mentions
      WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz AND (${any})
    `)).rows as { n: number }[];
    covered = Number(cov?.n ?? 0);
  }

  return {
    days,
    totalCoverage,
    covered,
    pullThroughPct: totalCoverage ? Math.round((covered / totalCoverage) * 1000) / 10 : 0,
    messages: out.sort((a, b) => b.mentions - a.mentions),
  };
}
