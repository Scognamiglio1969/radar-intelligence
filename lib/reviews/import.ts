import { getDb } from '@/lib/db';
import { reviewSources, reviews } from '@/lib/db/schema';
import { parseSheet } from '@/lib/import';

export type ReviewColumnMap = {
  rating: string; content: string;
  title?: string; author?: string; date?: string; url?: string;
};

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

// djb2: stesso hash usato per l'import delle mention (lib/import.ts), qui
// riscritto perché quella funzione non è esportata — la separazione dei due
// moduli è intenzionale, non un dimenticanza.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const clamp5 = (n: number) => Math.max(1, Math.min(5, n));

/**
 * Un voto da un file può arrivare in qualunque scala: "4", "4/5", "8/10",
 * "85" (su 100). Si converte tutto a 1-5.
 *
 * Occhio alla trappola classica di JS: `Number("")` vale 0, non NaN — senza
 * il controllo esplicito su "c'è almeno una cifra", un testo non numerico
 * (o una cella vuota) diventerebbe silenziosamente un voto 1, inventando un
 * dato che non c'è. Si scarta invece la riga (torna null).
 */
function parseRating(raw: unknown): number | null {
  const s = String(raw ?? '').trim();
  if (!s || !/\d/.test(s) || s.startsWith('-')) return null;

  const frac = s.match(/^([\d.]+)\s*\/\s*([\d.]+)/);
  if (frac) {
    const num = Number(frac[1]), den = Number(frac[2]);
    return den > 0 && Number.isFinite(num) ? clamp5(Math.round((num / den) * 5)) : null;
  }

  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return null;
  if (n <= 5) return clamp5(Math.round(n));       // già in scala 1-5
  if (n <= 10) return clamp5(Math.round(n / 2));  // scala 1-10 (stile NPS)
  if (n <= 100) return clamp5(Math.round(n / 20)); // percentuale / punteggio 0-100
  return null;
}

/**
 * Importa un file come fonte "upload": una riga per recensione, dedup via hash
 * del contenuto (reimportare lo stesso file non duplica nulla). Ogni import
 * crea una nuova review_source, così un lotto sbagliato si rimuove da solo
 * col cestino sulla fonte, senza toccare il resto.
 */
export async function importReviewsFromSheet(
  projectId: number, buffer: Buffer, filename: string, map: ReviewColumnMap, label?: string,
): Promise<{ inserted: number; skipped: number; total: number }> {
  const { rows } = await parseSheet(buffer, filename);
  const db = await getDb();
  const [src] = await db.insert(reviewSources).values({
    projectId, type: 'upload', identifier: filename, label: label?.trim() || filename,
  }).returning({ id: reviewSources.id });

  const get = (row: Record<string, unknown>, col?: string) => (col ? row[col] : undefined);
  const values: (typeof reviews.$inferInsert)[] = [];
  let skipped = 0;

  for (const row of rows) {
    const content = String(get(row, map.content) ?? '').trim();
    const rating = parseRating(get(row, map.rating));
    if (!content || rating === null) { skipped++; continue; }
    const title = map.title ? String(get(row, map.title) ?? '').trim() || null : null;
    const author = map.author ? String(get(row, map.author) ?? '').trim() || null : null;
    const url = map.url ? String(get(row, map.url) ?? '').trim() || null : null;
    const publishedAt = (map.date && parseDate(get(row, map.date))) || new Date();
    values.push({
      projectId, sourceId: src.id,
      externalId: hash(`${content}|${author ?? ''}|${publishedAt.toISOString()}`),
      rating, title, content, author, url, publishedAt,
    });
  }

  let inserted = 0;
  for (let i = 0; i < values.length; i += 500) {
    const res = await db.insert(reviews).values(values.slice(i, i + 500)).onConflictDoNothing().returning({ id: reviews.id });
    inserted += res.length;
  }
  return { inserted, skipped, total: rows.length };
}
