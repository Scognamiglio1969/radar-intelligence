import { NextResponse } from 'next/server';
import { and, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `You are Radar's media intelligence analyst. Answer the user's question in English, based ONLY on the provided data (aggregates + relevant mentions).
Rules:
- Cite concrete numbers and, when useful, quote 2-3 mentions as evidence (source + short quote).
- If the data isn't enough to answer, say so clearly and suggest what to monitor.
- Be direct and concise (max 250 words), use markdown sparingly (bold, lists).`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!await claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

  const { question, history } = await req.json() as { question: string; history?: { q: string; a: string }[] };
  if (!question?.trim()) return NextResponse.json({ error: 'empty question' }, { status: 400 });

  const db = await getDb();
  const d14 = new Date(Date.now() - 14 * 86400_000);

  // Aggregati di contesto
  const bySourceDay = await db.execute(sql`
    SELECT to_char(date_trunc('day', published_at), 'MM-DD') AS giorno, source AS fonte,
      count(*) AS n, round(avg(sentiment_score)::numeric, 2) AS sentiment
    FROM mentions WHERE project_id = ${project.id} AND published_at >= ${d14.toISOString()}::timestamptz
    GROUP BY 1, 2 ORDER BY 1
  `);
  const topTopics = await db.execute(sql`
    SELECT t AS tema, count(*) AS n FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${project.id} AND published_at >= ${d14.toISOString()}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 15
  `);

  // Mention pertinenti alla domanda (parole > 3 caratteri)
  const words = [...new Set(question.toLowerCase().match(/[\p{L}]{4,}/gu) ?? [])].slice(0, 6);
  const conds: SQL[] = [eq(mentions.projectId, project.id), gte(mentions.publishedAt, d14)];
  const wordConds = words
    .map((w) => or(ilike(mentions.content, `%${w}%`), ilike(mentions.title, `%${w}%`)))
    .filter((c): c is SQL => Boolean(c));
  if (wordConds.length) {
    const c = or(...wordConds);
    if (c) conds.push(c);
  }
  const relevant = await db.select({
    source: mentions.source, title: mentions.title, content: mentions.content,
    sentiment: mentions.sentiment, community: mentions.community,
    publishedAt: mentions.publishedAt, language: mentions.language,
  }).from(mentions).where(and(...conds))
    .orderBy(desc(mentions.engagementScore)).limit(25);

  const context = {
    project: project.name,
    query: project.keywords,
    volumePerDayAndSource: bySourceDay.rows,
    topTopics: topTopics.rows,
    relevantMentions: relevant.map((m) => ({
      source: m.source, where: m.community, language: m.language, sentiment: m.sentiment,
      date: m.publishedAt.toISOString().slice(0, 10),
      text: `${m.title ?? ''} ${m.content}`.slice(0, 220).trim(),
    })),
  };

  const historyText = (history ?? []).slice(-3)
    .map((h) => `Previous question: ${h.q}\nPrevious answer: ${h.a.slice(0, 400)}`)
    .join('\n\n');

  const answer = await callClaude(
    MODELS.sonnet, 'ask_the_data', SYSTEM,
    `${historyText ? historyText + '\n\n' : ''}DATA:\n${JSON.stringify(context).slice(0, 14000)}\n\nQUESTION: ${question}`,
    1000,
  );
  if (!answer) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });
  return NextResponse.json({ answer });
}
