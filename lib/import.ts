import ExcelJS from 'exceljs';
import {
  cleanText, engagementScore, parseDateTime, parseLanguage, parseNumber, parseSentiment,
} from '@/lib/import-normalize';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Ingestion di file (Excel / CSV) per i progetti in modalità "upload".
// Le righe del foglio vengono mappate sui campi di una `mention`, così tutto il
// motore di analisi di Radar (sentiment, emozioni, topic, insight, export) le
// tratta esattamente come le mention raccolte dallo scraping.
// ---------------------------------------------------------------------------

export type ParsedSheet = { columns: string[]; rows: Record<string, unknown>[]; total: number };

/** Mappa: campo di Radar → nome colonna del file ('' = non mappato). */
export type ColumnMap = {
  content: string;                 // OBBLIGATORIO: il testo da analizzare
  title?: string;
  date?: string;
  /** Ora in colonna separata dalla data: normale negli export di listening. */
  time?: string;
  author?: string;
  authorHandle?: string;
  source?: string;
  url?: string;
  language?: string;
  community?: string;
  country?: string;
  /** Sentiment già calcolato dallo strumento di provenienza. */
  sentiment?: string;
  reach?: string;
  likes?: string;
  comments?: string;
  shares?: string;
  views?: string;
  /** Engagement già aggregato: usato solo se mancano le colonne separate. */
  engagement?: string;
};

/** Esito dell'import, con il dettaglio di cosa NON è passato e perché. */
export type ImportReport = {
  total: number;
  inserted: number;
  skippedEmpty: number;
  duplicates: number;
  /** Righe in cui la colonna data c'era ma non è stata interpretata. */
  datesFailed: number;
  sentimentImported: number;
};

function normalizeCell(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('text' in o) return o.text;                    // hyperlink / rich text
    if ('result' in o) return o.result;                // formula
    if ('richText' in o && Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    }
    return null;
  }
  return v;
}

/** CSV robusto (gestisce virgolette, virgole e newline dentro i campi). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Legge un buffer .xlsx/.csv e restituisce colonne + righe (oggetti per header). */
export async function parseSheet(buffer: Buffer, filename: string): Promise<ParsedSheet> {
  const isCsv = /\.csv$/i.test(filename);
  let columns: string[] = [];
  const rows: Record<string, unknown>[] = [];

  if (isCsv) {
    const matrix = parseCsv(buffer.toString('utf8'));
    if (matrix.length === 0) return { columns: [], rows: [], total: 0 };
    columns = matrix[0].map((h, i) => (h.trim() || `Column ${i + 1}`));
    for (let r = 1; r < matrix.length; r++) {
      const obj: Record<string, unknown> = {};
      columns.forEach((h, i) => { obj[h] = matrix[r][i] ?? null; });
      rows.push(obj);
    }
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return { columns: [], rows: [], total: 0 };
    ws.getRow(1).eachCell((cell, col) => { columns[col - 1] = String(cell.value ?? `Column ${col}`).trim() || `Column ${col}`; });
    for (let i = 0; i < columns.length; i++) if (!columns[i]) columns[i] = `Column ${i + 1}`;
    ws.eachRow((r, rowNum) => {
      if (rowNum === 1) return;
      const obj: Record<string, unknown> = {};
      columns.forEach((h, idx) => { obj[h] = normalizeCell(r.getCell(idx + 1).value); });
      if (columns.some((h) => obj[h] != null && String(obj[h]).trim() !== '')) rows.push(obj);
    });
  }
  return { columns, rows, total: rows.length };
}

// Hash deterministico (djb2) per l'external_id: reimportare lo stesso file non
// duplica le righe (grazie allo UNIQUE (project_id, source, external_id)).
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'upload';

/** Mappa le righe del foglio in mention e le inserisce (dedup via external_id). */
export async function commitSheet(projectId: number, buffer: Buffer, filename: string, map: ColumnMap): Promise<ImportReport> {
  const { rows } = await parseSheet(buffer, filename);
  const get = (row: Record<string, unknown>, col?: string) => (col ? row[col] : undefined);
  const has = (col?: string) => Boolean(col && col.trim());

  const values = [] as (typeof mentions.$inferInsert)[];
  const report: ImportReport = {
    total: rows.length, inserted: 0, skippedEmpty: 0, duplicates: 0,
    datesFailed: 0, sentimentImported: 0,
  };
  const seen = new Set<string>();

  for (const row of rows) {
    const content = cleanText(get(row, map.content));
    if (!content) { report.skippedEmpty++; continue; }

    // Data: se la colonna c'è ma non si interpreta va CONTATO, non nascosto
    // dietro un fallback silenzioso a "oggi" — una data sbagliata falsa ogni
    // grafico temporale, ed è il tipo di errore che si scopre troppo tardi.
    let publishedAt = parseDateTime(get(row, map.date), has(map.time) ? get(row, map.time) : undefined);
    if (!publishedAt) {
      if (has(map.date)) report.datesFailed++;
      publishedAt = new Date();
    }

    const engagement = {
      likes: has(map.likes) ? parseNumber(get(row, map.likes)) : undefined,
      comments: has(map.comments) ? parseNumber(get(row, map.comments)) : undefined,
      shares: has(map.shares) ? parseNumber(get(row, map.shares)) : undefined,
      views: has(map.views) ? parseNumber(get(row, map.views)) : undefined,
    };
    const hasBreakdown = Object.values(engagement).some((v) => v !== undefined);
    // Il totale aggregato si usa solo in mancanza del dettaglio: sommarli
    // entrambi conterebbe due volte le stesse interazioni.
    const score = hasBreakdown
      ? engagementScore(engagement)
      : (has(map.engagement) ? parseNumber(get(row, map.engagement)) : 0);

    const { sentiment, score: sentScore } = has(map.sentiment)
      ? parseSentiment(get(row, map.sentiment))
      : { sentiment: null, score: null };
    if (sentiment) report.sentimentImported++;

    const author = has(map.author) ? cleanText(get(row, map.author)) || null : null;
    const externalId = hash(`${content}|${author ?? ''}|${publishedAt.toISOString()}`);
    // Deduplica anche DENTRO il file, non solo verso il database: gli export
    // di listening contengono spesso la stessa citazione ripetuta su più righe.
    if (seen.has(externalId)) { report.duplicates++; continue; }
    seen.add(externalId);

    values.push({
      projectId,
      source: has(map.source) ? slug(String(get(row, map.source) ?? 'upload')) : 'upload',
      externalId,
      url: has(map.url) ? cleanText(get(row, map.url)) || null : null,
      title: has(map.title) ? cleanText(get(row, map.title)) || null : null,
      content,
      author,
      authorHandle: has(map.authorHandle) ? cleanText(get(row, map.authorHandle)) || null : null,
      community: has(map.community) ? cleanText(get(row, map.community)) || null : null,
      language: has(map.language) ? parseLanguage(get(row, map.language)) : null,
      publishedAt,
      engagement: hasBreakdown ? engagement : undefined,
      engagementScore: score,
      reach: has(map.reach) ? Math.round(parseNumber(get(row, map.reach))) || null : null,
      sentiment,
      sentimentScore: sentScore,
      // Il sentiment importato conta come analisi gia fatta: senza questo la
      // pipeline lo rianalizzerebbe con l'AI, pagando per un dato presente.
      analyzedAt: sentiment ? new Date() : null,
    });
  }

  const db = await getDb();
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    const res = await db.insert(mentions).values(chunk).onConflictDoNothing().returning({ id: mentions.id });
    report.inserted += res.length;
  }
  report.duplicates += values.length - report.inserted;
  return report;
}
