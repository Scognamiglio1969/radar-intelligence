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

/**
 * Cosa è stato incontrato leggendo il foglio. Serve a dirlo all'utente: un
 * file pieno di formule senza valore in cache è indistinguibile, a valle, da
 * un file con le colonne vuote — e la differenza cambia cosa deve fare.
 */
export type SheetIssues = { formulas: number; formulaErrors: number; formulaNoValue: number };

export type ParsedSheet = {
  columns: string[]; rows: Record<string, unknown>[]; total: number; issues: SheetIssues;
  /** Da quale foglio arrivano queste righe (vuoto per i CSV). */
  sheet?: string;
  /** Riga usata come intestazione (1-based): non è sempre la prima. */
  headerRow?: number;
};

/** Un foglio del file, come si presenta prima di decidere se importarlo. */
export type SheetInfo = {
  name: string;
  hidden: boolean;
  /** Righe di DATI reali, già al netto dell'intestazione e delle righe vuote. */
  rows: number;
  columns: number;
  headerRow: number;
  /** Le intestazioni trovate, per far capire cosa c'è dentro senza aprirlo. */
  headers: string[];
  /** Vero se l'intestazione è su due righe fuse (blocchi tipo "DATI COMPANY"). */
  twoRowHeader: boolean;
};

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
  /**
   * Le colonne che non sono un campo di Radar ma che vanno conservate lo
   * stesso: nome della colonna → etichetta con cui compariranno.
   *
   * Senza questo, un database editoriale perde PILLAR, RUBRICA, CAMPAGNA e
   * CAT. TRASVERSALE — cioè proprio le dimensioni con cui quel lavoro viene
   * letto. Un campo non riconosciuto non è un campo inutile.
   */
  extras?: Record<string, string>;
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

/**
 * Il valore di una cella, non la sua definizione.
 *
 * Su una cella con formula conta SOLO il risultato calcolato: molti export di
 * listening sommano l'engagement dentro al foglio, e leggere "=B2+C2" invece
 * di 15 significherebbe importare zero. Excel salva sempre il valore in cache
 * accanto alla formula, ed è quello che si prende.
 *
 * Tre casi vanno distinti, perché a valle sono indistinguibili e non lo sono:
 *  - risultato normale → si usa (ricorsivamente: può essere una data o rich text);
 *  - risultato di ERRORE (#DIV/0!, #N/A) → è un oggetto, e lasciarlo passare
 *    faceva finire "[object Object]" nella colonna;
 *  - formula SENZA valore in cache → il file è stato scritto da uno strumento
 *    che non calcola. Non c'è niente da recuperare, ma va detto.
 */
/** Gli errori di Excel scritti come testo: valgono quanto una cella vuota. */
const ERROR_TEXT = /^#(VALUE|REF|NAME|DIV\/0|N\/A|NULL|NUM|SPILL|CALC|GETTING_DATA)[!?]?$/i;

function normalizeCell(v: unknown, issues?: SheetIssues, depth = 0): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' && ERROR_TEXT.test(v.trim())) return null;
  if (typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;

  if ('formula' in o || 'sharedFormula' in o) {
    if (issues) issues.formulas++;
    if (!('result' in o) || o.result === undefined || o.result === null) {
      if (issues) issues.formulaNoValue++;
      return null;
    }
    const r = o.result;
    if (r && typeof r === 'object' && 'error' in (r as Record<string, unknown>)) {
      if (issues) issues.formulaErrors++;
      return null;
    }
    // Il risultato può essere a sua volta strutturato (data, rich text): si
    // rinormalizza, ma senza ricontarlo come formula e senza scendere all'infinito.
    return depth > 2 ? null : normalizeCell(r, undefined, depth + 1);
  }

  if ('error' in o) return null;                       // cella di errore diretta
  if ('sharedFormula' in o) return null;               // condivisa senza risultato
  if ('richText' in o && Array.isArray(o.richText)) {
    return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
  }
  if ('text' in o) return o.text;                      // hyperlink
  if ('hyperlink' in o) return o.hyperlink;
  return null;
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

const isBlank = (v: unknown) => v == null || String(v).trim() === '';

/**
 * La griglia di un foglio, ridotta alla sua estensione REALE.
 *
 * `ws.rowCount` e `ws.columnCount` contano anche le righe e le colonne solo
 * FORMATTATE: su database veri gonfiano fino a 27 volte (un foglio che dichiara
 * 998 righe ne ha 36). Fidarsene significa importare migliaia di righe fantasma
 * e, peggio, falsare la percentuale di riempimento delle colonne — che è il
 * criterio con cui Radar riconosce che cosa contiene ciascuna colonna.
 */
function grid(ws: ExcelJS.Worksheet, issues?: SheetIssues, maxRows = 200_000): unknown[][] {
  const out: unknown[][] = [];
  let lastRow = 0, lastCol = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum > maxRows) return;
    const vals: unknown[] = [];
    let rowHasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const v = normalizeCell(cell.value, issues);
      vals[colNum - 1] = v;
      if (!isBlank(v)) { rowHasValue = true; if (colNum > lastCol) lastCol = colNum; }
    });
    if (rowHasValue) { out[rowNum - 1] = vals; lastRow = rowNum; }
  });
  const g: unknown[][] = [];
  for (let r = 0; r < lastRow; r++) {
    const src = out[r] ?? [];
    g.push(Array.from({ length: lastCol }, (_, c) => src[c] ?? null));
  }
  return g;
}

/**
 * Quale riga è l'intestazione.
 *
 * Non è sempre la prima: i database veri antepongono titoli, note e righe
 * vuote. Si cerca la prima riga densa e testuale seguita da almeno una riga di
 * dati — e la si preferisce a una riga di titoli di sezione, che è sparsa.
 */
/** Una riga di ETICHETTE: due o più celle, testo corto, niente frasi. */
function looksLikeLabels(row: unknown[] = []): boolean {
  const filled = row.filter((v) => !isBlank(v));
  if (filled.length < 2) return false;
  const short = filled.filter((v) => typeof v === 'string' && String(v).trim().length <= 60);
  if (short.length < filled.length * 0.7) return false;
  return !filled.some((v) => typeof v === 'string' && String(v).length > 100);
}

/** Una riga di DATI: numeri, date, o testo lungo. */
function looksLikeData(row: unknown[] = []): boolean {
  const filled = row.filter((v) => !isBlank(v));
  if (!filled.length) return false;
  return filled.some((v) => typeof v === 'number' || v instanceof Date
    || (typeof v === 'string' && String(v).length > 80));
}

/**
 * Quale riga è l'intestazione.
 *
 * Non è sempre la prima: i database veri antepongono titoli, note e righe
 * vuote. Si cerca la prima riga di ETICHETTE seguita da una riga di DATI.
 *
 * Il criterio non è la larghezza: un foglio reale ha 17 intestazioni sopra
 * righe da 64 celle, e misurare l'intestazione sulla riga più larga la faceva
 * scartare — con il risultato che i nomi delle colonne diventavano il testo
 * del primo post.
 */
function findHeaderRow(g: unknown[][]): number {
  const look = Math.min(g.length, 15);
  for (let r = 0; r < look; r++) {
    if (!looksLikeLabels(g[r])) continue;
    const next = g[r + 1];
    if (looksLikeData(next)) return r;
    // Due righe di etichette di fila: è un cappello sopra la tabella vera.
    if (looksLikeLabels(next) && looksLikeGroupRow(g[r], next)) return r;
  }
  for (let r = 0; r < g.length; r++) {
    if ((g[r] ?? []).some((v) => !isBlank(v))) return r;
  }
  return 0;
}

/**
 * Intestazione su DUE righe: la prima nomina il blocco, la seconda il campo
 * ("DATI COMPANY" sopra "DATA POST | AZIENDA | %"). Succede nei fogli di
 * audience, dove più tabelle stanno affiancate sulla stessa griglia. Fondendole
 * si ottengono nomi non ambigui invece di tre colonne tutte chiamate "AZIENDA".
 */
function mergeTwoRowHeader(top: unknown[], bottom: unknown[]): string[] {
  let group = '';
  return bottom.map((b, i) => {
    const t = isBlank(top[i]) ? '' : String(top[i]).trim();
    if (t) group = t;
    const f = isBlank(b) ? '' : String(b).trim();
    if (!f) return t || '';
    return group ? `${group} · ${f}` : f;
  });
}

function looksLikeGroupRow(top: unknown[], bottom: unknown[]): boolean {
  const tf = top.filter((v) => !isBlank(v));
  const bf = bottom.filter((v) => !isBlank(v));
  if (tf.length < 2 || bf.length < 2) return false;
  // Due indizi che la riga di sopra sia un CAPPELLO e non l'intestazione:
  //  - è sparsa, con la tabella vera densa sotto;
  //  - contiene lo stesso valore in colonne ADIACENTI, che è ciò che produce
  //    una cella unita. Una semplice ripetizione non basta: un'intestazione
  //    vera può contenere due volte "PILLAR" in punti diversi del foglio, e
  //    quella è una colonna duplicata, non un blocco.
  const sparse = bf.length >= tf.length * 2 && tf.length / Math.max(1, top.length) < 0.4;
  let adjacent = false;
  for (let i = 1; i < top.length; i++) {
    if (!isBlank(top[i]) && String(top[i]).trim() === String(top[i - 1] ?? '').trim()) { adjacent = true; break; }
  }
  if (!sparse && !adjacent) return false;

  // La riga sotto deve essere fatta di NOMI, non di dati.
  const texty = bf.filter((v) => typeof v === 'string').length;
  if (texty < bf.length * 0.8) return false;

  // E la fusione deve servire a qualcosa: se non aumenta i nomi distinti,
  // non stiamo disambiguando niente e conviene lasciare l'intestazione com'è.
  const distinctTop = new Set(top.map((v, i) => (isBlank(v) ? `c${i}` : String(v).trim().toLowerCase()))).size;
  const distinctMerged = new Set(mergeTwoRowHeader(top, bottom).map((s, i) => s || `c${i}`)).size;
  return distinctMerged > distinctTop;
}

/** Nomi di colonna sempre presenti e sempre distinti. */
function nameColumns(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((v, i) => {
    let name = isBlank(v) ? `Colonna ${i + 1}` : String(v).replace(/\s+/g, ' ').trim();
    // Un'intestazione ripetuta nello stesso foglio esiste davvero (un file
    // reale ha "PILLAR" due volte): senza rinominarla, la seconda colonna
    // sovrascriverebbe la prima e quei dati sparirebbero.
    const n = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), n + 1);
    if (n > 0) name = `${name} (${n + 1})`;
    return name;
  });
}

export type ParseOptions = {
  /** Nome del foglio (o indice 0-based). Assente = il primo foglio visibile. */
  sheet?: string | number;
  /** Riga d'intestazione forzata (1-based); assente = rilevata. */
  headerRow?: number;
};

/** Che fogli contiene il file, senza importarne nessuno. */
export async function listSheets(buffer: Buffer, filename: string): Promise<SheetInfo[]> {
  if (/\.csv$/i.test(filename)) {
    const { columns, total, headerRow } = await parseSheet(buffer, filename);
    return [{
      name: 'CSV', hidden: false, rows: total, columns: columns.length,
      headerRow: headerRow ?? 1, headers: columns, twoRowHeader: false,
    }];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    // Il campione basta a capire forma e intestazione: leggere per intero 25
    // fogli solo per elencarli costerebbe minuti su file da 4 MB.
    const g = grid(ws, undefined, 60);
    if (!g.length) {
      return { name: ws.name, hidden: ws.state !== 'visible', rows: 0, columns: 0, headerRow: 1, headers: [], twoRowHeader: false };
    }
    const h = findHeaderRow(g);
    const two = h + 1 < g.length && looksLikeGroupRow(g[h], g[h + 1]);
    const headers = nameColumns(two ? mergeTwoRowHeader(g[h], g[h + 1]) : g[h]);
    // Le righe totali vanno contate sul foglio intero, non sul campione.
    let last = 0;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      let any = false;
      row.eachCell({ includeEmpty: false }, (c) => { if (!isBlank(normalizeCell(c.value))) any = true; });
      if (any) last = n;
    });
    return {
      name: ws.name,
      hidden: ws.state !== 'visible',
      rows: Math.max(0, last - (h + (two ? 2 : 1))),
      columns: headers.filter((x) => x && !/^Colonna \d+$/.test(x)).length,
      headerRow: h + 1,
      headers,
      twoRowHeader: two,
    };
  });
}

/** Legge un buffer .xlsx/.csv e restituisce colonne + righe (oggetti per header). */
export async function parseSheet(
  buffer: Buffer, filename: string, opts: ParseOptions = {},
): Promise<ParsedSheet> {
  const isCsv = /\.csv$/i.test(filename);
  const issues: SheetIssues = { formulas: 0, formulaErrors: 0, formulaNoValue: 0 };

  let g: unknown[][];
  let sheetName: string | undefined;
  if (isCsv) {
    g = parseCsv(buffer.toString('utf8'));
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = typeof opts.sheet === 'number' ? wb.worksheets[opts.sheet]
      : opts.sheet ? wb.getWorksheet(opts.sheet)
        : (wb.worksheets.find((w) => w.state === 'visible') ?? wb.worksheets[0]);
    if (!ws) return { columns: [], rows: [], total: 0, issues };
    sheetName = ws.name;
    g = grid(ws, issues);
  }
  if (!g.length) return { columns: [], rows: [], total: 0, issues, sheet: sheetName };

  const h = opts.headerRow ? Math.max(0, opts.headerRow - 1) : findHeaderRow(g);
  const two = h + 1 < g.length && looksLikeGroupRow(g[h], g[h + 1]);
  const columns = nameColumns(two ? mergeTwoRowHeader(g[h], g[h + 1]) : g[h]);

  const rows: Record<string, unknown>[] = [];
  for (let r = h + (two ? 2 : 1); r < g.length; r++) {
    const line = g[r];
    const obj: Record<string, unknown> = {};
    columns.forEach((name, i) => { obj[name] = line[i] ?? null; });
    if (columns.some((name) => !isBlank(obj[name]))) rows.push(obj);
  }
  return { columns, rows, total: rows.length, issues, sheet: sheetName, headerRow: h + 1 };
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
