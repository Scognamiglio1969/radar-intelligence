import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { cfg } from '@/lib/connector-config';
import { factCheckData, factCheckEnabled } from '@/lib/factcheck';
import { trialsData } from '@/lib/trials';
import { podcastData } from '@/lib/podcasts';

// ---------------------------------------------------------------------------
// Riscontri: notizie, verifiche, evidenze e voci nella stessa pagina.
//
// Ogni sezione da sola risponde a una domanda. Messe insieme ne fanno una che
// nessuno strumento di listening pone: di quello che si sta dicendo, che cosa
// è già stato controllato, che cosa è smentito e gira lo stesso, che cosa
// corre più dell'evidenza, e su che cosa nessuno ha ancora verificato niente.
//
// Tutto calcolato, nessun modello: ogni riga rimanda alle menzioni o alle
// fonti che la provano.
// ---------------------------------------------------------------------------

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export type HotTopic = { topic: string; last7: number; prev7: number; growth: number | null; checked: number };

/** I temi della settimana, con quante verifiche li toccano. */
async function hotTopics(projectId: number, claims: string[]): Promise<HotTopic[]> {
  const db = await getDb();
  const res = await db.execute(sql`
    select t as topic,
      count(*) filter (where published_at >= now() - interval '7 days')::int as last7,
      count(*) filter (where published_at < now() - interval '7 days')::int as prev7
    from mentions, jsonb_array_elements_text(coalesce(topics, '[]'::jsonb)) as t
    where project_id = ${projectId} and published_at >= now() - interval '14 days'
    group by t
    having count(*) filter (where published_at >= now() - interval '7 days') >= 3
    order by 2 desc
    limit 20`);
  const folded = claims.map(fold);
  return (res.rows as { topic: string; last7: number; prev7: number }[]).map((r) => {
    const words = fold(r.topic).split(/\s+/).filter((w) => w.length >= 4);
    const checked = words.length
      ? folded.filter((c) => words.every((w) => c.includes(w))).length
      : 0;
    return {
      topic: r.topic,
      last7: Number(r.last7),
      prev7: Number(r.prev7),
      growth: Number(r.prev7) > 0 ? Math.round(((Number(r.last7) - Number(r.prev7)) / Number(r.prev7)) * 100) : null,
      checked,
    };
  });
}

export async function crossCheckData(projectId: number) {
  const db = await getDb();
  const [project] = await db.select({ mode: projects.mode, evidence: projects.evidenceTerms })
    .from(projects).where(eq(projects.id, projectId));
  const [facts, trials, pods] = await Promise.all([
    factCheckData(projectId), trialsData(projectId), podcastData(projectId),
  ]);
  const topics = await hotTopics(projectId, facts.claims.map((c) => c.claim));

  const debunked = facts.claims.filter((c) => c.signal === 'debunked-growing' || c.signal === 'debunked-circulating');
  // Somma delle menzioni settimanali che ripetono affermazioni smentite. Una
  // menzione può ripeterne più d'una: è un tetto, e la pagina lo dice.
  const debunkedWeekly = debunked.reduce((s, c) => s + (c.circulation?.last7 ?? 0), 0);

  return {
    facts, trials, pods, topics, debunked, debunkedWeekly,
    unchecked: topics.filter((t) => t.checked === 0),
    coverage: {
      factcheck: factCheckEnabled(),
      trials: (project?.evidence ?? []).length > 0,
      podcasts: Boolean(cfg('PODCASTINDEX_API_KEY') && cfg('PODCASTINDEX_API_SECRET')),
      newsdata: Boolean(cfg('NEWSDATA_API_KEY')),
      lemmy: project?.mode !== 'upload',
    },
  };
}
