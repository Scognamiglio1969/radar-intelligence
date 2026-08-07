import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { listSheets, parseSheet } from '../lib/import';

// I database veri non sono tabelle: hanno più fogli, intestazioni che non
// stanno in prima riga, cappelli su due righe, nomi di colonna ripetuti e
// migliaia di righe solo formattate. Ogni caso qui sotto viene da un file reale.

async function book(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('righe solo formattate non vengono contate come dati', async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('S');
    ws.addRow(['testo', 'valore']);
    ws.addRow(['primo', 1]);
    ws.addRow(['secondo', 2]);
    // Formattazione fino a riga 500 senza contenuto: è ciò che gonfia
    // rowCount fino a 27 volte nei file veri.
    for (let r = 4; r <= 500; r++) ws.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
  });

  const [info] = await listSheets(buf, 'f.xlsx');
  assert.equal(info.rows, 2, 'le righe dichiarate devono essere quelle vere');
  const { total } = await parseSheet(buf, 'f.xlsx');
  assert.equal(total, 2);
});

test('più fogli: inventario con nascosti dichiarati', async () => {
  const buf = await book((wb) => {
    const a = wb.addWorksheet('LK'); a.addRow(['Titolo', 'Impressioni']); a.addRow(['post', 10]);
    const b = wb.addWorksheet('IG'); b.addRow(['Descrizione', 'Copertura']); b.addRow(['reel', 5]); b.addRow(['reel2', 7]);
    const h = wb.addWorksheet('OLD X'); h.state = 'hidden'; h.addRow(['x']); h.addRow(['y']);
  });

  const sheets = await listSheets(buf, 'f.xlsx');
  assert.deepEqual(sheets.map((s) => s.name), ['LK', 'IG', 'OLD X']);
  assert.equal(sheets[0].rows, 1);
  assert.equal(sheets[1].rows, 2);
  assert.equal(sheets[2].hidden, true, 'un foglio nascosto va dichiarato, non ignorato');
  assert.deepEqual(sheets[1].headers, ['Descrizione', 'Copertura']);
});

test('si legge il foglio scelto, non il primo', async () => {
  const buf = await book((wb) => {
    const a = wb.addWorksheet('Primo'); a.addRow(['a']); a.addRow(['1']);
    const b = wb.addWorksheet('Secondo'); b.addRow(['testo', 'like']); b.addRow(['ciao', 3]);
  });

  const p = await parseSheet(buf, 'f.xlsx', { sheet: 'Secondo' });
  assert.equal(p.sheet, 'Secondo');
  assert.deepEqual(p.columns, ['testo', 'like']);
  assert.equal(p.rows[0].testo, 'ciao');
});

test('il primo foglio VISIBILE vince su un nascosto messo davanti', async () => {
  const buf = await book((wb) => {
    const h = wb.addWorksheet('scarto'); h.state = 'hidden'; h.addRow(['x']); h.addRow(['1']);
    const v = wb.addWorksheet('buono'); v.addRow(['testo']); v.addRow(['ciao']);
  });
  const p = await parseSheet(buf, 'f.xlsx');
  assert.equal(p.sheet, 'buono');
});

test("l'intestazione non è per forza in prima riga", async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('S');
    ws.addRow(['Report esportato il', '12/03/2024']);   // preambolo stretto
    ws.addRow([]);
    ws.addRow(['Data', 'Testo del post', 'Autore', 'Impressioni']);
    ws.addRow(['01/03/2024', 'un post', 'mario', 100]);
    ws.addRow(['02/03/2024', 'un altro', 'lucia', 200]);
  });

  const p = await parseSheet(buf, 'f.xlsx');
  assert.equal(p.headerRow, 3);
  assert.deepEqual(p.columns, ['Data', 'Testo del post', 'Autore', 'Impressioni']);
  assert.equal(p.total, 2);
  assert.equal(p.rows[0].Autore, 'mario');
});

test('nomi di colonna ripetuti: nessuna colonna sovrascrive l\'altra', async () => {
  // Un foglio reale ha "PILLAR" due volte. Senza rinominare, la seconda
  // colonna sparirebbe dentro la prima.
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('S');
    ws.addRow(['PILLAR', 'Testo', 'PILLAR']);
    ws.addRow(['Cultura', 'un post', 'Persone']);
  });

  const p = await parseSheet(buf, 'f.xlsx');
  assert.deepEqual(p.columns, ['PILLAR', 'Testo', 'PILLAR (2)']);
  assert.equal(p.rows[0]['PILLAR'], 'Cultura');
  assert.equal(p.rows[0]['PILLAR (2)'], 'Persone');
});

test('intestazione su due righe: i blocchi affiancati diventano nomi distinti', async () => {
  // Il caso dei fogli audience: un cappello unito sopra ("DATI COMPANY"),
  // i campi sotto, e più blocchi affiancati che usano gli stessi nomi.
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('Aud');
    ws.addRow(['DATI COMPANY', 'DATI COMPANY', 'DATI JOB TITLE', 'DATI JOB TITLE']);
    ws.mergeCells('A1:B1');
    ws.mergeCells('C1:D1');
    ws.addRow(['AZIENDA', '%', 'AZIENDA', '%']);
    ws.addRow(['Generali', 0.16, 'Insurance Advisor', 0.02]);
    ws.addRow(['Generali Italia', 0.04, 'CEO', 0.01]);
  });

  const p = await parseSheet(buf, 'f.xlsx');
  assert.deepEqual(p.columns, [
    'DATI COMPANY · AZIENDA', 'DATI COMPANY · %',
    'DATI JOB TITLE · AZIENDA', 'DATI JOB TITLE · %',
  ]);
  assert.equal(p.total, 2);
  assert.equal(p.rows[0]['DATI COMPANY · AZIENDA'], 'Generali');
  assert.equal(p.rows[0]['DATI JOB TITLE · AZIENDA'], 'Insurance Advisor');
});

test('una tabella normale NON viene scambiata per intestazione doppia', async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('S');
    ws.addRow(['Data', 'Testo', 'Autore']);
    ws.addRow(['01/03/2024', 'primo post', 'mario']);
    ws.addRow(['02/03/2024', 'secondo post', 'lucia']);
  });
  const p = await parseSheet(buf, 'f.xlsx');
  assert.deepEqual(p.columns, ['Data', 'Testo', 'Autore']);
  assert.equal(p.total, 2, 'la prima riga di dati non deve essere mangiata dall\'intestazione');
});

test('colonne in coda vuote non allargano la tabella', async () => {
  const buf = await book((wb) => {
    const ws = wb.addWorksheet('S');
    ws.addRow(['testo', 'valore', '', '']);
    ws.addRow(['post', 1, null, null]);
  });
  const p = await parseSheet(buf, 'f.xlsx');
  assert.equal(p.columns.length, 2);
});
