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

const SYSTEM = `You are a senior content strategist. Based on the day's real trends and conversations, propose content to publish.
Write in English, in Markdown, EXACTLY 3 proposals, each with this structure:
## Idea N — [idea title]
**Why now:** 1 sentence tied to a real trend or conversation from today.
**Recommended format:** (LinkedIn post / X thread / short video / article) and posting moment.
**Draft:**
The post text, ready to publish (80-120 words for LinkedIn, shorter for X). No junk hashtags: at most 3, relevant.
Respect the brand tone of voice if provided. Max 550 words total.`;

export async function POST() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

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
    `Sector: ${project.name}
${project.brandVoice ? `Brand tone of voice: ${project.brandVoice}\n` : ''}
Emerging trends (radar):
${trends.map((t) => `- ${t.topic} (x${t.score.toFixed(1)} vs the norm)${t.explanation ? `: ${t.explanation}` : ''}`).join('\n') || '- no anomalous trend today'}

Top topics of the week:
${dashboard.topTopics.slice(0, 10).map((t) => `- ${t.topic} (${t.n})`).join('\n')}

Content that is performing (to understand what works):
${top.slice(0, 8).map((r) => `- [${r.source}, eng ${Math.round(r.engagementScore)}] ${(r.title || r.content).slice(0, 140)}`).join('\n')}`,
    1500,
  );
  if (!ideas) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });

  await db.insert(contentIdeas).values({ projectId: project.id, contentMd: ideas });
  return NextResponse.json({ ideas });
}

export async function GET() {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const db = await getDb();
  const history = await db.select().from(contentIdeas)
    .where(eq(contentIdeas.projectId, project.id))
    .orderBy(desc(contentIdeas.createdAt)).limit(10);
  return NextResponse.json({ history });
}
