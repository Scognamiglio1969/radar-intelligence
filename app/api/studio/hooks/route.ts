import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { contentData } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 40;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const { concept } = await req.json() as { concept: string };
  if (!concept?.trim()) return NextResponse.json({ error: 'concetto vuoto' }, { status: 400 });

  // Esempi di ciò che funziona nel settore: i titoli a più engagement
  const top = (await contentData(project.id)).slice(0, 8)
    .map((r) => (r.title || r.content).slice(0, 90));

  const text = await callClaude(
    MODELS.haiku, 'studio_hooks',
    `Sei un esperto di copywriting. Genera 10 HOOK/TITOLI alternativi per un contenuto, in italiano: forti, curiosi, che fermano lo scroll. Varia gli stili (domanda, dato scioccante, contrarian, promessa, storytelling).
Ispirati a cosa performa nel settore ma NON copiare. Rispondi SOLO con un array JSON di 10 stringhe brevi.`,
    `Concetto: ${concept}${top.length ? `\n\nContenuti che performano nel settore:\n${top.map((t) => `- ${t}`).join('\n')}` : ''}`,
    700,
  );
  if (!text) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });

  try {
    const start = text.indexOf('[');
    const hooks = (JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as string[])
      .map((h) => String(h).trim()).filter(Boolean).slice(0, 10);
    return NextResponse.json({ hooks });
  } catch {
    return NextResponse.json({ error: 'risposta non interpretabile, riprova' }, { status: 502 });
  }
}
