import { NextResponse } from 'next/server';
import { and, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `Sei l'analista di media intelligence di Radar. Rispondi in italiano alla domanda dell'utente basandoti SOLO sui dati forniti (aggregati + mention rilevanti).
Regole:
- Cita numeri concreti e, quando utile, riporta 2-3 mention come prova (fonte + citazione breve).
- Se i dati non bastano per rispondere, dillo chiaramente e suggerisci cosa monitorare.
- Sii diretto e sintetico (max 250 parole), usa il markdown con parsimonia (grassetti, elenchi).`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const { question, history } = await req.json() as { question: string; history?: { q: string; a: string }[] };
  if (!question?.trim()) return NextResponse.json({ error: 'domanda vuota' }, { status: 400 });

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
    progetto: project.name,
    query: project.keywords,
    volumePerGiornoEFonte: bySourceDay.rows,
    temiPrincipali: topTopics.rows,
    mentionRilevanti: relevant.map((m) => ({
      fonte: m.source, dove: m.community, lingua: m.language, sentiment: m.sentiment,
      data: m.publishedAt.toISOString().slice(0, 10),
      testo: `${m.title ?? ''} ${m.content}`.slice(0, 220).trim(),
    })),
  };

  const historyText = (history ?? []).slice(-3)
    .map((h) => `Domanda precedente: ${h.q}\nRisposta precedente: ${h.a.slice(0, 400)}`)
    .join('\n\n');

  const answer = await callClaude(
    MODELS.sonnet, 'chiedi_ai_dati', SYSTEM,
    `${historyText ? historyText + '\n\n' : ''}DATI:\n${JSON.stringify(context).slice(0, 14000)}\n\nDOMANDA: ${question}`,
    1000,
  );
  if (!answer) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });
  return NextResponse.json({ answer });
}
