import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { contentData } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 40;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!await claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

  const { concept } = await req.json() as { concept: string };
  if (!concept?.trim()) return NextResponse.json({ error: 'empty concept' }, { status: 400 });

  // Examples of what works in the sector: the highest-engagement headlines
  const top = (await contentData(project.id)).slice(0, 8)
    .map((r) => (r.title || r.content).slice(0, 90));

  const text = await callClaude(
    MODELS.haiku, 'studio_hooks',
    `You are a copywriting expert. Generate 10 alternative HOOKS/HEADLINES for a piece of content, in English: strong, curious, scroll-stopping. Vary the styles (question, shocking stat, contrarian, promise, storytelling).
Take inspiration from what performs in the sector but do NOT copy. Respond ONLY with a JSON array of 10 short strings.`,
    `Concept: ${concept}${top.length ? `\n\nContent that performs in the sector:\n${top.map((t) => `- ${t}`).join('\n')}` : ''}`,
    700,
  );
  if (!text) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });

  try {
    const start = text.indexOf('[');
    const hooks = (JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as string[])
      .map((h) => String(h).trim()).filter(Boolean).slice(0, 10);
    return NextResponse.json({ hooks });
  } catch {
    return NextResponse.json({ error: 'unparseable response, please retry' }, { status: 502 });
  }
}
