import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { importFiles, importRows, mentions } from '@/lib/db/schema';
import { parseSheet, type ColumnMap, type ImportReport, type SheetIssues } from '@/lib/import';
import { buildProposal, profileColumns, type ColumnProfile, type FieldProposal } from '@/lib/import-profile';
import {
  cleanText, engagementScore, parseDateTime, parseLanguage, parseNumber, parseSentiment,
} from '@/lib/import-normalize';

// ---------------------------------------------------------------------------
// Ciclo di vita di un file importato.
//
// Il file NON viene consumato al primo inserimento: le sue righe restano in
// archivio esattamente come stavano nel foglio, e le mention si DERIVANO dalla
// mappatura corrente. Questo è ciò che rende l'import ripetibile: cambiare
// l'assegnazione di una colonna significa ri-derivare, senza ricaricare nulla e
// senza perdere l'originale.
//
// Il legame mentions.import_file_id permette di rifare o cancellare un singolo
// file lasciando intatto tutto il resto del progetto — cosa impossibile
// quando l'import era un'operazione sola e senza memoria.
// ---------------------------------------------------------------------------

const CHUNK = 400;

/** Hash deterministico (djb2): reimportare lo stesso contenuto non duplica. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'upload';

export type ImportFileRow = {
  id: number; filename: string; sizeBytes: number; rowCount: number;
  columns: string[]; profiles: ColumnProfile[]; proposal: FieldProposal[] | null;
  mapping: Record<string, string>; status: 'uploaded' | 'mapped' | 'imported';
  report: Record<string, number> | null; rawPurged: boolean; usedAi: boolean;
  issues: Record<string, number> | null;
  createdAt: Date; importedAt: Date | null;
};

/** Legge il foglio, ne conserva le righe grezze e chiede all'AI una proposta. */
export async function registerFile(
  projectId: number, buffer: Buffer, filename: string,
): Promise<{
  fileId: number; columns: string[]; profiles: ColumnProfile[]; proposal: FieldProposal[];
  usedAi: boolean; total: number; issues: SheetIssues;
}> {
  const { columns, rows, issues } = await parseSheet(buffer, filename);
  if (columns.length === 0) throw new Error('Il file non ha colonne leggibili');

  const profiles = profileColumns(columns, rows);
  // Riconoscimento deterministico sempre presente, raffinato dall'AI quando
  // risponde: la chiamata al modello è un servizio esterno e non deve poter
  // lasciare l'utente davanti a un file completamente non mappato.
  const { proposal, usedAi } = await buildProposal(profiles, rows.length);

  // Mappatura iniziale dalle sole proposte convincenti: le incerte restano
  // visibili nel pannello ma non entrano in vigore da sole.
  const mapping: Record<string, string> = {};
  for (const p of proposal) {
    if (p.field && p.confidence && p.confidence !== 'bassa') mapping[p.field] = p.column;
  }

  const db = await getDb();
  const [file] = await db.insert(importFiles).values({
    projectId, filename, sizeBytes: buffer.length, rowCount: rows.length,
    columns, profiles, proposal, mapping, usedAi: usedAi ? 1 : 0, status: 'uploaded',
    issues,
  }).returning({ id: importFiles.id });

  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(importRows).values(
      rows.slice(i, i + CHUNK).map((data, k) => ({ fileId: file.id, rowIndex: i + k, data })),
    );
  }

  return { fileId: file.id, columns, profiles, proposal, usedAi, total: rows.length, issues };
}

export async function listFiles(projectId: number): Promise<ImportFileRow[]> {
  const db = await getDb();
  const rows = await db.select().from(importFiles)
    .where(eq(importFiles.projectId, projectId))
    .orderBy(desc(importFiles.createdAt));
  return rows.map((r) => ({
    id: r.id, filename: r.filename, sizeBytes: r.sizeBytes, rowCount: r.rowCount,
    columns: r.columns, profiles: (r.profiles ?? []) as ColumnProfile[],
    proposal: (r.proposal ?? null) as FieldProposal[] | null,
    mapping: r.mapping, status: r.status, report: r.report ?? null,
    rawPurged: r.rawPurged === 1, usedAi: r.usedAi === 1, issues: r.issues ?? null,
    createdAt: r.createdAt, importedAt: r.importedAt,
  }));
}

/** Cambia la mappatura. Non tocca le mention già derivate: serve un re-import. */
export async function updateMapping(fileId: number, projectId: number, mapping: Record<string, string>): Promise<void> {
  const db = await getDb();
  await db.update(importFiles)
    .set({ mapping, status: mapping.content ? 'mapped' : 'uploaded' })
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
}

/**
 * Deriva le mention dalle righe grezze secondo la mappatura corrente.
 * Un re-import CANCELLA prima le mention prodotte da questo file: senza,
 * cambiare mappatura lascerebbe in archivio le righe della versione
 * precedente, e il progetto conterrebbe due letture dello stesso file.
 */
export async function deriveMentions(fileId: number, projectId: number): Promise<ImportReport> {
  const db = await getDb();
  const [file] = await db.select().from(importFiles)
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
  if (!file) throw new Error('File non trovato');
  if (file.rawPurged === 1) throw new Error('Le righe grezze di questo file sono state eliminate: non è più ri-derivabile');

  const map = file.mapping as ColumnMap;
  if (!map.content) throw new Error('Manca la colonna del testo');

  await db.delete(mentions).where(eq(mentions.importFileId, fileId));

  const raw = await db.select({ data: importRows.data }).from(importRows)
    .where(eq(importRows.fileId, fileId)).orderBy(asc(importRows.rowIndex));

  const get = (row: Record<string, unknown>, col?: string) => (col ? row[col] : undefined);
  const has = (col?: string) => Boolean(col && col.trim());
  const report: ImportReport = {
    total: raw.length, inserted: 0, skippedEmpty: 0, duplicates: 0,
    datesFailed: 0, sentimentImported: 0,
  };
  const seen = new Set<string>();
  const values: (typeof mentions.$inferInsert)[] = [];

  for (const { data } of raw) {
    const row = data as Record<string, unknown>;
    const content = cleanText(get(row, map.content));
    if (!content) { report.skippedEmpty++; continue; }

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
    const score = hasBreakdown
      ? engagementScore(engagement)
      : (has(map.engagement) ? parseNumber(get(row, map.engagement)) : 0);

    const { sentiment, score: sentScore } = has(map.sentiment)
      ? parseSentiment(get(row, map.sentiment))
      : { sentiment: null, score: null };
    if (sentiment) report.sentimentImported++;

    const author = has(map.author) ? cleanText(get(row, map.author)) || null : null;
    // L'id include il file: due file diversi possono contenere legittimamente
    // lo stesso post (finestre temporali sovrapposte) e vanno tenuti distinti
    // per poter rimuovere un file senza cancellare le righe dell'altro.
    const externalId = hash(`${fileId}|${content}|${author ?? ''}|${publishedAt.toISOString()}`);
    if (seen.has(externalId)) { report.duplicates++; continue; }
    seen.add(externalId);

    values.push({
      projectId, importFileId: fileId,
      source: has(map.source) ? slug(String(get(row, map.source) ?? 'upload')) : 'upload',
      externalId,
      url: has(map.url) ? cleanText(get(row, map.url)) || null : null,
      title: has(map.title) ? cleanText(get(row, map.title)) || null : null,
      content, author,
      authorHandle: has(map.authorHandle) ? cleanText(get(row, map.authorHandle)) || null : null,
      community: has(map.community) ? cleanText(get(row, map.community)) || null : null,
      language: has(map.language) ? parseLanguage(get(row, map.language)) : null,
      publishedAt,
      engagement: hasBreakdown ? engagement : undefined,
      engagementScore: score,
      reach: has(map.reach) ? Math.round(parseNumber(get(row, map.reach))) || null : null,
      sentiment, sentimentScore: sentScore,
      analyzedAt: sentiment ? new Date() : null,
    });
  }

  for (let i = 0; i < values.length; i += 500) {
    const res = await db.insert(mentions).values(values.slice(i, i + 500))
      .onConflictDoNothing().returning({ id: mentions.id });
    report.inserted += res.length;
  }
  report.duplicates += values.length - report.inserted;

  await db.update(importFiles)
    .set({ status: 'imported', report: report as unknown as Record<string, number>, importedAt: new Date() })
    .where(eq(importFiles.id, fileId));
  return report;
}

/** Rimuove il file, le sue righe grezze e le mention che ne derivano. */
export async function deleteFile(fileId: number, projectId: number): Promise<void> {
  const db = await getDb();
  await db.delete(mentions).where(eq(mentions.importFileId, fileId));
  await db.delete(importFiles).where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
}

/**
 * Elimina le sole righe grezze per liberare spazio, conservando file,
 * mappatura ed esito. Le mention restano: si perde la possibilità di
 * ri-derivare, ed è per questo che l'azione va confermata esplicitamente.
 */
export async function purgeRaw(fileId: number, projectId: number): Promise<void> {
  const db = await getDb();
  const [file] = await db.select({ id: importFiles.id }).from(importFiles)
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
  if (!file) throw new Error('File non trovato');
  await db.delete(importRows).where(eq(importRows.fileId, fileId));
  await db.update(importFiles).set({ rawPurged: 1 }).where(eq(importFiles.id, fileId));
}

/** Anteprima delle prime righe grezze, per controllare una mappatura prima di applicarla. */
export async function sampleRows(fileId: number, limit = 8): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.select({ data: importRows.data }).from(importRows)
    .where(eq(importRows.fileId, fileId)).orderBy(asc(importRows.rowIndex)).limit(limit);
  return rows.map((r) => r.data as Record<string, unknown>);
}

/** Quante mention del progetto vengono da file importati (per la pagina). */
export async function importedCount(projectId: number): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), sql`${mentions.importFileId} is not null`));
  return Number(r?.n ?? 0);
}
