import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a senior content strategist. From a concept, produce a KIT of ready-to-publish content for multiple channels, consistent with each other but adapted to each format.
Respect the brand tone of voice if provided. Write in English.
Respond ONLY with a JSON object with EXACTLY these keys:
{
  "linkedin": "LinkedIn post, 80-150 words, professional but human, max 3 relevant hashtags",
  "xthread": "X thread in 3-5 tweets separated by '\\n\\n', each tweet <280 characters, the first is a strong hook",
  "instagram": "short, engaging Instagram caption + 5-8 relevant hashtags",
  "videohook": "1-2 opening sentences for a reel/short (the first 3 seconds that stop the scroll)",
  "newsletter": "newsletter paragraph, 60-100 words, confidential tone"
}`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!await claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

  const { concept } = await req.json() as { concept: string };
  if (!concept?.trim()) return NextResponse.json({ error: 'empty concept' }, { status: 400 });

  const trends = (await getTrends(project.id)).slice(0, 4).map((t) => t.topic);
  const text = await callClaude(
    MODELS.sonnet, 'studio_kit', SYSTEM,
    `Sector: ${project.name}
${project.brandVoice ? `Brand tone of voice: ${project.brandVoice}\n` : ''}${trends.length ? `Today's hot trends (tie in if relevant): ${trends.join(', ')}\n` : ''}
Concept to develop: ${concept}`,
    1800,
  );
  if (!text) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });

  try {
    const start = text.indexOf('{');
    const kit = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
    return NextResponse.json({ kit });
  } catch {
    return NextResponse.json({ error: 'unparseable response, please retry' }, { status: 502 });
  }
}
