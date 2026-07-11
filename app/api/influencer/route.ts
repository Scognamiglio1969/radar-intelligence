import { NextResponse } from 'next/server';
import { and, desc, eq, gte, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { influencerProfiles, mentions } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a digital PR strategist. You receive an author's recent posts on a topic.
Write in English, in Markdown:
## Profile
3-4 sentences: what they talk about, in what tone, their stance on the topic, what kind of audience they reach.
## How to approach them
2 sentences: what they value, what to avoid.
## Outreach draft
A direct message of max 90 words, personalized on their real content (quote one of their posts), professional but human tone, no flattery. Goal: open a conversation, not sell.
Max 280 words total.`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!await claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

  const { author, source } = await req.json() as { author: string; source: string };
  if (!author) return NextResponse.json({ error: 'missing author' }, { status: 400 });
  const db = await getDb();

  // Cache: un profilo per autore ogni 7 giorni
  const [existing] = await db.select().from(influencerProfiles)
    .where(and(
      eq(influencerProfiles.projectId, project.id),
      eq(influencerProfiles.author, author),
      eq(influencerProfiles.source, source),
      gte(influencerProfiles.createdAt, new Date(Date.now() - 7 * 86400_000)),
    ))
    .orderBy(desc(influencerProfiles.createdAt)).limit(1);
  if (existing) return NextResponse.json({ profile: existing.profileMd, cached: true });

  const posts = await db.select({
    title: mentions.title, content: mentions.content, sentiment: mentions.sentiment,
    engagement: mentions.engagementScore, community: mentions.community,
    publishedAt: mentions.publishedAt,
  }).from(mentions)
    .where(and(
      eq(mentions.projectId, project.id),
      eq(mentions.source, source),
      or(eq(mentions.author, author), eq(mentions.authorHandle, author)),
    ))
    .orderBy(desc(mentions.publishedAt)).limit(15);
  if (posts.length === 0) return NextResponse.json({ error: 'no posts from this author' }, { status: 404 });

  const profile = await callClaude(
    MODELS.sonnet, 'influencer_profile', SYSTEM,
    `Monitored topic: ${project.name}\nAuthor: ${author} (platform: ${source})\n\nTheir recent posts:\n${posts.map((p) => `- [eng ${Math.round(p.engagement)}] ${(p.title ?? p.content).slice(0, 200)}`).join('\n').slice(0, 8000)}`,
    900,
  );
  if (!profile) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });

  await db.insert(influencerProfiles).values({
    projectId: project.id, author, source, profileMd: profile,
  });
  return NextResponse.json({ profile });
}
