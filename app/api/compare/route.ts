import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a media analyst. Compare the last 7 days with the previous 7 and write in English, in Markdown:
## What changed (3-5 bullets with the changes that matter, with numbers and % variations)
## Topics rising and falling (what's new, what disappeared)
## Sentiment (how the tone changed and where)
## To keep an eye on (1-2 weak signals)
Max 300 words. Base it ONLY on the data; if a difference is small, don't call it a turning point.`;

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

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
    MODELS.sonnet, 'weekly_comparison', SYSTEM,
    `Sector: ${project.name}\n\nVolume and sentiment by source:\n${JSON.stringify(bySource.rows)}\n\nCurrent-week topics:\n${JSON.stringify(topicsNow.rows)}\n\nPrevious-week topics:\n${JSON.stringify(topicsPrev.rows)}\n\nCommunities:\n${JSON.stringify(communities.rows)}`,
    900,
  );
  if (!comparison) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });

  await setMeta(cacheKey, comparison);
  return NextResponse.json({ comparison });
}
