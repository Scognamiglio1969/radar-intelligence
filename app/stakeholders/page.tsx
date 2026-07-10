import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { StakeholderMap } from '@/components/stakeholder-map';

export const metadata = { title: 'Mappa attori' };

export default async function StakeholdersPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const db = await getDb();
  const d14 = new Date(Date.now() - 14 * 86400_000).toISOString();

  // Entità nominate nei contenuti (estratte dall'analisi AI)
  const entities = await db.execute(sql`
    SELECT e AS name, count(*) AS n, avg(sentiment_score) AS sentiment
    FROM mentions, jsonb_array_elements_text(entities) AS e
    WHERE project_id = ${project.id} AND published_at >= ${d14}::timestamptz
    GROUP BY e HAVING count(*) >= 2
    ORDER BY n DESC LIMIT 28
  `);

  // Voci: autori con più engagement
  const authors = await db.execute(sql`
    SELECT coalesce(author_handle, author) AS name, source,
      count(*) AS n, sum(engagement_score) AS influence, avg(sentiment_score) AS sentiment
    FROM mentions
    WHERE project_id = ${project.id} AND published_at >= ${d14}::timestamptz
      AND coalesce(author_handle, author) IS NOT NULL
      AND source NOT IN ('googlenews', 'gdelt')
    GROUP BY 1, 2
    ORDER BY influence DESC LIMIT 22
  `);

  const entityNodes = (entities.rows as { name: string; n: number; sentiment: number | null }[])
    .filter((e) => !project.keywords.some((k) => k.toLowerCase() === e.name.toLowerCase()))
    .map((e) => ({
      name: e.name,
      value: Number(e.n),
      sentiment: e.sentiment === null ? null : Number(e.sentiment),
      kind: 'entità' as const,
    }));
  const authorNodes = (authors.rows as { name: string; source: string; n: number; influence: number; sentiment: number | null }[])
    .map((a) => ({
      name: a.name,
      value: Math.max(1, Math.round(Number(a.influence))),
      sentiment: a.sentiment === null ? null : Number(a.sentiment),
      kind: 'voce' as const,
      source: a.source,
      posts: Number(a.n),
    }));

  return (
    <>
      <PageHeader
        title="Mappa attori"
        subtitle="Chi conta nella conversazione: dimensione = peso, colore = sentiment. Al centro i più influenti."
      />
      {entityNodes.length + authorNodes.length < 5 ? (
        <EmptyState message="Ancora pochi attori rilevati: servono più mention analizzate dall'AI." />
      ) : (
        <StakeholderMap entities={entityNodes} authors={authorNodes} />
      )}
    </>
  );
}
