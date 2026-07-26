import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { benchmarkEntities, searchInterest } from '@/lib/db/schema';
import { fetchSearchInterest } from './google-trends';

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Interesse di ricerca per tutte le entità di benchmark di un progetto, in
 * UNA sola chiamata a Google Trends (fino a 5 termini insieme, già scalati
 * l'uno sull'altro). Al massimo una volta al giorno per progetto: endpoint
 * non documentato, non c'è motivo di interrogarlo più spesso di quanto i dati
 * cambino in modo osservabile.
 */
export async function ingestSearchInterest(projectId: number): Promise<{ tried: number; points: number }> {
  const db = await getDb();
  const entities = await db.select().from(benchmarkEntities)
    .where(eq(benchmarkEntities.projectId, projectId))
    .orderBy(asc(benchmarkEntities.id))
    .limit(5);
  if (entities.length === 0) return { tried: 0, points: 0 };

  const [already] = await db.select({ id: searchInterest.id }).from(searchInterest)
    .where(and(inArray(searchInterest.entityId, entities.map((e) => e.id)), eq(searchInterest.date, todayKey())));
  if (already) return { tried: entities.length, points: 0 };

  const terms = entities.map((e) => e.keywords[0] ?? e.name);
  const points = await fetchSearchInterest(terms);
  if (points.length === 0) return { tried: entities.length, points: 0 };

  const rows = points.flatMap((p) =>
    entities.map((e, i) => ({ entityId: e.id, date: p.date, value: p.values[i] ?? 0 })));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(searchInterest).values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [searchInterest.entityId, searchInterest.date],
        set: { value: sql`excluded.value` },
      });
  }
  return { tried: entities.length, points: rows.length };
}

export type SearchInterestSeries = { entityId: number; name: string; points: { date: string; value: number }[] };

/** Serie di interesse di ricerca per le entità di un progetto, per il grafico "Share of search". */
export async function searchInterestData(projectId: number): Promise<SearchInterestSeries[]> {
  const db = await getDb();
  const entities = await db.select().from(benchmarkEntities)
    .where(eq(benchmarkEntities.projectId, projectId))
    .orderBy(asc(benchmarkEntities.id))
    .limit(5);
  if (entities.length === 0) return [];

  const rows = await db.select().from(searchInterest)
    .where(inArray(searchInterest.entityId, entities.map((e) => e.id)))
    .orderBy(asc(searchInterest.date));

  return entities.map((e) => ({
    entityId: e.id, name: e.name,
    points: rows.filter((r) => r.entityId === e.id).map((r) => ({ date: String(r.date), value: r.value })),
  }));
}
