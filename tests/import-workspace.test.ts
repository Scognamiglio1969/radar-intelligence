import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

// Il caso che conta davvero: un progetto che nasce da N file, da sommare e
// normalizzare. Qui si verifica l'invariante che tiene in piedi tutto il
// workspace — le mention si DERIVANO dalla mappatura corrente, e ogni mention
// ricorda da quale file viene, così un file si può rifare o togliere senza
// toccare gli altri.
//
// Gira su un PGlite usa-e-getta: nessun database di sviluppo viene sfiorato.

const dir = mkdtempSync(join(tmpdir(), 'radar-test-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

type Store = typeof import('../lib/import-store');
type Db = typeof import('../lib/db');
let store: Store;
let dbMod: Db;
let schema: typeof import('../lib/db/schema');
let projectId: number;

before(async () => {
  store = await import('../lib/import-store');
  dbMod = await import('../lib/db');
  schema = await import('../lib/db/schema');
  const db = await dbMod.getDb();
  const [p] = await db.insert(schema.projects).values({
    name: 'Test import', keywords: ['test'], languages: ['it'], mode: 'upload',
  }).returning();
  projectId = p.id;
});

after(() => rmSync(dir, { recursive: true, force: true }));

async function sheet(rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  ws.addRow(['testo', 'data', 'like', 'commenti']);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const MAP = { content: 'testo', date: 'data', likes: 'like', comments: 'commenti' };

async function countMentions(fileId?: number): Promise<number> {
  const db = await dbMod.getDb();
  const { and, eq, sql } = await import('drizzle-orm');
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.mentions)
    .where(fileId
      ? and(eq(schema.mentions.projectId, projectId), eq(schema.mentions.importFileId, fileId))
      : eq(schema.mentions.projectId, projectId));
  return Number(r.n);
}

test('due file si sommano e ogni mention ricorda da dove viene', async () => {
  const a = await store.registerFile(projectId, await sheet([
    ['primo post', '01/03/2024', 10, 2],
    ['secondo post', '02/03/2024', 5, 1],
    ['terzo post', '03/03/2024', 1, 0],
  ]), 'gennaio.xlsx');
  const b = await store.registerFile(projectId, await sheet([
    ['quarto post', '04/03/2024', 7, 3],
    ['quinto post', '05/03/2024', 2, 0],
  ]), 'febbraio.xlsx');

  await store.updateMapping(a.fileId, projectId, MAP);
  await store.updateMapping(b.fileId, projectId, MAP);
  const ra = await store.deriveMentions(a.fileId, projectId);
  const rb = await store.deriveMentions(b.fileId, projectId);

  assert.equal(ra.inserted, 3);
  assert.equal(rb.inserted, 2);
  assert.equal(await countMentions(), 5);
  assert.equal(await countMentions(a.fileId), 3);
  assert.equal(await countMentions(b.fileId), 2);
});

test('lo stesso file reimportato non raddoppia le righe', async () => {
  const files = await store.listFiles(projectId);
  const a = files.find((f) => f.filename === 'gennaio.xlsx')!;
  await store.deriveMentions(a.id, projectId);

  // Ri-derivare CANCELLA prima le mention di quel file: senza, il progetto
  // conterrebbe due letture dello stesso foglio.
  assert.equal(await countMentions(a.id), 3);
  assert.equal(await countMentions(), 5);
});

test('righe identiche dentro lo stesso file vengono deduplicate', async () => {
  const c = await store.registerFile(projectId, await sheet([
    ['post ripetuto', '10/03/2024', 4, 1],
    ['post ripetuto', '10/03/2024', 4, 1],
    ['post diverso', '10/03/2024', 4, 1],
  ]), 'doppioni.xlsx');
  await store.updateMapping(c.fileId, projectId, MAP);
  const r = await store.deriveMentions(c.fileId, projectId);

  assert.equal(r.total, 3);
  assert.equal(r.inserted, 2);
  assert.equal(r.duplicates, 1);
  await store.deleteFile(c.fileId, projectId);
});

test('lo stesso post presente in due file resta distinto', async () => {
  // Due export con finestre sovrapposte contengono legittimamente lo stesso
  // post: unirli non deve farne sparire uno, perché i due file possono essere
  // gestiti (rifatti, tolti) separatamente.
  const d = await store.registerFile(projectId, await sheet([
    ['primo post', '01/03/2024', 10, 2],
  ]), 'sovrapposto.xlsx');
  await store.updateMapping(d.fileId, projectId, MAP);
  const r = await store.deriveMentions(d.fileId, projectId);

  assert.equal(r.inserted, 1);
  assert.equal(await countMentions(), 6);
  await store.deleteFile(d.fileId, projectId);
  assert.equal(await countMentions(), 5);
});

test('cambiare mappatura ri-deriva senza ricaricare il file', async () => {
  const files = await store.listFiles(projectId);
  const a = files.find((f) => f.filename === 'gennaio.xlsx')!;

  // Si scambia il campo: i "like" diventano "commenti". Il file non viene
  // ricaricato — le righe grezze sono ancora in archivio.
  await store.updateMapping(a.id, projectId, { ...MAP, likes: 'commenti', comments: 'like' });
  await store.deriveMentions(a.id, projectId);

  const db = await dbMod.getDb();
  const { eq, asc } = await import('drizzle-orm');
  const rows = await db.select().from(schema.mentions)
    .where(eq(schema.mentions.importFileId, a.id)).orderBy(asc(schema.mentions.publishedAt));
  assert.equal(rows.length, 3);
  const first = rows[0].engagement as { likes?: number; comments?: number };
  assert.equal(first.likes, 2);
  assert.equal(first.comments, 10);

  await store.updateMapping(a.id, projectId, MAP);
  await store.deriveMentions(a.id, projectId);
});

test('togliere un file lascia intatti gli altri', async () => {
  const files = await store.listFiles(projectId);
  const a = files.find((f) => f.filename === 'gennaio.xlsx')!;
  const b = files.find((f) => f.filename === 'febbraio.xlsx')!;

  await store.deleteFile(a.id, projectId);
  assert.equal(await countMentions(), 2);
  assert.equal(await countMentions(b.id), 2);
  assert.equal((await store.listFiles(projectId)).length, 1);
});

test('le righe grezze restano, e purgarle blocca la ri-derivazione', async () => {
  const files = await store.listFiles(projectId);
  const b = files.find((f) => f.filename === 'febbraio.xlsx')!;

  const sample = await store.sampleRows(b.id, 5);
  assert.equal(sample.length, 2, 'le righe originali devono essere ancora in archivio');
  assert.equal(sample[0].testo, 'quarto post');

  await store.purgeRaw(b.id, projectId);
  // Le mention restano: si perde solo la possibilità di rimappare.
  assert.equal(await countMentions(b.id), 2);
  await assert.rejects(() => store.deriveMentions(b.id, projectId), /righe grezze/);
});

test('senza colonna del testo la derivazione si rifiuta di procedere', async () => {
  const e = await store.registerFile(projectId, await sheet([['post', '01/03/2024', 1, 1]]), 'senza-mappa.xlsx');
  await store.updateMapping(e.fileId, projectId, { date: 'data' } as Record<string, string>);
  await assert.rejects(() => store.deriveMentions(e.fileId, projectId), /colonna del testo/);
  await store.deleteFile(e.fileId, projectId);
});
