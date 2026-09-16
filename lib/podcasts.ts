import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Podcast: le trasmissioni che tornano sul tema.
//
// Un episodio da solo è una menzione come le altre. Quello che l'audio
// racconta in più è la RICORRENZA: uno show che ne parla ogni settimana è una
// voce del dibattito, uno che ne ha parlato una volta è un caso.
// ---------------------------------------------------------------------------

/** "Tech Talk · 60 min" → "Tech Talk": la durata è dell'episodio, non dello show. */
export const showName = (community: string | null) => (community ?? '').replace(/\s·\s\d+\smin$/, '').trim() || '—';
export const episodeMinutes = (community: string | null) => {
  const m = /·\s(\d+)\smin$/.exec(community ?? '');
  return m ? Number(m[1]) : null;
};

export type ShowRow = {
  name: string; episodes: number; minutes: number; languages: string[];
  lastAt: Date; firstAt: Date; recurring: boolean;
};

export async function podcastData(projectId: number, days = 90) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db.select({
    id: mentions.id, title: mentions.title, content: mentions.content, url: mentions.url,
    community: mentions.community, author: mentions.author, language: mentions.language,
    publishedAt: mentions.publishedAt,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), eq(mentions.source, 'podcastindex'), gte(mentions.publishedAt, since)))
    .orderBy(desc(mentions.publishedAt)).limit(2000);

  const shows = new Map<string, ShowRow>();
  const langs = new Map<string, number>();
  let minutes = 0;
  for (const r of rows) {
    const name = showName(r.community);
    const mins = episodeMinutes(r.community) ?? 0;
    minutes += mins;
    const s = shows.get(name) ?? { name, episodes: 0, minutes: 0, languages: [], lastAt: r.publishedAt, firstAt: r.publishedAt, recurring: false };
    s.episodes++;
    s.minutes += mins;
    if (r.language && !s.languages.includes(r.language)) s.languages.push(r.language);
    if (r.publishedAt > s.lastAt) s.lastAt = r.publishedAt;
    if (r.publishedAt < s.firstAt) s.firstAt = r.publishedAt;
    shows.set(name, s);
    if (r.language) langs.set(r.language, (langs.get(r.language) ?? 0) + 1);
  }
  // Ricorrente: almeno tre episodi sul tema, distribuiti su più di due settimane.
  const showRows = [...shows.values()].map((s) => ({
    ...s, recurring: s.episodes >= 3 && s.lastAt.getTime() - s.firstAt.getTime() > 14 * 86400_000,
  })).sort((a, b) => b.episodes - a.episodes || b.lastAt.getTime() - a.lastAt.getTime());

  return {
    days,
    episodes: rows.length,
    hours: Math.round(minutes / 60),
    shows: showRows.slice(0, 30),
    recurring: showRows.filter((s) => s.recurring).length,
    languages: [...langs.entries()].map(([language, n]) => ({ language, n })).sort((a, b) => b.n - a.n),
    latest: rows.slice(0, 30),
  };
}
