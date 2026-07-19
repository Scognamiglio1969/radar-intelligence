import ExcelJS from 'exceljs';
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
  author?: string;
  source?: string;
  url?: string;
  engagement?: string;
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

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'upload';

/** Mappa le righe del foglio in mention e le inserisce (dedup via external_id). */
export async function commitSheet(projectId: number, buffer: Buffer, filename: string, map: ColumnMap): Promise<{ inserted: number; skipped: number; total: number }> {
  const { rows } = await parseSheet(buffer, filename);
  const get = (row: Record<string, unknown>, col?: string) => (col ? row[col] : undefined);

  const values = [] as (typeof mentions.$inferInsert)[];
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const content = String(get(row, map.content) ?? '').trim();
    if (!content) { skipped++; continue; }
    const source = map.source ? slug(String(get(row, map.source) ?? 'upload')) : 'upload';
    const title = map.title ? String(get(row, map.title) ?? '').trim() || null : null;
    const author = map.author ? String(get(row, map.author) ?? '').trim() || null : null;
    const url = map.url ? String(get(row, map.url) ?? '').trim() || null : null;
    const publishedAt = (map.date && parseDate(get(row, map.date))) || new Date();
    const engRaw = map.engagement ? Number(String(get(row, map.engagement) ?? '').replace(/[^0-9.-]/g, '')) : 0;
    const engagementScore = Number.isFinite(engRaw) ? engRaw : 0;
    values.push({
      projectId, source,
      externalId: hash(`${content}|${author ?? ''}|${publishedAt.toISOString()}`),
      url, title, content, author,
      publishedAt,
      engagementScore,
    });
  }

  const db = await getDb();
  let inserted = 0;
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    const res = await db.insert(mentions).values(chunk).onConflictDoNothing().returning({ id: mentions.id });
    inserted += res.length;
  }
  return { inserted, skipped, total: rows.length };
}
