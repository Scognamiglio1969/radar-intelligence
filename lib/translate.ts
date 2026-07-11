import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

export const TRANSLATE_LANGS: [string, string][] = [
  ['it', 'Italiano'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'],
  ['de', 'Deutsch'], ['pt', 'Português'], ['zh', '中文'], ['ar', 'العربية'],
];

const LANG_NAME: Record<string, string> = Object.fromEntries(TRANSLATE_LANGS);

export type Translated = { title?: string; content: string };

type Row = Pick<typeof mentions.$inferSelect, 'id' | 'title' | 'content' | 'language' | 'translations'>;

/**
 * Traduce le mention nella lingua richiesta. Cache permanente in DB:
 * ogni contenuto si paga una volta sola; i già-tradotti tornano gratis.
 */
export async function translateMentions(rows: Row[], lang: string): Promise<Map<number, Translated>> {
  const out = new Map<number, Translated>();
  const pending: Row[] = [];

  for (const r of rows) {
    if (r.language === lang) continue; // già nella lingua richiesta
    const cached = r.translations?.[lang];
    if (cached) out.set(r.id, cached);
    else pending.push(r);
  }
  if (pending.length === 0 || !await claudeAvailable()) return out;

  const db = await getDb();
  const chunks: Row[][] = [];
  for (let i = 0; i < pending.length; i += 15) chunks.push(pending.slice(i, i + 15));

  await Promise.all(chunks.map(async (chunk) => {
    const payload = chunk.map((r) => ({
      id: r.id,
      title: r.title?.slice(0, 250) ?? null,
      text: r.content.slice(0, 700),
    }));
    const text = await callClaude(
      MODELS.haiku, 'traduzione',
      `Traduci i contenuti in ${LANG_NAME[lang] ?? lang}. Mantieni il tono e i nomi propri.
Rispondi SOLO con un array JSON di oggetti { "id", "title" (null se era null), "text" } tradotti.`,
      JSON.stringify(payload), 4000,
    );
    if (!text) return;
    try {
      const start = text.indexOf('[');
      const rows2 = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as { id: number; title?: string | null; text: string }[];
      for (const t of rows2) {
        const orig = chunk.find((c) => c.id === t.id);
        if (!orig || !t.text) continue;
        const tr: Translated = { title: t.title ?? undefined, content: t.text };
        out.set(orig.id, tr);
        await db.update(mentions)
          .set({ translations: { ...(orig.translations ?? {}), [lang]: tr } })
          .where(eq(mentions.id, orig.id));
      }
    } catch { /* batch non parsabile: quei contenuti restano in originale */ }
  }));

  return out;
}
