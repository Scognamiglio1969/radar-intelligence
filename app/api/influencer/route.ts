import { NextResponse } from 'next/server';
import { and, desc, eq, gte, or } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { influencerProfiles, mentions } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM = `Sei un digital PR strategist. Ricevi i post recenti di un autore su un tema.
Scrivi in italiano, in Markdown:
## Profilo
3-4 frasi: di cosa parla, con che tono, che posizione ha sul tema, che tipo di audience raggiunge.
## Come approcciarlo
2 frasi: cosa apprezza, cosa evitare.
## Bozza di contatto
Un messaggio diretto di max 90 parole, personalizzato sui suoi contenuti reali (cita un suo post), tono professionale ma umano, senza piaggeria. Obiettivo: aprire una conversazione, non vendere.
Massimo 280 parole totali.`;

export async function POST(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  if (!claudeAvailable()) return NextResponse.json({ error: 'API key Claude non configurata' }, { status: 400 });

  const { author, source } = await req.json() as { author: string; source: string };
  if (!author) return NextResponse.json({ error: 'autore mancante' }, { status: 400 });
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
  if (posts.length === 0) return NextResponse.json({ error: 'nessun post di questo autore' }, { status: 404 });

  const profile = await callClaude(
    MODELS.sonnet, 'profilo_influencer', SYSTEM,
    `Tema monitorato: ${project.name}\nAutore: ${author} (piattaforma: ${source})\n\nSuoi post recenti:\n${posts.map((p) => `- [eng ${Math.round(p.engagement)}] ${(p.title ?? p.content).slice(0, 200)}`).join('\n').slice(0, 8000)}`,
    900,
  );
  if (!profile) return NextResponse.json({ error: 'tetto di spesa raggiunto o errore API' }, { status: 429 });

  await db.insert(influencerProfiles).values({
    projectId: project.id, author, source, profileMd: profile,
  });
  return NextResponse.json({ profile });
}
