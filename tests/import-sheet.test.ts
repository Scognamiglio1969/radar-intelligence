import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseSheet } from '../lib/import';

// Il foglio è l'unico punto in cui Radar riceve dati che non ha raccolto lui.
// Quello che si perde qui non si recupera più a valle: se una colonna calcolata
// arriva vuota, tutte le classifiche per engagement sono sbagliate e nessuna
// schermata lo segnala.

/** Costruisce un .xlsx vero in memoria: i test devono passare da ExcelJS, non simularlo. */
async function xlsx(build: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet('Foglio1'));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('formule: si legge il RISULTATO, non la formula', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', 'like', 'commenti', 'engagement']);
    ws.addRow(['primo post', 10, 5, null]);
    // Come fa Excel: la formula viaggia con il suo valore in cache.
    ws.getCell('D2').value = { formula: 'B2+C2', result: 15 };
    ws.addRow(['secondo post', 3, 1, null]);
    ws.getCell('D3').value = { formula: 'B3+C3', result: 4 };
  });

  const { rows, issues } = await parseSheet(buf, 'f.xlsx');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].engagement, 15);
  assert.equal(rows[1].engagement, 4);
  assert.equal(issues.formulas, 2);
  assert.equal(issues.formulaErrors, 0);
  assert.equal(issues.formulaNoValue, 0);
});

test('formule: risultato testuale, data e formula condivisa', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', 'autore', 'data', 'copia']);
    ws.addRow(['post', null, null, null]);
    ws.getCell('B2').value = { formula: 'CONCATENATE("mario";"rossi")', result: 'mariorossi' };
    ws.getCell('C2').value = { formula: 'TODAY()', result: new Date(Date.UTC(2026, 6, 1)) };
    ws.getCell('D2').value = { sharedFormula: 'B2', result: 'copiato' };
  });

  const { rows } = await parseSheet(buf, 'f.xlsx');
  assert.equal(rows[0].autore, 'mariorossi');
  assert.ok(rows[0].data instanceof Date);
  assert.equal((rows[0].data as Date).toISOString().slice(0, 10), '2026-07-01');
  assert.equal(rows[0].copia, 'copiato');
});

test('formule in errore: niente "[object Object]" nella colonna', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', 'rapporto']);
    ws.addRow(['post', null]);
    ws.getCell('B2').value = { formula: 'A2/0', result: { error: '#DIV/0!' } };
  });

  const { rows, issues } = await parseSheet(buf, 'f.xlsx');
  // Prima della correzione qui finiva l'oggetto dell'errore, che a valle
  // diventava la stringa "[object Object]" e poi il numero 0.
  assert.equal(rows[0].rapporto, null);
  assert.equal(issues.formulaErrors, 1);
});

test('formule senza valore in cache: vuote, ma dichiarate', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', 'calcolato']);
    ws.addRow(['post', null]);
    ws.getCell('B2').value = { formula: 'A2*2' };   // scritta da uno strumento che non calcola
  });

  const { rows, issues } = await parseSheet(buf, 'f.xlsx');
  assert.equal(rows[0].calcolato, null);
  assert.equal(issues.formulas, 1);
  assert.equal(issues.formulaNoValue, 1);
});

test('intestazione calcolata: il nome della colonna resta leggibile', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', null]);
    ws.getCell('B1').value = { formula: 'CONCATENATE("enga";"gement")', result: 'engagement' };
    ws.addRow(['post', 12]);
  });

  const { columns, rows } = await parseSheet(buf, 'f.xlsx');
  assert.deepEqual(columns, ['testo', 'engagement']);
  assert.equal(rows[0].engagement, 12);
});

test('celle ricche e collegamenti ipertestuali danno testo', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', 'link']);
    ws.addRow([null, null]);
    ws.getCell('A2').value = { richText: [{ text: 'ciao ' }, { text: 'mondo' }] };
    ws.getCell('B2').value = { text: 'apri', hyperlink: 'https://example.com/post/1' };
  });

  const { rows } = await parseSheet(buf, 'f.xlsx');
  assert.equal(rows[0].testo, 'ciao mondo');
  assert.equal(rows[0].link, 'apri');
});

test('colonne senza intestazione ricevono un nome, non spariscono', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', '', 'autore']);
    ws.addRow(['post', 'valore orfano', 'mario']);
  });

  const { columns, rows } = await parseSheet(buf, 'f.xlsx');
  assert.equal(columns.length, 3);
  assert.equal(columns[0], 'testo');
  assert.ok(columns[1].length > 0, 'la colonna senza intestazione deve avere un nome');
  assert.equal(rows[0][columns[1]], 'valore orfano');
});

test('righe completamente vuote non diventano mention', async () => {
  const buf = await xlsx((ws) => {
    ws.addRow(['testo', 'autore']);
    ws.addRow(['primo', 'a']);
    ws.addRow([null, null]);
    ws.addRow(['secondo', 'b']);
  });

  const { rows } = await parseSheet(buf, 'f.xlsx');
  assert.equal(rows.length, 2);
});

test('CSV: virgolette, virgole e a capo dentro un campo', async () => {
  const csv = [
    'testo,autore,like',
    '"Ha detto: ""ottimo, davvero""",mario,10',
    '"Riga uno\nRiga due",lucia,3',
    'semplice,carlo,1',
  ].join('\n');

  const { columns, rows } = await parseSheet(Buffer.from(csv, 'utf8'), 'f.csv');
  assert.deepEqual(columns, ['testo', 'autore', 'like']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].testo, 'Ha detto: "ottimo, davvero"');
  assert.equal(rows[0].autore, 'mario');
  assert.equal(rows[1].testo, 'Riga uno\nRiga due');
  assert.equal(rows[2].autore, 'carlo');
});

test('CSV: file senza righe dati non esplode', async () => {
  const { columns, rows, total } = await parseSheet(Buffer.from('a,b,c', 'utf8'), 'f.csv');
  assert.deepEqual(columns, ['a', 'b', 'c']);
  assert.equal(rows.length, 0);
  assert.equal(total, 0);
});

test('formula trascinata il cui risultato è ZERO: il valore si recupera', async () => {
  // Su una formula condivisa la libreria omette `result` quando vale 0 e lo
  // espone solo su `cell.result`. Fidarsi del solo oggetto faceva sparire celle
  // che nel file un valore ce l'hanno: 65 su un singolo foglio reale, tutte 0.
  // Zero e "non rilevato" sono cose diverse, e confonderle falsa ogni media.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  ws.addRow(['testo', 'clic']);
  ws.addRow(['primo', null]);
  ws.addRow(['secondo', null]);
  ws.getCell('B2').value = { formula: 'SUM(C2:D2)', result: 5 };
  // La seconda eredita la formula e vale 0: è la forma che la libreria produce.
  ws.getCell('B3').value = { sharedFormula: 'B2', result: 0 };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());

  const { rows, issues } = await parseSheet(buf, 'f.xlsx');
  assert.equal(rows[0].clic, 5);
  assert.equal(rows[1].clic, 0, 'lo zero calcolato è un valore, non una cella vuota');
  assert.equal(issues.formulaNoValue, 0);
  assert.equal(issues.formulas, 2);
});
