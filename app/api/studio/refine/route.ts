import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 40;
export const dynamic = 'force-dynamic';

const FORMAT_LABEL: Record<string, string> = {
  linkedin: 'post LinkedIn', xthread: 'thread per X (tweet separati da doppia riga)',
  instagram: 'caption Instagram con hashtag', videohook: 'hook di apertura per video breve',
  newsletter: 'paragrafo da newsletter',
};

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const { text, instruction, format } = await req.json() as { text: string; instruction: string; format: string };
  if (!text?.trim() || !instruction?.trim()) return NextResponse.json({ error: 'dati mancanti' }, { status: 400 });

  const revised = await callClaude(
    MODELS.haiku, 'studio_refine',
    `Sei un copywriter. Riscrivi il testo seguendo l'istruzione dell'utente, mantenendo il formato: ${FORMAT_LABEL[format] ?? 'testo social'}.
${project.brandVoice ? `Tono di voce del brand: ${project.brandVoice}\n` : ''}Rispondi SOLO con il testo rivisto, senza commenti.`,
    `Testo attuale:\n${text}\n\nIstruzione: ${instruction}`,
    900,
  );
  if (!revised) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });
  return NextResponse.json({ text: revised.trim() });
}
