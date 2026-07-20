import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { translateMentions, TRANSLATE_LANGS } from '@/lib/translate';
import { claudeAvailable } from '@/lib/claude';

export const dynamic = 'force-dynamic';

const VALID = new Set(TRANSLATE_LANGS.map(([code]) => code));

// Traduzione ON-DEMAND di UN singolo post: per leggere al volo una mention in
// un'altra lingua senza tradurre l'intera pagina. Cache permanente in DB
// (riusa translateMentions): ogni contenuto si paga una volta sola.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id, lang } = (await req.json().catch(() => ({}))) as { id?: number; lang?: string };
  if (!id || !lang || !VALID.has(lang)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!await claudeAvailable()) {
    return NextResponse.json({ error: 'ai_off' }, { status: 503 });
  }

  const db = await getDb();
  const [row] = await db.select({
    id: mentions.id, title: mentions.title, content: mentions.content,
    language: mentions.language, translations: mentions.translations,
  }).from(mentions).where(eq(mentions.id, id)).limit(1);

  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (row.language === lang) {
    return NextResponse.json({ title: row.title, content: row.content, already: true });
  }

  const map = await translateMentions([row], lang);
  const tr = map.get(row.id);
  if (!tr) return NextResponse.json({ error: 'translation_failed' }, { status: 502 });
  return NextResponse.json({ title: tr.title ?? null, content: tr.content });
}
