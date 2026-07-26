import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { wikiPages, wikiEdits } from '@/lib/db/schema';
import { fetchRecentRevisions, isRevert, type WikiRevision } from './api';

const DAY_MS = 86400_000;

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
  /** Modifiche negli ultimi 7 giorni vs la media settimanale delle 8 precedenti. */
  last7: number; baselineWeekly: number;
  elevated: boolean; // stessa soglia di volume_spike in lib/alerts.ts: max(3, 2.5x baseline)
};
export type WikiStats = {
  pages: WikiPageRow[];
  recent: WikiEditRow[];
  activity: WikiActivity[];
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
  if (pages.length === 0) return { pages: [], recent: [], activity: [] };

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

  const activity: WikiActivity[] = [];
  for (const page of pages) {
    const since9w = new Date(now.getTime() - 63 * DAY_MS);
    const since1w = new Date(now.getTime() - 7 * DAY_MS);
    const [{ n: last7 } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(wikiEdits)
      .where(and(eq(wikiEdits.pageId, page.id), gte(wikiEdits.timestamp, since1w)));
    const [{ n: prior } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(wikiEdits)
      .where(and(eq(wikiEdits.pageId, page.id), gte(wikiEdits.timestamp, since9w), lt(wikiEdits.timestamp, since1w)));
    const baselineWeekly = Number(prior) / 8;
    activity.push({
      page: page.title, last7: Number(last7), baselineWeekly: Math.round(baselineWeekly * 10) / 10,
      elevated: Number(last7) > Math.max(3, 2.5 * baselineWeekly),
    });
  }

  return { pages, recent, activity };
}

export { isRevert };
export { searchWikiPages } from './api';
