import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Ricerca semantica: Haiku espande la query in sinonimi/espressioni multilingua,
// poi la pagina Ascolto cerca con OR su tutti i termini.
export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  if (!await claudeAvailable()) return NextResponse.json({ error: 'Claude API key not configured' }, { status: 400 });

  const { q } = await req.json() as { q: string };
  if (!q?.trim()) return NextResponse.json({ error: 'empty query' }, { status: 400 });

  const langs = project.languages.length ? project.languages.join(', ') : 'it, en';
  const text = await callClaude(
    MODELS.haiku, 'semantic_search',
    `Expand the user's search query into terms, synonyms and colloquial expressions that people would ACTUALLY use to express that concept, in these languages: ${langs}.
Include idioms too (e.g. for "complaints about prices": "costs a fortune", "overpriced", "rip-off").
Respond ONLY with a JSON array of 8-14 short strings (1-3 words), lowercase.`,
    `Searched concept: ${q}`,
    400,
  );
  if (!text) return NextResponse.json({ error: 'spend cap reached or API error' }, { status: 429 });

  let terms: string[] = [];
  try {
    const start = text.indexOf('[');
    terms = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as string[];
  } catch { /* risposta non parsabile: si ripiega sulla query originale */ }
  terms = [...new Set([q.toLowerCase(), ...terms.map((t) => String(t).toLowerCase().trim())])]
    .filter((t) => t.length >= 3).slice(0, 15);
  return NextResponse.json({ terms });
}
