import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { fetchArticles } from '@/lib/article-text';

/**
 * Scarica il testo degli articoli non ancora tentati, dai più recenti.
 *
 * Un tetto per giro tiene il passo educato verso le testate e la durata della
 * pipeline prevedibile: la coda si smaltisce nei giri successivi. `articleAt`
 * si marca SEMPRE, anche quando l'estrazione fallisce — un paywall o una pagina
 * irraggiungibile non deve essere ritentata a ogni ciclo per sempre.
 */
export async function enrichArticles(projectId: number, limit = 40): Promise<{
  tried: number; extracted: number;
}> {
  const db = await getDb();

  // I link Google News non portano alla testata (identificatore opaco risolto
  // via JavaScript): si segnano come tentati in blocco, così escono dalla coda
  // e non consumano il budget di richieste di ogni giro.
  await db.update(mentions).set({ articleAt: new Date() })
    .where(and(
      eq(mentions.projectId, projectId),
      isNull(mentions.articleAt),
      sql`${mentions.url} ILIKE '%news.google.%'`,
    ));

  const todo = await db.select({ id: mentions.id, url: mentions.url })
    .from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      eq(mentions.kind, 'article'),
      isNull(mentions.articleAt),
      isNotNull(mentions.url),
    ))
    .orderBy(desc(mentions.publishedAt))
    .limit(limit);

  const jobs = todo.filter((r): r is { id: number; url: string } => Boolean(r.url));
  if (jobs.length === 0) return { tried: 0, extracted: 0 };

  const texts = await fetchArticles(jobs);

  for (const job of jobs) {
    const text = texts.get(job.id);
    await db.update(mentions)
      .set({ articleAt: new Date(), ...(text ? { articleText: text } : {}) })
      .where(eq(mentions.id, job.id));
  }

  return { tried: jobs.length, extracted: texts.size };
}

/** Quanti articoli hanno il testo, per progetto: serve a mostrare la copertura. */
export async function articleCoverage(projectId: number): Promise<{
  articles: number; withText: number; posts: number;
}> {
  const db = await getDb();
  const [r] = await db.select({
    articles: sql<number>`count(*) FILTER (WHERE ${mentions.kind} = 'article')`,
    withText: sql<number>`count(*) FILTER (WHERE ${mentions.articleText} IS NOT NULL)`,
    posts: sql<number>`count(*) FILTER (WHERE ${mentions.kind} = 'post')`,
  }).from(mentions).where(eq(mentions.projectId, projectId));
  return {
    articles: Number(r?.articles ?? 0),
    withText: Number(r?.withText ?? 0),
    posts: Number(r?.posts ?? 0),
  };
}
