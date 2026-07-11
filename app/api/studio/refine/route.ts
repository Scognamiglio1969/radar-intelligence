import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 40;
export const dynamic = 'force-dynamic';

const FORMAT_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn post', xthread: 'X thread (tweets separated by a blank line)',
  instagram: 'Instagram caption with hashtags', videohook: 'opening hook for a short video',
  newsletter: 'newsletter paragraph',
};

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!await claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

  const { text, instruction, format } = await req.json() as { text: string; instruction: string; format: string };
  if (!text?.trim() || !instruction?.trim()) return NextResponse.json({ error: 'missing data' }, { status: 400 });

  const revised = await callClaude(
    MODELS.haiku, 'studio_refine',
    `You are a copywriter. Rewrite the text following the user's instruction, keeping the format: ${FORMAT_LABEL[format] ?? 'social text'}.
${project.brandVoice ? `Brand tone of voice: ${project.brandVoice}\n` : ''}Respond ONLY with the revised text, no comments.`,
    `Current text:\n${text}\n\nInstruction: ${instruction}`,
    900,
  );
  if (!revised) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });
  return NextResponse.json({ text: revised.trim() });
}
