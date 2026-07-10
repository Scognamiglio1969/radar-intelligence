import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions, timelineEvents } from '@/lib/db/schema';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';
import { NEWS_SOURCES } from '@/lib/connectors';

export type TimelineEvent = typeof timelineEvents.$inferSelect;

const SYSTEM = `Sei un analista che mantiene la cronologia storica di un settore.
Ricevi i titoli delle news delle ultime 48 ore (con data). Estrai SOLO gli eventi salienti e databili:
annunci, lanci, acquisizioni, decisioni normative, polemiche rilevanti, dati/numeri importanti.
NON i temi generici, NON le opinioni. Massimo 3 eventi; se non c'è nulla di storico, restituisci [].
Per ogni evento: { "date": "YYYY-MM-DD", "title": "titolo secco in italiano (max 10 parole)",
"description": "1 frase di contesto in italiano", "importance": 1-3 (3 = svolta per il settore) }.
Rispondi SOLO con l'array JSON.`;

/** Estrae gli eventi delle ultime 48h e li aggiunge alla cronologia (mai sostituita). */
export async function extractTimelineEvents(projectId: number): Promise<number> {
  const db = await getDb();
  if (!claudeAvailable()) return 0;

  // Una estrazione al giorno basta
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [already] = await db.select({ id: timelineEvents.id }).from(timelineEvents)
    .where(and(eq(timelineEvents.projectId, projectId), gte(timelineEvents.createdAt, today)))
    .limit(1);
  if (already) return 0;

  const h48 = new Date(Date.now() - 48 * 3600_000);
  const news = await db.select({
    title: mentions.title, publishedAt: mentions.publishedAt, community: mentions.community,
  }).from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, h48),
      inArray(mentions.source, NEWS_SOURCES),
    ))
    .orderBy(desc(mentions.engagementScore), desc(mentions.publishedAt))
    .limit(60);
  if (news.length < 5) return 0;

  const existing = await db.select({ title: timelineEvents.title }).from(timelineEvents)
    .where(and(eq(timelineEvents.projectId, projectId), gte(timelineEvents.createdAt, new Date(Date.now() - 7 * 86400_000))));

  const payload = news.filter((n) => n.title).map((n) => ({
    data: n.publishedAt.toISOString().slice(0, 10),
    titolo: n.title!.slice(0, 150),
    testata: n.community,
  }));
  const text = await callClaude(
    MODELS.haiku, 'timeline_eventi', SYSTEM,
    `${existing.length ? `Eventi già registrati di recente (NON ripeterli): ${existing.map((e) => e.title).join(' | ')}\n\n` : ''}News:\n${JSON.stringify(payload).slice(0, 9000)}`,
    700,
  );
  if (!text) return 0;

  let events: { date: string; title: string; description?: string; importance?: number }[] = [];
  try {
    const start = text.indexOf('[');
    events = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1));
  } catch {
    return 0;
  }

  let created = 0;
  for (const e of events.slice(0, 3)) {
    if (!e.title || !/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '')) continue;
    await db.insert(timelineEvents).values({
      projectId,
      eventDate: e.date,
      title: e.title.slice(0, 200),
      description: e.description?.slice(0, 400) ?? null,
      importance: Math.max(1, Math.min(3, Number(e.importance) || 1)),
    });
    created++;
  }
  return created;
}

export async function getTimeline(projectId: number): Promise<TimelineEvent[]> {
  const db = await getDb();
  return db.select().from(timelineEvents)
    .where(eq(timelineEvents.projectId, projectId))
    .orderBy(desc(timelineEvents.eventDate), desc(timelineEvents.importance))
    .limit(120);
}
