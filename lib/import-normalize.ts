/**
 * Normalizzatori deterministici per l'import.
 *
 * Sono volutamente separati dal modulo che parla con l'AI: il modello decide
 * COSA significa una colonna, questo codice decide COME si converte il valore.
 * Tenerli distinti è ciò che garantisce che nessun dato importato sia inventato
 * — a parità di file, l'output è sempre lo stesso.
 */

/** Formati data che compaiono davvero negli export di listening. */
export function parseDateTime(dateRaw: unknown, timeRaw?: unknown): Date | null {
  if (dateRaw == null || dateRaw === '') return null;
  if (dateRaw instanceof Date && !Number.isNaN(dateRaw.getTime())) {
    return timeRaw ? applyTime(dateRaw, String(timeRaw)) : dateRaw;
  }

  const s = String(dateRaw).trim();

  // Seriale Excel: giorni dal 1899-12-30. Un file salvato male consegna 45123
  // al posto di una data, e senza questo finiva a "oggi" in silenzio.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const days = Number(s);
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400_000);
    return Number.isNaN(d.getTime()) ? null : (timeRaw ? applyTime(d, String(timeRaw)) : d);
  }

  // gg/mm/aaaa — ambiguo con mm/gg/aaaa: si sceglie il formato europeo quando
  // il primo numero supera 12, altrimenti si lascia decidere a Date.parse.
  const eu = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (eu) {
    const [, a, b, y] = eu;
    const [day, month] = Number(a) > 12 ? [a, b] : Number(b) > 12 ? [b, a] : [a, b];
    const d = new Date(Number(y), Number(month) - 1, Number(day));
    if (!Number.isNaN(d.getTime())) return timeRaw ? applyTime(d, String(timeRaw)) : d;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return timeRaw ? applyTime(d, String(timeRaw)) : d;
}

/** Ora in colonna separata: negli export di listening è la norma, non l'eccezione. */
function applyTime(base: Date, time: string): Date {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return base;
  let h = Number(m[1]);
  const suffix = m[4]?.toLowerCase();
  if (suffix === 'pm' && h < 12) h += 12;
  if (suffix === 'am' && h === 12) h = 0;
  const out = new Date(base);
  out.setHours(h, Number(m[2]), Number(m[3] ?? 0), 0);
  return out;
}

/** "1.2K", "3,5M", "1.234", "12 345" → numero. */
export function parseNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().toLowerCase().replace(/\s/g, '');
  let mult = 1;
  if (/[km]$|mln$|mila$/.test(s)) {
    if (s.endsWith('mila')) { mult = 1_000; s = s.slice(0, -4); }
    else if (s.endsWith('mln')) { mult = 1_000_000; s = s.slice(0, -3); }
    else if (s.endsWith('m')) { mult = 1_000_000; s = s.slice(0, -1); }
    else { mult = 1_000; s = s.slice(0, -1); }
  }
  // Separatori: l'ultimo fra . e , è il decimale, gli altri sono migliaia.
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // Virgola sola: decimale se seguita da 1-2 cifre, altrimenti migliaia.
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0 && /\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n * mult : 0;
}

const POSITIVE = /^(pos|positiv|favorevole|good|1|\+1)/i;
const NEGATIVE = /^(neg|negativ|sfavorevole|bad|-1)/i;
const NEUTRAL = /^(neu|neutr|mixed|misto|0)/i;

/** Vocabolario sentiment: ogni strumento usa parole diverse per la stessa cosa. */
export function parseSentiment(v: unknown): { sentiment: string | null; score: number | null } {
  if (v == null || v === '') return { sentiment: null, score: null };
  const s = String(v).trim();

  // Punteggio numerico: -1..1 si usa così com'è, 0..100 si riscala.
  const asNum = Number(s.replace(',', '.'));
  if (!Number.isNaN(asNum) && /^-?[\d.,]+$/.test(s)) {
    const score = Math.abs(asNum) > 1 ? Math.max(-1, Math.min(1, (asNum - 50) / 50)) : asNum;
    return { sentiment: score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral', score };
  }
  if (POSITIVE.test(s)) return { sentiment: 'positive', score: 0.6 };
  if (NEGATIVE.test(s)) return { sentiment: 'negative', score: -0.6 };
  if (NEUTRAL.test(s)) return { sentiment: 'neutral', score: 0 };
  return { sentiment: null, score: null };
}

const LANGS: Record<string, string> = {
  italiano: 'it', italian: 'it', inglese: 'en', english: 'en', francese: 'fr', french: 'fr',
  tedesco: 'de', german: 'de', spagnolo: 'es', spanish: 'es', portoghese: 'pt', portuguese: 'pt',
};

export function parseLanguage(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (/^[a-z]{2}$/.test(s)) return s;
  if (/^[a-z]{2}[-_]/.test(s)) return s.slice(0, 2);   // it-IT, en_US
  return LANGS[s] ?? null;
}

/** Testo ripulito dall'HTML che molti export si portano dietro. */
export function cleanText(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Stessa formula usata dai connettori (lib/ingest.ts): senza questo, un post
 * importato e uno raccolto non sarebbero confrontabili in "Contenuti top",
 * che ordina per engagement.
 */
export function engagementScore(e: { likes?: number; comments?: number; shares?: number; views?: number }): number {
  return (e.likes ?? 0) + 2 * (e.comments ?? 0) + 3 * (e.shares ?? 0) + (e.views ?? 0) / 200;
}
