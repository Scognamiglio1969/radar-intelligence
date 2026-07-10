import { NextResponse } from 'next/server';
import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { alerts, mentions } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a senior crisis communication consultant. You receive a media monitoring alert and the related conversations.
Generate a CRISIS PLAYBOOK in English, in Markdown, with this structure:
## Assessment (severity 1-5 and why, in 2 sentences)
## Who is driving the conversation (main sources/accounts and their weight)
## Response options (3 options: don't respond / measured response / firm response — with pros and cons in one line each)
## Draft statement (max 120 words, professional tone, ready to adapt)
## Next 24 hours (3 concrete monitoring actions)
Max 450 words total. Base it ONLY on the provided data.`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

  const { alertId } = await req.json() as { alertId: number };
  const db = await getDb();
  const [alert] = await db.select().from(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.projectId, project.id)));
  if (!alert) return NextResponse.json({ error: 'alert not found' }, { status: 404 });

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
    `Sector: ${project.name}\nAlert: ${alert.message} (type: ${alert.type}, severity: ${alert.severity})\n\nConversations from the last 36 hours:\n${JSON.stringify(related.map((m) => ({
      source: m.source, author: m.author, where: m.community, sentiment: m.sentiment,
      engagement: Math.round(m.engagementScore),
      text: `${m.title ?? ''} ${m.content}`.slice(0, 200).trim(),
    }))).slice(0, 12000)}`,
    1300,
  );
  if (!playbook) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });

  await db.update(alerts)
    .set({ data: { ...(alert.data ?? {}), playbook } })
    .where(eq(alerts.id, alert.id));
  return NextResponse.json({ playbook });
}
