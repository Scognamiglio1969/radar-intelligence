import { and, desc, eq, gte, isNotNull, notInArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions, narratives } from '@/lib/db/schema';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';
import { NEWS_SOURCES } from '@/lib/connectors';

export type Narrative = typeof narratives.$inferSelect;

const SYSTEM = `Sei un analista di information intelligence. Ricevi post social (con autore) sullo stesso settore.
Individua le NARRAZIONI: gruppi di messaggi che spingono la stessa tesi o inquadratura (anche in lingue diverse).
Per ogni narrazione restituisci:
- title: nome della narrazione in italiano (max 8 parole)
- description: 1-2 frasi in italiano: qual è la tesi e come viene argomentata
- stance: "positiva", "negativa", "neutra" o "polarizzante" rispetto al settore
- coordinated: true SOLO se ci sono segnali di coordinamento (stessi messaggi quasi identici da account diversi, ripetizione innaturale); altrimenti false
- accounts: gli autori più attivi nella narrazione (max 6 handle)
- ids: gli id dei post appartenenti
Includi solo narrazioni con almeno 3 post. Rispondi SOLO con un array JSON.`;

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('[');
  if (start === -1) return null;
  try {
    return JSON.parse(cleaned.slice(start, cleaned.lastIndexOf(']') + 1)) as T;
  } catch {
    return null;
  }
}

/** Rileva le narrazioni sui post social delle ultime 48h (giro giornaliero). */
export async function detectNarratives(projectId: number): Promise<number> {
  const db = await getDb();
  if (!claudeAvailable()) return 0;
  const h48 = new Date(Date.now() - 48 * 3600_000);

  const posts = await db.select({
    id: mentions.id, content: mentions.content, author: mentions.authorHandle,
    source: mentions.source,
  }).from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, h48),
      notInArray(mentions.source, NEWS_SOURCES),
      isNotNull(mentions.authorHandle),
    ))
    .orderBy(desc(mentions.engagementScore))
    .limit(70);
  if (posts.length < 8) return 0;

  const payload = posts.map((p) => ({
    id: p.id, autore: p.author, fonte: p.source, testo: p.content.slice(0, 220),
  }));
  const text = await callClaude(MODELS.sonnet, 'narrazioni', SYSTEM, JSON.stringify(payload), 2500);
  const groups = parseJson<{
    title: string; description: string; stance: string; coordinated: boolean;
    accounts: string[]; ids: number[];
  }[]>(text);
  if (!groups) return 0;

  // Fotografia giornaliera: si sostituisce a ogni rilevamento
  await db.delete(narratives).where(eq(narratives.projectId, projectId));
  let created = 0;
  for (const g of groups) {
    const validIds = (g.ids ?? []).filter((id) => posts.some((p) => p.id === id));
    if (validIds.length < 3 || !g.title) continue;
    await db.insert(narratives).values({
      projectId,
      title: g.title,
      description: g.description ?? null,
      stance: ['positiva', 'negativa', 'neutra', 'polarizzante'].includes(g.stance) ? g.stance : 'neutra',
      coordinated: g.coordinated ? 1 : 0,
      accounts: (g.accounts ?? []).slice(0, 6),
      mentionCount: validIds.length,
    });
    created++;
  }
  return created;
}

export async function getNarratives(projectId: number): Promise<Narrative[]> {
  const db = await getDb();
  return db.select().from(narratives)
    .where(eq(narratives.projectId, projectId))
    .orderBy(desc(sql`${narratives.coordinated}`), desc(narratives.mentionCount));
}
