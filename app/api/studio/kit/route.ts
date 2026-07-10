import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `Sei un content strategist senior. Da un concetto, produci un KIT di contenuti pronti da pubblicare su più canali, coerenti tra loro ma adattati a ciascun formato.
Rispetta il tono di voce del brand se fornito. Scrivi in italiano.
Rispondi SOLO con un oggetto JSON con ESATTAMENTE queste chiavi:
{
  "linkedin": "post LinkedIn, 80-150 parole, professionale ma umano, max 3 hashtag pertinenti",
  "xthread": "thread per X in 3-5 tweet separati da '\\n\\n', ogni tweet <280 caratteri, il primo è un hook forte",
  "instagram": "caption Instagram breve e coinvolgente + 5-8 hashtag pertinenti",
  "videohook": "1-2 frasi di apertura per un reel/short (i primi 3 secondi che fermano lo scroll)",
  "newsletter": "paragrafo da newsletter, 60-100 parole, tono confidenziale"
}`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const { concept } = await req.json() as { concept: string };
  if (!concept?.trim()) return NextResponse.json({ error: 'concetto vuoto' }, { status: 400 });

  const trends = (await getTrends(project.id)).slice(0, 4).map((t) => t.topic);
  const text = await callClaude(
    MODELS.sonnet, 'studio_kit', SYSTEM,
    `Settore: ${project.name}
${project.brandVoice ? `Tono di voce del brand: ${project.brandVoice}\n` : ''}${trends.length ? `Trend caldi di oggi (aggancia se pertinente): ${trends.join(', ')}\n` : ''}
Concetto da sviluppare: ${concept}`,
    1800,
  );
  if (!text) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });

  try {
    const start = text.indexOf('{');
    const kit = JSON.parse(text.slice(start, text.lastIndexOf('}') + 1));
    return NextResponse.json({ kit });
  } catch {
    return NextResponse.json({ error: 'risposta non interpretabile, riprova' }, { status: 502 });
  }
}
