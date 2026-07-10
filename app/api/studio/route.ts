import { NextResponse } from 'next/server';
import { desc, eq, and, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { contentIdeas } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';
import { getTrends } from '@/lib/trends';
import { contentData, dashboardData } from '@/lib/data';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `Sei un content strategist senior. Sulla base dei trend e delle conversazioni reali del giorno, proponi contenuti da pubblicare.
Scrivi in italiano, in Markdown, ESATTAMENTE 3 proposte con questa struttura ciascuna:
## Idea N — [titolo dell'idea]
**Perché ora:** 1 frase legata a un trend o conversazione reale di oggi.
**Formato consigliato:** (post LinkedIn / thread X / video breve / articolo) e momento di pubblicazione.
**Bozza:**
Il testo del post, pronto da pubblicare (80-120 parole per LinkedIn, più corto per X). Non usare hashtag spazzatura: massimo 3, pertinenti.
Rispetta il tono di voce del brand se fornito. Massimo 550 parole totali.`;

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const db = await getDb();
  // Cache giornaliera: un giro di idee al giorno (rigenerabile domani)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [existing] = await db.select().from(contentIdeas)
    .where(and(eq(contentIdeas.projectId, project.id), gte(contentIdeas.createdAt, today)))
    .orderBy(desc(contentIdeas.createdAt)).limit(1);
  if (existing) return NextResponse.json({ ideas: existing.contentMd, cached: true });

  const [trends, dashboard, top] = await Promise.all([
    getTrends(project.id), dashboardData(project.id), contentData(project.id),
  ]);

  const ideas = await callClaude(
    MODELS.sonnet, 'content_studio', SYSTEM,
    `Settore: ${project.name}
${project.brandVoice ? `Tono di voce del brand: ${project.brandVoice}\n` : ''}
Trend emergenti (radar):
${trends.map((t) => `- ${t.topic} (x${t.score.toFixed(1)} rispetto alla norma)${t.explanation ? `: ${t.explanation}` : ''}`).join('\n') || '- nessun trend anomalo oggi'}

Temi principali della settimana:
${dashboard.topTopics.slice(0, 10).map((t) => `- ${t.topic} (${t.n})`).join('\n')}

Contenuti che stanno performando (per capire cosa funziona):
${top.slice(0, 8).map((r) => `- [${r.source}, eng ${Math.round(r.engagementScore)}] ${(r.title || r.content).slice(0, 140)}`).join('\n')}`,
    1500,
  );
  if (!ideas) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });

  await db.insert(contentIdeas).values({ projectId: project.id, contentMd: ideas });
  return NextResponse.json({ ideas });
}

export async function GET() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  const db = await getDb();
  const history = await db.select().from(contentIdeas)
    .where(eq(contentIdeas.projectId, project.id))
    .orderBy(desc(contentIdeas.createdAt)).limit(10);
  return NextResponse.json({ history });
}
