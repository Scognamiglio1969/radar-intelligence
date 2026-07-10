import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `Sei un media analyst. Confronta gli ultimi 7 giorni con i 7 precedenti e scrivi in italiano, in Markdown:
## Cosa è cambiato (3-5 bullet con i cambiamenti che contano, con numeri e variazioni %)
## Temi in ascesa e in calo (cosa è nuovo, cosa è sparito)
## Sentiment (com'è cambiato il tono e dove)
## Da tenere d'occhio (1-2 segnali deboli)
Massimo 300 parole. Basati SOLO sui dati; se una differenza è piccola non chiamarla svolta.`;

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  // Cache giornaliera: il confronto si paga al massimo una volta al giorno
  const cacheKey = `compare:${project.id}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await getMeta<string>(cacheKey);
  if (cached) return NextResponse.json({ comparison: cached, cached: true });

  const db = await getDb();
  const now = Date.now();
  const w1 = new Date(now - 7 * 86400_000).toISOString();
  const w2 = new Date(now - 14 * 86400_000).toISOString();

  const bySource = await db.execute(sql`
    SELECT source AS fonte,
      count(*) FILTER (WHERE published_at >= ${w1}::timestamptz) AS settimana_corrente,
      count(*) FILTER (WHERE published_at < ${w1}::timestamptz) AS settimana_precedente,
      round(avg(sentiment_score) FILTER (WHERE published_at >= ${w1}::timestamptz)::numeric, 2) AS sentiment_corrente,
      round(avg(sentiment_score) FILTER (WHERE published_at < ${w1}::timestamptz)::numeric, 2) AS sentiment_precedente
    FROM mentions WHERE project_id = ${project.id} AND published_at >= ${w2}::timestamptz
    GROUP BY source
  `);
  const topicsNow = await db.execute(sql`
    SELECT t AS tema, count(*) AS n FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${project.id} AND published_at >= ${w1}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 15
  `);
  const topicsPrev = await db.execute(sql`
    SELECT t AS tema, count(*) AS n FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${project.id} AND published_at >= ${w2}::timestamptz AND published_at < ${w1}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 15
  `);
  const communities = await db.execute(sql`
    SELECT community,
      count(*) FILTER (WHERE published_at >= ${w1}::timestamptz) AS corrente,
      count(*) FILTER (WHERE published_at < ${w1}::timestamptz) AS precedente
    FROM mentions
    WHERE project_id = ${project.id} AND published_at >= ${w2}::timestamptz AND community IS NOT NULL
    GROUP BY community ORDER BY corrente DESC LIMIT 12
  `);

  const comparison = await callClaude(
    MODELS.sonnet, 'confronto_settimanale', SYSTEM,
    `Settore: ${project.name}\n\nVolume e sentiment per fonte:\n${JSON.stringify(bySource.rows)}\n\nTemi settimana corrente:\n${JSON.stringify(topicsNow.rows)}\n\nTemi settimana precedente:\n${JSON.stringify(topicsPrev.rows)}\n\nCommunity:\n${JSON.stringify(communities.rows)}`,
    900,
  );
  if (!comparison) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });

  await setMeta(cacheKey, comparison);
  return NextResponse.json({ comparison });
}
