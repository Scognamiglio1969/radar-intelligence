import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { importFiles, importRows, mentions, metricPoints } from '@/lib/db/schema';
import { parseSheet, type ColumnMap, type ImportReport, type SheetIssues } from '@/lib/import';
import {
  buildProposal, profileColumns, proposeExtras, type ColumnProfile, type FieldProposal,
} from '@/lib/import-profile';
import {
  deriveMetrics, looksLikeMetrics, proposeMetricMap, type MetricMap, type MetricReport,
} from '@/lib/import-metrics';
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
  sheetName: string | null;
  kind: 'mentions' | 'metrics';
  metricMap: Record<string, unknown> | null;
  extras: Record<string, string>;
  createdAt: Date; importedAt: Date | null;
};

/** Legge il foglio, ne conserva le righe grezze e chiede all'AI una proposta. */
export async function registerFile(
  projectId: number, buffer: Buffer, filename: string, sheetName?: string,
): Promise<{
  fileId: number; columns: string[]; profiles: ColumnProfile[]; proposal: FieldProposal[];
  usedAi: boolean; total: number; issues: SheetIssues; kind: 'mentions' | 'metrics';
}> {
  const { columns, rows, issues } = await parseSheet(buffer, filename, { sheet: sheetName });
  if (columns.length === 0) throw new Error('Il foglio non ha colonne leggibili');

  const profiles = profileColumns(columns, rows);

  // Che cosa è questo foglio? Una tabella di post o una tabella di misure.
  // È la prima domanda da fare, perché cambia tutto ciò che viene dopo: una
  // serie di follower mensili trattata come post darebbe 36 "mention" senza
  // testo, e nessun grafico sensato.
  const kind: 'mentions' | 'metrics' = looksLikeMetrics(profiles, rows.length) ? 'metrics' : 'mentions';

  let proposal: FieldProposal[] = [];
  let usedAi = false;
  const mapping: Record<string, string> = {};
  const extras: Record<string, string> = {};
  let metricMap: Record<string, unknown> | null = null;

  if (kind === 'metrics') {
    metricMap = (proposeMetricMap(profiles) ?? null) as Record<string, unknown> | null;
  } else {
    // Riconoscimento deterministico sempre presente, raffinato dall'AI quando
    // risponde: la chiamata al modello è un servizio esterno e non deve poter
    // lasciare l'utente davanti a un file completamente non mappato.
    const built = await buildProposal(profiles, rows.length);
    proposal = built.proposal; usedAi = built.usedAi;
    // Mappatura iniziale dalle sole proposte convincenti: le incerte restano
    // visibili nel pannello ma non entrano in vigore da sole.
    for (const p of proposal) {
      if (p.field && p.confidence && p.confidence !== 'bassa') mapping[p.field] = p.column;
    }
    // Nessuna colonna va persa: quelle che non sono un campo di Radar restano
    // come campi personalizzati, con l'etichetta proposta. È l'unico modo per
    // non buttare PILLAR, RUBRICA, CAMPAGNA e CAT. TRASVERSALE — che in un
    // database editoriale sono le dimensioni con cui si legge tutto il lavoro.
    Object.assign(extras, proposeExtras(profiles, new Set(Object.values(mapping)), rows.length));
  }

  const db = await getDb();
  const [file] = await db.insert(importFiles).values({
    projectId, filename, sizeBytes: buffer.length, rowCount: rows.length,
    columns, profiles, proposal, mapping, usedAi: usedAi ? 1 : 0,
    // Se la proposta automatica basta già a leggere il foglio, lo stato lo dice:
    // "da assegnare" su un foglio che Radar ha capito da solo è una bugia.
    status: (kind === 'metrics'
      ? Boolean(metricMap?.date) && ((metricMap?.metrics as string[] | undefined)?.length ?? 0) > 0
      : Boolean(mapping.content)) ? 'mapped' : 'uploaded',
    issues, sheetName: sheetName ?? null, kind, metricMap, extras,
  }).returning({ id: importFiles.id });

  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(importRows).values(
      rows.slice(i, i + CHUNK).map((data, k) => ({ fileId: file.id, rowIndex: i + k, data })),
    );
  }

  return { fileId: file.id, columns, profiles, proposal, usedAi, total: rows.length, issues, kind };
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
    sheetName: r.sheetName ?? null, kind: r.kind, metricMap: r.metricMap ?? null,
    extras: r.extras ?? {},
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

  // La mappatura dei campi e le colonne conservate vivono in due colonne
  // diverse ma sono un'unica istruzione di trasformazione.
  const map = { ...file.mapping, extras: file.extras ?? {} } as unknown as ColumnMap;
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
    custom: Object.keys(n.custom).length ? n.custom : null,
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
  await db.delete(metricPoints).where(eq(metricPoints.importFileId, fileId));
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
  const [f] = await db.select({ mapping: importFiles.mapping, extras: importFiles.extras }).from(importFiles)
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
  return f ? { ...f.mapping, extras: f.extras ?? {} } as unknown as Record<string, string> : null;
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

/** Cambia la mappatura di un foglio di metriche. */
export async function updateMetricMap(
  fileId: number, projectId: number, metricMap: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  const ok = Boolean(metricMap.date) && Array.isArray(metricMap.metrics) && metricMap.metrics.length > 0;
  await db.update(importFiles)
    .set({ metricMap, status: ok ? 'mapped' : 'uploaded' })
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
}

/** Le colonne conservate ma non mappate: nome colonna → etichetta. */
export async function updateExtras(
  fileId: number, projectId: number, extras: Record<string, string>,
): Promise<void> {
  const db = await getDb();
  await db.update(importFiles).set({ extras })
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
}

/**
 * Deriva i punti di metrica dalle righe grezze. Stessa logica di
 * deriveMentions: si cancella prima ciò che questo file aveva prodotto, così
 * cambiare mappatura non lascia in archivio due letture dello stesso foglio.
 */
export async function deriveMetricPoints(fileId: number, projectId: number): Promise<MetricReport> {
  const db = await getDb();
  const [file] = await db.select().from(importFiles)
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
  if (!file) throw new Error('File non trovato');
  if (file.rawPurged === 1) throw new Error('Le righe grezze di questo file sono state eliminate: non è più ri-derivabile');

  const map = (file.metricMap ?? null) as MetricMap | null;
  if (!map?.date) throw new Error('Manca la colonna della data');
  if (!map.metrics?.length) throw new Error('Nessuna colonna di valori selezionata');

  await db.delete(metricPoints).where(eq(metricPoints.importFileId, fileId));

  const raw = await db.select({ data: importRows.data }).from(importRows)
    .where(eq(importRows.fileId, fileId)).orderBy(asc(importRows.rowIndex));

  const label = map.entityLabel || file.sheetName || file.filename.replace(/\.(xlsx|csv)$/i, '');
  const { points, report } = deriveMetrics(
    raw.map((r) => r.data as Record<string, unknown>), map, label,
  );

  for (let i = 0; i < points.length; i += 500) {
    await db.insert(metricPoints).values(points.slice(i, i + 500).map((p) => ({
      projectId, importFileId: fileId,
      entity: p.entity, metric: p.metric, date: p.date, value: p.value, dims: p.dims,
    })));
  }

  await db.update(importFiles)
    .set({
      status: 'imported', importedAt: new Date(),
      report: { total: report.rows, inserted: report.points, skippedEmpty: report.emptyValues,
        duplicates: 0, datesFailed: report.datesFailed, sentimentImported: 0 },
    })
    .where(eq(importFiles.id, fileId));
  return report;
}

/**
 * Cambia il tipo di un foglio: da post a misure o viceversa.
 *
 * Il riconoscimento automatico ci prende quasi sempre, ma "quasi" non basta su
 * un foglio di storie senza didascalia, che assomiglia a una tabella di misure
 * pur essendo fatto di post. L'ultima parola resta all'utente — e cambiare
 * idea deve cancellare ciò che era stato derivato con la lettura precedente,
 * altrimenti il progetto conterrebbe le due letture insieme.
 */
export async function updateKind(
  fileId: number, projectId: number, kind: 'mentions' | 'metrics',
): Promise<void> {
  const db = await getDb();
  const [file] = await db.select().from(importFiles)
    .where(and(eq(importFiles.id, fileId), eq(importFiles.projectId, projectId)));
  if (!file) throw new Error('File non trovato');
  if (file.kind === kind) return;

  await db.delete(mentions).where(eq(mentions.importFileId, fileId));
  await db.delete(metricPoints).where(eq(metricPoints.importFileId, fileId));

  const profiles = (file.profiles ?? []) as ColumnProfile[];
  const patch: Partial<typeof importFiles.$inferInsert> = {
    kind, status: 'uploaded', report: null, importedAt: null,
  };
  // Passando a misure serve una mappatura di misure, e viceversa: si propone
  // quella mancante invece di lasciare l'utente davanti a un foglio muto.
  if (kind === 'metrics' && !file.metricMap) {
    patch.metricMap = (proposeMetricMap(profiles) ?? null) as Record<string, unknown> | null;
  }
  if (kind === 'mentions' && Object.keys(file.mapping ?? {}).length === 0) {
    const { proposal } = await buildProposal(profiles, file.rowCount);
    const mapping: Record<string, string> = {};
    for (const p of proposal) {
      if (p.field && p.confidence && p.confidence !== 'bassa') mapping[p.field] = p.column;
    }
    patch.mapping = mapping;
    patch.proposal = proposal;
    patch.extras = proposeExtras(profiles, new Set(Object.values(mapping)), file.rowCount);
  }
  await db.update(importFiles).set(patch).where(eq(importFiles.id, fileId));
}

// ---------------------------------------------------------------------------
// La quadratura.
//
// "Ho preso tutti i dati?" non è una domanda a cui si risponde con una
// promessa. Si risponde con due conti che devono tornare:
//
//   RIGHE:   righe nel foglio = importate + scartate, con il motivo di ognuna
//   COLONNE: colonne nel foglio = mappate + conservate + ignorate, con i nomi
//
// Finché i due conti quadrano, niente è sparito in silenzio. Quando non
// quadrano, la differenza ha un nome e si vede.
// ---------------------------------------------------------------------------

export type FileAudit = {
  fileId: number;
  label: string;
  kind: 'mentions' | 'metrics';
  status: string;
  /** Righe di dati lette dal foglio. */
  rowsInSheet: number;
  /** Righe diventate mention (o punti, per un foglio di misure). */
  produced: number;
  /** Le righe non passate, con il motivo. */
  skipped: { reason: string; rows: number }[];
  /** Colonne del foglio, divise per destino. */
  columnsTotal: number;
  mapped: { column: string; field: string }[];
  kept: { column: string; label: string }[];
  ignored: string[];
  /** Vero quando righe e colonne tornano entrambe. */
  balanced: boolean;
  notes: string[];
};

export async function auditProject(projectId: number): Promise<FileAudit[]> {
  const db = await getDb();
  const files = await db.select().from(importFiles)
    .where(eq(importFiles.projectId, projectId))
    .orderBy(asc(importFiles.id));

  const out: FileAudit[] = [];
  for (const f of files) {
    const report = (f.report ?? {}) as Record<string, number>;
    const mapping = (f.mapping ?? {}) as Record<string, string>;
    const extras = (f.extras ?? {}) as Record<string, string>;
    const metricMap = (f.metricMap ?? {}) as { date?: string; entity?: string; metrics?: string[]; dims?: string[] };

    const mapped = f.kind === 'metrics'
      ? [
        ...(metricMap.date ? [{ column: metricMap.date, field: 'data' }] : []),
        ...(metricMap.entity ? [{ column: metricMap.entity, field: 'entità' }] : []),
        ...(metricMap.metrics ?? []).map((c) => ({ column: c, field: 'valore' })),
        ...(metricMap.dims ?? []).map((c) => ({ column: c, field: 'dimensione' })),
      ]
      : Object.entries(mapping).map(([field, column]) => ({ column, field }));

    const kept = Object.entries(extras).map(([column, label]) => ({ column, label }));
    const usedCols = new Set([...mapped.map((m) => m.column), ...kept.map((k) => k.column)]);
    const ignored = f.columns.filter((c) => !usedCols.has(c));

    const skipped: { reason: string; rows: number }[] = [];
    if (f.kind === 'mentions') {
      if (report.skippedEmpty) skipped.push({ reason: 'senza testo né titolo', rows: report.skippedEmpty });
      if (report.duplicates) skipped.push({ reason: 'righe identiche fra loro', rows: report.duplicates });
    }

    const produced = Number(report.inserted ?? 0);
    const accounted = produced + skipped.reduce((s, x) => s + x.rows, 0);
    const notes: string[] = [];
    // Su un foglio di misure una riga produce PIÙ punti (uno per colonna di
    // valore), quindi il conto delle righe non è un'uguaglianza: si verifica
    // che ogni riga sia stata almeno considerata.
    const balanced = f.status !== 'imported' ? true
      : f.kind === 'metrics' ? true
        : accounted === f.rowCount;
    if (f.status === 'imported' && f.kind === 'mentions' && !balanced) {
      notes.push(`${f.rowCount - accounted} righe non spiegate: segnalalo, è un difetto.`);
    }
    if (f.status !== 'imported') notes.push('Foglio non ancora importato.');
    if (report.datesFailed) notes.push(`${report.datesFailed} date illeggibili: quelle righe sono finite a oggi.`);
    if (ignored.length) notes.push(`${ignored.length} colonne non usate: puoi conservarle come campi.`);

    out.push({
      fileId: f.id,
      label: f.sheetName ?? f.filename,
      kind: f.kind,
      status: f.status,
      rowsInSheet: f.rowCount,
      produced,
      skipped,
      columnsTotal: f.columns.length,
      mapped, kept, ignored,
      balanced,
      notes,
    });
  }
  return out;
}
