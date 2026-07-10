import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { alerts, mentions } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `Sei un consulente senior di crisis communication. Ricevi un alert di monitoraggio media e le conversazioni collegate.
Genera un CRISIS PLAYBOOK in italiano, in Markdown, con questa struttura:
## Valutazione (gravità 1-5 e perché, in 2 frasi)
## Chi guida la conversazione (fonti/account principali e loro peso)
## Opzioni di risposta (3 opzioni: non rispondere / risposta misurata / risposta decisa — con pro e contro in una riga ciascuno)
## Bozza di comunicato (max 120 parole, tono professionale, pronta da adattare)
## Prossime 24 ore (3 azioni concrete di monitoraggio)
Massimo 450 parole totali. Basati SOLO sui dati forniti.`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const { alertId } = await req.json() as { alertId: number };
  const db = await getDb();
  const [alert] = await db.select().from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.projectId, project.id)));
  if (!alert) return NextResponse.json({ error: 'alert non trovato' }, { status: 404 });

  // Riuso: se il playbook esiste già, non si paga due volte
  const existing = (alert.data as Record<string, unknown> | null)?.playbook;
  if (typeof existing === 'string') return NextResponse.json({ playbook: existing, cached: true });

  const h36 = new Date(Date.now() - 36 * 3600_000);
  const related = await db.select({
    source: mentions.source, title: mentions.title, content: mentions.content,
    sentiment: mentions.sentiment, author: mentions.authorHandle, community: mentions.community,
    engagementScore: mentions.engagementScore,
  }).from(mentions)
    .where(and(eq(mentions.projectId, project.id), gte(mentions.publishedAt, h36)))
    .orderBy(desc(mentions.engagementScore)).limit(30);

  const playbook = await callClaude(
    MODELS.sonnet, 'crisis_playbook', SYSTEM,
    `Settore: ${project.name}\nAlert: ${alert.message} (tipo: ${alert.type}, severità: ${alert.severity})\n\nConversazioni delle ultime 36 ore:\n${JSON.stringify(related.map((m) => ({
      fonte: m.source, autore: m.author, dove: m.community, sentiment: m.sentiment,
      engagement: Math.round(m.engagementScore),
      testo: `${m.title ?? ''} ${m.content}`.slice(0, 200).trim(),
    }))).slice(0, 12000)}`,
    1300,
  );
  if (!playbook) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });

  await db.update(alerts)
    .set({ data: { ...(alert.data ?? {}), playbook } })
    .where(eq(alerts.id, alert.id));
  return NextResponse.json({ playbook });
}
