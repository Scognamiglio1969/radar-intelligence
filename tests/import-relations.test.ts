import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetRelations } from '../lib/import-relations';
import type { SheetDossier } from '../lib/import-agent';

// ---------------------------------------------------------------------------
// Le tre cose che rovinano un'analisi senza che nessuno se ne accorga.
//
// Non sono errori di lettura del file: il file viene letto benissimo, le somme
// tornano, i grafici escono. È l'analisi a essere sbagliata, e non se ne accorge
// nessuno perché non c'è niente di rotto da vedere. Per questo devono essere
// trovate da un calcolo e non lasciate all'occhio.
// ---------------------------------------------------------------------------

const sheet = (
  name: string,
  columns: Partial<NonNullable<SheetDossier['stats']>['columns'][number]>[],
  signature = 'sig',
): SheetDossier => ({
  fileId: 1, origin: 'f.xlsx', sheet: name, rows: 100, kind: 'metrics',
  archetype: null, status: 'mapped', columns: columns.map((c) => c.name!),
  signature, profiles: [], mapped: true,
  stats: {
    rows: 100, key: null, totalRow: null, duplicates: 0,
    columns: columns.map((c) => ({
      name: c.name!, reads: c.reads ?? 'number', filled: 100, distinct: 10,
      unique: false, constant: null, samples: [], ...c,
    })),
  },
});

test('la stessa metrica su scale diverse è l’avviso più urgente', () => {
  const rels = sheetRelations([
    sheet('Instagram', [{ name: 'Impression', reads: 'number', median: 12_000 }]),
    sheet('LinkedIn', [{ name: 'Impression', reads: 'number', median: 12 }]),
  ]);
  const scala = rels.find((r) => r.kind === 'scala-diversa');
  assert.ok(scala, 'mille volte di differenza sulla stessa metrica è un’unità diversa, non un canale migliore');
  assert.equal(rels[0].kind, 'scala-diversa', 'e viene detto per primo');
});

test('due fogli identici sullo stesso periodo sono un doppio conteggio annunciato', () => {
  const cols = [{ name: 'Data', reads: 'date' as const, from: '2025-01-01', to: '2025-12-01' }];
  const rels = sheetRelations([sheet('Export A', cols), sheet('Export B', cols)]);
  assert.equal(rels.some((r) => r.kind === 'stesso-periodo'), true);
});

test('periodi che non si sovrappongono sono la stessa serie da mettere in fila', () => {
  const rels = sheetRelations([
    sheet('2024', [{ name: 'Data', reads: 'date', from: '2024-01-01', to: '2024-12-01' }]),
    sheet('2025', [{ name: 'Data', reads: 'date', from: '2025-01-01', to: '2025-12-01' }]),
  ]);
  assert.equal(rels.some((r) => r.kind === 'periodi-consecutivi'), true);
});

test('due tabelle che parlano delle stesse persone vengono legate', () => {
  const persone = ['Borean', 'Donnet', 'Gurtler', 'Scaroni'];
  const rels = sheetRelations([
    sheet('Follower', [{ name: 'Manager', reads: 'text', values: persone }], 'a'),
    sheet('Post', [{ name: 'Manager', reads: 'text', values: [...persone, 'Ruggiu'] }], 'b'),
  ]);
  const legame = rels.find((r) => r.kind === 'stessi-soggetti');
  assert.ok(legame, 'quattro nomi su cinque in comune: sono le stesse persone');
  assert.equal(legame.kind === 'stessi-soggetti' && legame.shared, 4);
});

test('lo stesso foglio caricato due volte viene detto per nome', () => {
  // È il caso più frequente — si ricarica il file per sicurezza — e il più
  // facile da non vedere, perché nella pagina i due fogli si chiamano uguale.
  const cols = [{ name: 'Data', reads: 'date' as const, from: '2025-01-01', to: '2025-12-01' }];
  const rels = sheetRelations([sheet('Post', cols), sheet('Post', cols)]);
  assert.equal(rels[0].kind, 'doppio-caricamento', 'e viene detto prima di tutto il resto');
  assert.match(rels[0].note, /due volte/);
  assert.equal(rels.length, 1, 'una coppia si guarda una volta sola');
});

test('due canali diversi non sono un doppio conteggio', () => {
  // Stesse colonne e stessi mesi perché sono due canali: gridare al duplicato
  // qui invita a cancellare dati veri.
  const cols = [{ name: 'Data', reads: 'date' as const, from: '2025-01-01', to: '2025-12-01' }];
  const sheets = [sheet('Rilevazione LinkedIn', cols), sheet('Rilevazione Instagram', cols)];
  const groups = [{
    signature: 'sig', columns: ['Data'],
    sheets: ['Rilevazione LinkedIn', 'Rilevazione Instagram'],
    varyingPart: ['LinkedIn', 'Instagram'],
  }];
  assert.equal(sheetRelations(sheets, groups).some((r) => r.kind === 'stesso-periodo'), false,
    'il nome dei fogli dice che i soggetti sono diversi');

  // Lo stesso export scaricato due volte, invece, resta un allarme.
  const doppi = [sheet('Export gennaio', cols), sheet('Export gennaio (2)', cols)];
  assert.equal(sheetRelations(doppi, []).some((r) => r.kind === 'stesso-periodo'), true);
});

test('una coincidenza non diventa una relazione', () => {
  // Due fogli che contengono entrambi "Italia" non parlano delle stesse cose.
  const rels = sheetRelations([
    sheet('A', [{ name: 'Paese', reads: 'text', values: ['Italia', 'Francia', 'Spagna', 'Grecia'] }], 'a'),
    sheet('B', [{ name: 'Paese', reads: 'text', values: ['Italia', 'Cina', 'Giappone', 'Brasile'] }], 'b'),
  ]);
  assert.equal(rels.some((r) => r.kind === 'stessi-soggetti'), false,
    'un valore su quattro in comune è una coincidenza, non un legame');
});

test('scale simili non vengono segnalate', () => {
  const rels = sheetRelations([
    sheet('A', [{ name: 'Like', reads: 'number', median: 120 }]),
    sheet('B', [{ name: 'Like', reads: 'number', median: 340 }]),
  ]);
  assert.equal(rels.some((r) => r.kind === 'scala-diversa'), false,
    'un canale che va tre volte meglio di un altro è un dato, non un errore di unità');
});
