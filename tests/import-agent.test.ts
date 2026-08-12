import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// L'agente che legge i file.
//
// Del modello non si può fare un test: dice cose diverse ogni volta. Si testa
// tutto quello che gli sta sotto e intorno, che è dove stanno le garanzie:
//
//   le STATISTICHE — un totale cumulato deve risultare tale dai numeri, non
//   dal nome; una riga di totali in fondo va vista; una colonna di ID non è
//   una misura;
//   la VALIDAZIONE — una risposta del modello che nomina fogli o colonne che
//   non esistono non deve arrivare all'utente;
//   le AZIONI — quello che una risposta cambia deve cambiare davvero, e finire
//   nei dati.
//
// Gira su un PGlite usa-e-getta: nessun database di sviluppo viene sfiorato.
// ---------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'radar-agent-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

let projectId: number;
let store: typeof import('../lib/import-store');
let agent: typeof import('../lib/import-agent');
let stats: typeof import('../lib/import-stats');

/** Otto fogli con le stesse colonne, uno per manager: il caso vero. */
async function workbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, base] of [['BOREAN_mensile', 5000], ['DONNET_mensile', 9000]] as const) {
    const ws = wb.addWorksheet(name);
    ws.addRow(['Mese', 'Follower', 'Nuovi follower', 'Engagement rate', 'ID rilevazione']);
    let f = base;
    for (let m = 0; m < 12; m++) {
      const gained = 40 + m * 3;
      f += gained;
      ws.addRow([new Date(Date.UTC(2025, m, 1)), f, gained, Math.round((2 + m * 0.1) * 100) / 100,
        `90${String(m).padStart(3, '0')}${base}`]);
    }
    // La riga dei totali che si mette a mano in fondo ai fogli.
    ws.addRow(['TOTALE', f * 12, 700, 30, '']);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

before(async () => {
  store = await import('../lib/import-store');
  agent = await import('../lib/import-agent');
  stats = await import('../lib/import-stats');
  const dbMod = await import('../lib/db');
  const schema = await import('../lib/db/schema');
  const db = await dbMod.getDb();
  const [p] = await db.insert(schema.projects).values({
    name: 'Agente', keywords: ['x'], languages: ['it'], mode: 'upload',
  }).returning();
  projectId = p.id;

  const buf = await workbook();
  for (const sheet of ['BOREAN_mensile', 'DONNET_mensile']) {
    await store.registerFile(projectId, buf, `pb.xlsx › ${sheet}`, sheet);
  }
});

after(() => rmSync(dir, { recursive: true, force: true }));

test('il soggetto nascosto nel nome dei fogli viene isolato', () => {
  assert.deepEqual(
    agent.varyingParts(['BOREAN_mensile', 'DONNET_mensile', 'GURTLER_mensile']),
    ['BOREAN', 'DONNET', 'GURTLER'],
  );
  // Due fogli con le stesse colonne chiamati come i canali: il nome È il
  // soggetto, e va isolato tale e quale.
  assert.deepEqual(agent.varyingParts(['Instagram', 'LinkedIn']), ['Instagram', 'LinkedIn']);
  // Un foglio solo non ha niente da confrontare: meglio niente che una
  // divisione inventata.
  assert.equal(agent.varyingParts(['Foglio1']), null);
});

test('un totale cumulato si riconosce dai numeri, non dal nome', async () => {
  const d = await agent.buildDossier(projectId, true);
  const s = d.sheets.find((x) => x.sheet === 'BOREAN_mensile');
  assert.ok(s?.stats, 'le statistiche devono esserci');

  const follower = s.stats.columns.find((c) => c.name === 'Follower');
  const nuovi = s.stats.columns.find((c) => c.name === 'Nuovi follower');
  assert.equal(follower?.monotonic, true, '"Follower" non cala mai: è un totale');
  assert.equal(nuovi?.monotonic, true, 'in questo foglio crescono anche i nuovi');
  // La distinzione che conta davvero: l'ordine di grandezza.
  assert.ok((follower?.median ?? 0) > (nuovi?.median ?? 0) * 50,
    'il totale è di un altro ordine di grandezza rispetto all’incremento');
});

test('un tasso viene riconosciuto come tale', async () => {
  const d = await agent.buildDossier(projectId, true);
  const s = d.sheets.find((x) => x.sheet === 'BOREAN_mensile');
  const er = s?.stats?.columns.find((c) => c.name === 'Engagement rate');
  assert.equal(er?.looksLikeRate, true, 'valori decimali fra 0 e 100: è un tasso, non un conteggio');
});

test('la colonna degli identificativi non è una misura', async () => {
  const d = await agent.buildDossier(projectId, true);
  const s = d.sheets.find((x) => x.sheet === 'BOREAN_mensile');
  const id = s?.stats?.columns.find((c) => c.name === 'ID rilevazione');
  assert.equal(id?.unique, true,
    'tutti i valori presenti sono diversi: identifica la riga, anche se la riga dei totali lo lascia vuoto');
  assert.equal(id?.distinct, 12);
});

test('la riga dei totali in fondo viene vista', async () => {
  const d = await agent.buildDossier(projectId, true);
  const s = d.sheets.find((x) => x.sheet === 'BOREAN_mensile');
  assert.ok(s?.stats?.totalRow, 'l’ultima riga è la somma delle altre e va segnalata');
  assert.match(s.stats.totalRow.evidence, /più grandi/);
});

test('la cadenza delle date si legge dai dati', async () => {
  const d = await agent.buildDossier(projectId, true);
  const s = d.sheets.find((x) => x.sheet === 'BOREAN_mensile');
  const mese = s?.stats?.columns.find((c) => c.name === 'Mese');
  assert.equal(mese?.cadence, 'mensile');
  assert.equal(mese?.from, '2025-01-01');
});

test('i fogli con le stesse colonne diventano un gruppo', async () => {
  const d = await agent.buildDossier(projectId);
  assert.equal(d.groups.length, 1, 'due fogli con le stesse colonne sono un gruppo solo');
  assert.deepEqual(d.groups[0].sheets.sort(), ['BOREAN_mensile', 'DONNET_mensile']);
  assert.deepEqual(d.groups[0].varyingPart?.sort(), ['BOREAN', 'DONNET']);
});

test('una risposta che nomina fogli inesistenti non arriva all’utente', async () => {
  const d = await agent.buildDossier(projectId);
  const reading = agent.validateReading({
    summary: 'x',
    sheets: [{ sheet: 'BOREAN_mensile', what: 'ok' }, { sheet: 'FOGLIO CHE NON ESISTE', what: 'no' }],
    questions: [
      // Foglio inventato: l'opzione cade, e con una sola opzione cade la domanda.
      { id: 'q1', text: 'a?', sheets: [], recommended: 'a', options: [
        { id: 'a', label: 'x', effect: '', action: { do: 'kind', sheets: ['INVENTATO'], kind: 'metrics' } },
        { id: 'b', label: 'y', effect: '', action: { do: 'nothing' } },
      ] },
      // Colonna inventata: idem.
      { id: 'q2', text: 'b?', sheets: [], recommended: 'a', options: [
        { id: 'a', label: 'x', effect: '', action: { do: 'dateColumn', sheets: ['BOREAN_mensile'], column: 'Colonna Fantasma' } },
        { id: 'b', label: 'y', effect: '', action: { do: 'nothing' } },
      ] },
      // Azione fuori elenco: scartata.
      { id: 'q3', text: 'c?', sheets: [], recommended: 'a', options: [
        { id: 'a', label: 'x', effect: '', action: { do: 'DROP TABLE', sheets: ['BOREAN_mensile'] } as never },
        { id: 'b', label: 'y', effect: '', action: { do: 'nothing' } },
      ] },
      // Questa è buona e deve passare.
      { id: 'q4', text: 'd?', sheets: ['BOREAN_mensile'], recommended: 'a', options: [
        { id: 'a', label: 'sì', effect: '', action: { do: 'entityFromSheet', sheets: ['BOREAN_mensile', 'DONNET_mensile'], label: 'Manager' } },
        { id: 'b', label: 'no', effect: '', action: { do: 'nothing' } },
      ] },
    ],
  }, d);

  assert.deepEqual(reading.sheets.map((s) => s.sheet), ['BOREAN_mensile'],
    'il foglio inventato sparisce');
  assert.deepEqual(reading.questions.map((q) => q.id), ['q4'],
    'restano solo le domande che si possono davvero eseguire');
});

test('il nome del foglio diventa un campo su ogni riga', async () => {
  const dbMod = await import('../lib/db');
  const { sql } = await import('drizzle-orm');
  const db = await dbMod.getDb();

  const res = await agent.applyAction(projectId, {
    do: 'entityFromSheet',
    sheets: ['BOREAN_mensile', 'DONNET_mensile'],
    label: 'Manager',
  });
  assert.equal(res.changed, 2);

  // E deve finire nei DATI, non solo nella configurazione.
  const files = await store.listFiles(projectId);
  for (const f of files) await store.deriveMetricPoints(f.id, projectId);

  const rows = (await db.execute(sql`
    select distinct dims->>'Manager' as manager from metric_points where project_id = ${projectId}
  `)).rows as { manager: string | null }[];
  const managers = rows.map((r) => r.manager).filter(Boolean).sort();
  assert.deepEqual(managers, ['Borean', 'Donnet'],
    'il maiuscolo del foglio diventa un nome leggibile nei grafici');
});

test('le statistiche non trasformano il testo in zeri', async () => {
  const files = await store.listFiles(projectId);
  const s = await stats.sheetStats(files[0].id);
  const mese = s.columns.find((c) => c.name === 'Mese');
  // "TOTALE" nell'ultima riga rende la colonna mista, non numerica: se il
  // testo diventasse 0 la colonna sembrerebbe fatta di numeri.
  assert.notEqual(mese?.reads, 'number', 'una colonna con del testo non è una colonna di numeri');
});
