import { desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { wikiPages, wikiEdits } from '@/lib/db/schema';
import { fetchRecentRevisions, isRevert, type WikiRevision } from './api';

const DAY_MS = 86400_000;
const WINDOW_DAYS = 91; // 13 settimane piene: basta per la baseline a 8 e i grafici settimanali

/** Ultime revisioni di ogni pagina seguita da un progetto, salvate una volta per sempre (immutabili). */
export async function ingestWikiEdits(projectId: number): Promise<{ tried: number; edits: number }> {
  const db = await getDb();
  const pages = await db.select().from(wikiPages).where(eq(wikiPages.projectId, projectId));
  let count = 0;

  for (const page of pages) {
    try {
      const revs = await fetchRecentRevisions(page.title, 50);
      if (revs.length) {
        const rows = revs.map((r) => ({
          projectId, pageId: page.id, revId: r.revId, user: r.user,
          isAnon: r.isAnon ? 1 : 0, isMinor: r.isMinor ? 1 : 0, comment: r.comment,
          size: r.size, sizeDiff: r.sizeDiff, tags: r.tags, timestamp: r.timestamp,
        }));
        await db.insert(wikiEdits).values(rows).onConflictDoNothing();
        count += rows.length;
      }
    } catch (e) {
      console.error(`[wikipedia] revisioni fallite per "${page.title}":`, e);
    }
    await db.update(wikiPages).set({ lastFetchedAt: new Date() }).where(eq(wikiPages.id, page.id));
  }
  return { tried: pages.length, edits: count };
}

export type WikiPageRow = { id: number; title: string; lastFetchedAt: Date | null; totalEdits: number };
export type WikiEditRow = WikiRevision & { pageTitle: string };
export type WikiActivity = {
  page: string;
  /** Modifiche negli ultimi 7 giorni vs la media settimanale delle 12 precedenti. */
  last7: number; baselineWeekly: number;
  elevated: boolean; // stessa soglia di volume_spike in lib/alerts.ts: max(3, 2.5x baseline)
  /** Ultimi 90 giorni: la "temperatura" della pagina, non solo la sua storia intera. */
  edits90: number;
  revertRate: number | null; // 0-100, null se non ci sono ancora modifiche nella finestra
  anonRate: number | null;
  distinctEditors: number;
};
/** Modifiche per settimana della pagina più attiva — un grafico dice più di cento righe di elenco. */
export type WikiWeekPoint = { week: string; total: number; reverts: number };
export type WikiStats = {
  pages: WikiPageRow[];
  recent: WikiEditRow[];
  activity: WikiActivity[];
  primaryPage: string | null;
  weekly: WikiWeekPoint[];
};

const weekKey = (d: Date) => {
  // Lunedì della settimana di d, in UTC — stabile indipendentemente dal fuso del server.
  const day = (d.getUTCDay() + 6) % 7; // 0 = lunedì
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
};

export async function wikiStats(projectId: number): Promise<WikiStats> {
  const db = await getDb();
  const now = new Date();

  const pageRows = await db.select({
    id: wikiPages.id, title: wikiPages.title, lastFetchedAt: wikiPages.lastFetchedAt,
    totalEdits: sql<number>`count(${wikiEdits.id})`,
  }).from(wikiPages)
    .leftJoin(wikiEdits, eq(wikiEdits.pageId, wikiPages.id))
    .where(eq(wikiPages.projectId, projectId))
    .groupBy(wikiPages.id);
  const pages: WikiPageRow[] = pageRows.map((p) => ({ ...p, totalEdits: Number(p.totalEdits) }));
  if (pages.length === 0) return { pages: [], recent: [], activity: [], primaryPage: null, weekly: [] };

  const recentRows = await db.select().from(wikiEdits)
    .innerJoin(wikiPages, eq(wikiPages.id, wikiEdits.pageId))
    .where(eq(wikiEdits.projectId, projectId))
    .orderBy(desc(wikiEdits.timestamp))
    .limit(60);
  const recent: WikiEditRow[] = recentRows.map((r) => ({
    revId: r.wiki_edits.revId, user: r.wiki_edits.user, isAnon: r.wiki_edits.isAnon === 1,
    isMinor: r.wiki_edits.isMinor === 1, comment: r.wiki_edits.comment, size: r.wiki_edits.size,
    sizeDiff: r.wiki_edits.sizeDiff, tags: r.wiki_edits.tags, timestamp: r.wiki_edits.timestamp,
    pageTitle: r.wiki_pages.title,
  }));

  // Una sola query per tutte le pagine del progetto, poi si raggruppa in JS:
  // più semplice ed economico di una query per pagina per ogni aggregato.
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const windowRows = await db.select({
    pageId: wikiEdits.pageId, user: wikiEdits.user, isAnon: wikiEdits.isAnon,
    tags: wikiEdits.tags, timestamp: wikiEdits.timestamp,
  }).from(wikiEdits)
    .where(gte(wikiEdits.timestamp, since));

  const since1w = new Date(now.getTime() - 7 * DAY_MS);
  const since13w = new Date(now.getTime() - 91 * DAY_MS);

  const activity: WikiActivity[] = pages.map((page) => {
    const rows = windowRows.filter((r) => r.pageId === page.id);
    const last7 = rows.filter((r) => r.timestamp >= since1w).length;
    const priorRows = rows.filter((r) => r.timestamp >= since13w && r.timestamp < since1w);
    const baselineWeekly = priorRows.length / 12;
    const reverts = rows.filter((r) => isRevert({ tags: r.tags })).length;
    const anons = rows.filter((r) => r.isAnon === 1).length;
    return {
      page: page.title,
      last7, baselineWeekly: Math.round(baselineWeekly * 10) / 10,
      elevated: last7 > Math.max(3, 2.5 * baselineWeekly),
      edits90: rows.length,
      revertRate: rows.length ? Math.round((reverts / rows.length) * 100) : null,
      anonRate: rows.length ? Math.round((anons / rows.length) * 100) : null,
      distinctEditors: new Set(rows.map((r) => r.user)).size,
    };
  });

  // Grafico settimanale: solo per la pagina con più storia, come la timeline di
  // Sport si riferisce a una sola squadra — sommare pagine diverse non
  // vorrebbe dire niente.
  const primary = [...pages].sort((a, b) => b.totalEdits - a.totalEdits)[0] ?? null;
  const weeklyMap = new Map<string, { total: number; reverts: number }>();
  if (primary) {
    for (const r of windowRows) {
      if (r.pageId !== primary.id) continue;
      const key = weekKey(r.timestamp);
      const bucket = weeklyMap.get(key) ?? { total: 0, reverts: 0 };
      bucket.total += 1;
      if (isRevert({ tags: r.tags })) bucket.reverts += 1;
      weeklyMap.set(key, bucket);
    }
  }
  const weekly: WikiWeekPoint[] = [...weeklyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, total: v.total, reverts: v.reverts }));

  return { pages, recent, activity, primaryPage: primary?.title ?? null, weekly };
}

export { isRevert };
export { searchWikiPages } from './api';
