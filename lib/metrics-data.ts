import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions, metricPoints } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Le interrogazioni che alimentano i grafici sulle misure.
//
// Tutto in SQL: nessun modello tocca questi numeri. È la stessa regola del
// Point of View — l'AI interpreta, non calcola — applicata a dati che qui
// arrivano da fogli di calcolo invece che dallo scraping.
// ---------------------------------------------------------------------------

export type Series = { name: string; points: { date: string; value: number }[] };
export type Ranked = { name: string; value: number };

/** Che misure esistono in questo progetto, e quanto sono ricche. */
export async function metricCatalog(projectId: number): Promise<{
  metric: string; entities: number; points: number; from: string; to: string;
}[]> {
  const db = await getDb();
  const rows = await db.select({
    metric: metricPoints.metric,
    entities: sql<number>`count(distinct ${metricPoints.entity})`,
    points: sql<number>`count(*)`,
    from: sql<string>`to_char(min(${metricPoints.date}), 'YYYY-MM-DD')`,
    to: sql<string>`to_char(max(${metricPoints.date}), 'YYYY-MM-DD')`,
  }).from(metricPoints)
    .where(eq(metricPoints.projectId, projectId))
    .groupBy(metricPoints.metric)
    .orderBy(sql`count(*) desc`);
  return rows.map((r) => ({ ...r, entities: Number(r.entities), points: Number(r.points) }));
}

/** Le entità presenti, per lasciar scegliere che cosa confrontare. */
export async function metricEntities(projectId: number): Promise<{ entity: string; points: number }[]> {
  const db = await getDb();
  const rows = await db.select({
    entity: metricPoints.entity, points: sql<number>`count(*)`,
  }).from(metricPoints)
    .where(eq(metricPoints.projectId, projectId))
    .groupBy(metricPoints.entity).orderBy(sql`count(*) desc`);
  return rows.map((r) => ({ entity: r.entity, points: Number(r.points) }));
}

/**
 * Una serie per METRICA nel tempo: è la forma della crescita follower per
 * piattaforma, dove ogni piattaforma è una colonna del foglio e quindi una
 * metrica a sé.
 */
export async function seriesByMetric(
  projectId: number, metrics: string[], entity?: string,
): Promise<Series[]> {
  if (!metrics.length) return [];
  const db = await getDb();
  const rows = await db.select({
    metric: metricPoints.metric,
    day: sql<string>`to_char(${metricPoints.date}, 'YYYY-MM-DD')`,
    value: sql<number>`sum(${metricPoints.value})`,
  }).from(metricPoints)
    .where(and(
      eq(metricPoints.projectId, projectId),
      sql`${metricPoints.metric} in ${metrics}`,
      ...(entity ? [eq(metricPoints.entity, entity)] : []),
    ))
    .groupBy(metricPoints.metric, sql`2`)
    .orderBy(sql`2`);

  const out = new Map<string, Series>();
  for (const r of rows) {
    if (!out.has(r.metric)) out.set(r.metric, { name: r.metric, points: [] });
    out.get(r.metric)!.points.push({ date: r.day, value: Number(r.value) });
  }
  // Ordine per grandezza: la serie più importante prende il primo colore.
  return [...out.values()].sort((a, b) =>
    Math.max(...b.points.map((p) => p.value)) - Math.max(...a.points.map((p) => p.value)));
}

/** Una serie per ENTITÀ su una sola metrica: il confronto fra manager o canali. */
export async function seriesByEntity(
  projectId: number, metric: string, entities?: string[],
): Promise<Series[]> {
  const db = await getDb();
  const rows = await db.select({
    entity: metricPoints.entity,
    day: sql<string>`to_char(${metricPoints.date}, 'YYYY-MM-DD')`,
    value: sql<number>`sum(${metricPoints.value})`,
  }).from(metricPoints)
    .where(and(
      eq(metricPoints.projectId, projectId),
      eq(metricPoints.metric, metric),
      ...(entities?.length ? [sql`${metricPoints.entity} in ${entities}`] : []),
    ))
    .groupBy(metricPoints.entity, sql`2`)
    .orderBy(sql`2`);

  const out = new Map<string, Series>();
  for (const r of rows) {
    if (!out.has(r.entity)) out.set(r.entity, { name: r.entity, points: [] });
    out.get(r.entity)!.points.push({ date: r.day, value: Number(r.value) });
  }
  return [...out.values()];
}

/**
 * Classifica delle entità su una metrica.
 *
 * L'aggregazione NON è sempre la somma: sommare un tasso di engagement mese
 * per mese dà un numero senza senso. Le medie e i tassi si mediano, i
 * conteggi si sommano, i totali cumulati (i follower) si prendono all'ultimo
 * valore. Sbagliare qui produce classifiche plausibili e false.
 */
export type Agg = 'sum' | 'avg' | 'last';

export function defaultAgg(metric: string): Agg {
  if (/(rate|%|perc|media|avg|medi[oa]|ratio|tasso)/i.test(metric)) return 'avg';
  if (/(follower|iscritti|totale|total|subscriber)/i.test(metric)) return 'last';
  return 'sum';
}

export async function rankEntities(
  projectId: number, metric: string, agg: Agg = defaultAgg(metric), limit = 12,
): Promise<Ranked[]> {
  const db = await getDb();
  if (agg === 'last') {
    // L'ultimo valore per entità: distinct on è il modo diretto in Postgres.
    const rows = await db.execute(sql`
      select distinct on (entity) entity, value
      from metric_points
      where project_id = ${projectId} and metric = ${metric}
      order by entity, date desc
    `);
    return (rows.rows as { entity: string; value: number }[])
      .map((r) => ({ name: r.entity, value: Number(r.value) }))
      .sort((a, b) => b.value - a.value).slice(0, limit);
  }
  const rows = await db.select({
    entity: metricPoints.entity,
    value: agg === 'avg'
      ? sql<number>`avg(${metricPoints.value})`
      : sql<number>`sum(${metricPoints.value})`,
  }).from(metricPoints)
    .where(and(eq(metricPoints.projectId, projectId), eq(metricPoints.metric, metric)))
    .groupBy(metricPoints.entity).orderBy(sql`2 desc`).limit(limit);
  return rows.map((r) => ({ name: r.entity, value: Number(r.value) }));
}

/** Composizione: quanto pesa ogni metrica sul totale (il mix di pubblicazione). */
export async function metricMix(projectId: number, metrics: string[]): Promise<Ranked[]> {
  if (!metrics.length) return [];
  const db = await getDb();
  const rows = await db.select({
    metric: metricPoints.metric, value: sql<number>`sum(${metricPoints.value})`,
  }).from(metricPoints)
    .where(and(eq(metricPoints.projectId, projectId), sql`${metricPoints.metric} in ${metrics}`))
    .groupBy(metricPoints.metric).orderBy(sql`2 desc`);
  return rows.map((r) => ({ name: r.metric, value: Number(r.value) }));
}

/**
 * Ripartizione per una DIMENSIONE: la torta dell'audience per azienda, ruolo
 * o città. Le dimensioni vivono in un oggetto JSON, quindi la chiave si passa
 * come parametro e non come colonna.
 */
export async function breakdownByDim(
  projectId: number, dim: string, metric?: string, limit = 12,
): Promise<Ranked[]> {
  const db = await getDb();
  const rows = await db.execute(sql`
    select ${metricPoints.dims} ->> ${dim} as key, avg(value) as value
    from metric_points
    where project_id = ${projectId}
      and ${metricPoints.dims} ->> ${dim} is not null
      ${metric ? sql`and metric = ${metric}` : sql``}
    group by 1 order by 2 desc limit ${limit}
  `);
  return (rows.rows as { key: string; value: number }[])
    .filter((r) => r.key)
    .map((r) => ({ name: r.key, value: Number(r.value) }));
}

/** Che dimensioni esistono, per popolare il selettore senza indovinare. */
export async function availableDims(projectId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.execute(sql`
    select distinct jsonb_object_keys(dims) as k
    from metric_points where project_id = ${projectId}
  `);
  return (rows.rows as { k: string }[]).map((r) => r.k).filter(Boolean).sort();
}

// --- Campi conservati: le dimensioni editoriali sulle MENTION ---------------

/** Che campi personalizzati porta il progetto (PILLAR, CAMPAGNA, area semantica…). */
export async function customFields(projectId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.execute(sql`
    select distinct jsonb_object_keys(custom) as k
    from mentions where project_id = ${projectId} and custom is not null
  `);
  return (rows.rows as { k: string }[]).map((r) => r.k).filter(Boolean).sort();
}

/**
 * Performance per campo conservato: quanti contenuti e quanto engagement per
 * ogni pilastro editoriale, campagna o area semantica. È la domanda per cui
 * quelle colonne erano state compilate a mano.
 */
export async function performanceByCustom(
  projectId: number, field: string, limit = 12,
): Promise<{ name: string; posts: number; engagement: number; avgEngagement: number }[]> {
  const db = await getDb();
  const rows = await db.execute(sql`
    select ${mentions.custom} ->> ${field} as key,
           count(*) as posts,
           coalesce(sum(engagement_score), 0) as engagement
    from mentions
    where project_id = ${projectId} and ${mentions.custom} ->> ${field} is not null
    group by 1 order by 2 desc limit ${limit}
  `);
  return (rows.rows as { key: string; posts: number; engagement: number }[])
    .filter((r) => r.key)
    .map((r) => ({
      name: r.key,
      posts: Number(r.posts),
      engagement: Math.round(Number(r.engagement)),
      avgEngagement: Math.round(Number(r.engagement) / Math.max(1, Number(r.posts))),
    }));
}
