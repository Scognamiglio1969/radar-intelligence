import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Ricerca semantica: Haiku espande la query in sinonimi/espressioni multilingua,
// poi la pagina Ascolto cerca con OR su tutti i termini.
export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const { q } = await req.json() as { q: string };
  if (!q?.trim()) return NextResponse.json({ error: 'query vuota' }, { status: 400 });

  const langs = project.languages.length ? project.languages.join(', ') : 'it, en';
  const text = await callClaude(
    MODELS.haiku, 'ricerca_semantica',
    `Espandi la query di ricerca dell'utente in termini, sinonimi ed espressioni colloquiali che le persone userebbero DAVVERO per esprimere quel concetto, nelle lingue: ${langs}.
Includi anche modi di dire (es. per "lamentele sui prezzi": "costa un occhio", "fuori mercato", "rip-off").
Rispondi SOLO con un array JSON di 8-14 stringhe brevi (1-3 parole), minuscole.`,
    `Concetto cercato: ${q}`,
    400,
  );
  if (!text) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });

  let terms: string[] = [];
  try {
    const start = text.indexOf('[');
    terms = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as string[];
  } catch { /* risposta non parsabile: si ripiega sulla query originale */ }
  terms = [...new Set([q.toLowerCase(), ...terms.map((t) => String(t).toLowerCase().trim())])]
    .filter((t) => t.length >= 3).slice(0, 15);
  return NextResponse.json({ terms });
}
