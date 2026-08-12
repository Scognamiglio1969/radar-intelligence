import type { ColumnMap, ImportReport } from '@/lib/import';
import {
  cleanText, engagementScore, parseDateTime, parseLanguage, parseNumber, parseSentiment,
} from '@/lib/import-normalize';
import { countryFromUrl, toCountryCode } from '@/lib/country-codes';

// ---------------------------------------------------------------------------
// La trasformazione riga → mention, isolata dal database.
//
// È l'unico posto in cui si decide che cosa diventa un valore del foglio, e
// serve a TRE padroni: l'anteprima (che non scrive niente), l'import vero e
// l'esportazione del normalizzato. Tenerne una copia per ciascuno avrebbe
// significato, prima o poi, un'anteprima che promette una cosa e un import
// che ne fa un'altra.
// ---------------------------------------------------------------------------

/** Una riga normalizzata: gli stessi campi che finiscono nella tabella mention. */
export type NormalizedRow = {
  rowIndex: number;
  publishedAt: Date;
  /** true se la data non era leggibile e si è ripiegato su oggi. */
  dateFellBack: boolean;
  source: string;
  content: string;
  title: string | null;
  author: string | null;
  authorHandle: string | null;
  community: string | null;
  language: string | null;
  /** Paese (ISO alpha-2): da una colonna del foglio, o dal dominio del link. */
  country: string | null;
  url: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  engagementScore: number;
  externalId: string;
  /** Le colonne conservate ma non mappate: etichetta → valore. */
  custom: Record<string, string>;
};

export type DeriveResult = { rows: NormalizedRow[]; report: ImportReport };

/** Hash deterministico (djb2): reimportare lo stesso contenuto non duplica. */
export function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const slugSource = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'upload';

/**
 * Normalizza le righe grezze secondo la mappatura. Non tocca il database e non
 * decide nulla da sola: ciò che non è mappato resta vuoto, ciò che non si
 * interpreta viene CONTATO invece di sparire.
 *
 * `limit` serve all'anteprima: normalizza solo le prime righe utili.
 */
export function deriveRows(
  raw: Record<string, unknown>[], map: ColumnMap, fileId: number, limit?: number,
): DeriveResult {
  const get = (row: Record<string, unknown>, col?: string) => (col ? row[col] : undefined);
  const has = (col?: string) => Boolean(col && col.trim());

  const report: ImportReport = {
    total: raw.length, inserted: 0, skippedEmpty: 0, duplicates: 0,
    datesFailed: 0, sentimentImported: 0,
  };
  const seen = new Set<string>();
  const rows: NormalizedRow[] = [];

  for (const [rowIndex, row] of raw.entries()) {
    if (limit !== undefined && rows.length >= limit) break;

    // Un post senza didascalia è comunque un post: su un canale Facebook reale
    // 68 righe su 130 hanno la descrizione vuota, e scartarle significherebbe
    // buttare metà delle metriche. Si ripiega sul titolo prima di rinunciare.
    const content = cleanText(get(row, map.content)) || cleanText(get(row, map.title));
    if (!content) { report.skippedEmpty++; continue; }

    // Data: se la colonna c'è ma non si interpreta va CONTATO, non nascosto
    // dietro un fallback silenzioso a "oggi" — una data sbagliata falsa ogni
    // grafico temporale, ed è il tipo di errore che si scopre troppo tardi.
    let publishedAt = parseDateTime(get(row, map.date), has(map.time) ? get(row, map.time) : undefined);
    let dateFellBack = false;
    if (!publishedAt) {
      if (has(map.date)) report.datesFailed++;
      publishedAt = new Date();
      dateFellBack = true;
    }

    const num = (col?: string) => (has(col) ? parseNumber(get(row, col)) : undefined);
    const engagement = {
      likes: num(map.likes), comments: num(map.comments),
      shares: num(map.shares), views: num(map.views),
    };
    const hasBreakdown = Object.values(engagement).some((v) => v !== undefined);
    const score = hasBreakdown
      ? engagementScore(engagement)
      : (has(map.engagement) ? parseNumber(get(row, map.engagement)) : 0);

    const { sentiment, score: sentScore } = has(map.sentiment)
      ? parseSentiment(get(row, map.sentiment))
      : { sentiment: null, score: null };
    if (sentiment) report.sentimentImported++;

    // Le colonne conservate ma non mappate. Restano come TESTO: sono
    // dimensioni con cui si taglia l'analisi (pillar, campagna, area
    // semantica), non misure su cui si fanno somme.
    // I campi costanti del foglio valgono per ogni riga: si scrivono per
    // primi, così una colonna con lo stesso nome può ancora correggerli.
    const custom: Record<string, string> = { ...(map.constants ?? {}) };
    for (const [col, label] of Object.entries(map.extras ?? {})) {
      const v = cleanText(get(row, col));
      if (v) custom[label || col] = v;
    }

    const author = has(map.author) ? cleanText(get(row, map.author)) || null : null;
    // L'id include il file: due file diversi possono contenere legittimamente
    // lo stesso post (finestre temporali sovrapposte) e vanno tenuti distinti
    // per poter rimuovere un file senza cancellare le righe dell'altro.
    const externalId = hashId(`${fileId}|${content}|${author ?? ''}|${publishedAt.toISOString()}`);
    if (seen.has(externalId)) { report.duplicates++; continue; }
    seen.add(externalId);

    rows.push({
      rowIndex,
      publishedAt, dateFellBack,
      source: has(map.source) ? slugSource(String(get(row, map.source) ?? 'upload')) : 'upload',
      content,
      title: has(map.title) ? cleanText(get(row, map.title)) || null : null,
      author,
      authorHandle: has(map.authorHandle) ? cleanText(get(row, map.authorHandle)) || null : null,
      community: has(map.community) ? cleanText(get(row, map.community)) || null : null,
      language: has(map.language) ? parseLanguage(get(row, map.language)) : null,
      // Il paese: dalla colonna se il foglio ce l'ha (scritto come vuole —
      // "Italia", "IT", "380"), altrimenti dal dominio nazionale del link.
      country: (has(map.country) ? toCountryCode(cleanText(get(row, map.country))) : null)
        ?? countryFromUrl(has(map.url) ? cleanText(get(row, map.url)) : null),
      url: has(map.url) ? cleanText(get(row, map.url)) || null : null,
      sentiment, sentimentScore: sentScore,
      reach: has(map.reach) ? Math.round(parseNumber(get(row, map.reach))) || null : null,
      likes: engagement.likes ?? null,
      comments: engagement.comments ?? null,
      shares: engagement.shares ?? null,
      views: engagement.views ?? null,
      engagementScore: score,
      externalId,
      custom,
    });
  }

  return { rows, report };
}
