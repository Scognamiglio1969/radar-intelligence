import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { importFiles, importRows, mentions } from '@/lib/db/schema';
import { parseSheet, type ColumnMap, type ImportReport, type SheetIssues } from '@/lib/import';
import { buildProposal, profileColumns, type ColumnProfile, type FieldProposal } from '@/lib/import-profile';
import { deriveRows } from '@/lib/import-derive';

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

  // La trasformazione riga → mention vive in lib/import-derive: la stessa
  // funzione serve l'anteprima e l'esportazione del normalizzato, così quello
  // che l'anteprima mostra è esattamente quello che l'import scrive.
  const { rows: norm, report } = deriveRows(raw.map((r) => r.data as Record<string, unknown>), map, fileId);

  const values: (typeof mentions.$inferInsert)[] = norm.map((n) => ({
    projectId, importFileId: fileId,
    source: n.source, externalId: n.externalId,
    url: n.url, title: n.title, content: n.content, author: n.author,
    authorHandle: n.authorHandle, community: n.community, language: n.language,
    publishedAt: n.publishedAt,
    engagement: (n.likes ?? n.comments ?? n.shares ?? n.views) !== null
      ? {
        likes: n.likes ?? undefined, comments: n.comments ?? undefined,
        shares: n.shares ?? undefined, views: n.views ?? undefined,
      }
      : undefined,
    engagementScore: n.engagementScore,
    reach: n.reach,
    sentiment: n.sentiment, sentimentScore: n.sentimentScore,
    analyzedAt: n.sentiment ? new Date() : null,
  }));

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

/** La mappatura salvata di un file, per chi deve normalizzare senza ricaricarla. */
export async function fileMapping(fileId: number, projectId: number): Promise<Record<string, string> | null> {
  const db = await getDb();
  const [f] = await db.select({ mapping: importFiles.mapping }).from(importFiles)
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
  return f?.mapping ?? null;
}

/**
 * Tutte le righe grezze di un file. Serve all'esportazione del normalizzato,
 * che deve poter rileggere l'originale senza passare dalle mention (le quali
 * hanno già perso le colonne non mappate).
 */
export async function allRawRows(fileId: number): Promise<Record<string, unknown>[]> {
  const db = await getDb();
  const rows = await db.select({ data: importRows.data }).from(importRows)
    .where(eq(importRows.fileId, fileId)).orderBy(asc(importRows.rowIndex));
  return rows.map((r) => r.data as Record<string, unknown>);
}
