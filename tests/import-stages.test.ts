import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stages, currentStage } from '../lib/import-stages';

// La catena delle consegne ha una regola sola, ed è quella che rende la pagina
// leggibile: c'è SEMPRE esattamente un responsabile a cui tocca adesso. Senza,
// si torna a un elenco di possibilità in cui si sceglie a caso.

const base = {
  files: 0, incomplete: 0, ready: 0, imported: 0, inArchive: 0,
  drifted: 0, readByScientist: false, working: false,
};

test('c’è sempre esattamente un passaggio corrente', () => {
  const casi = [
    base,
    { ...base, files: 3, incomplete: 3 },
    { ...base, files: 3, ready: 3 },
    { ...base, files: 3, imported: 3, inArchive: 500 },
    { ...base, files: 3, imported: 3, inArchive: 500, drifted: 1 },
    { ...base, files: 3, working: true },
    { ...base, files: 3, imported: 3, inArchive: 10, readByScientist: true },
  ];
  for (const c of casi) {
    const n = stages(c).filter((s) => s.state === 'current').length;
    assert.equal(n, 1, `un solo responsabile alla volta, ricevuti ${n} per ${JSON.stringify(c)}`);
  }
});

test('senza file tocca all’archivista', () => {
  assert.equal(currentStage(stages(base)).id, 'archivio');
});

test('con colonne da assegnare tocca al jr analyst', () => {
  const s = stages({ ...base, files: 4, incomplete: 2 });
  assert.equal(currentStage(s).id, 'colonne');
  assert.equal(s[0].state, 'done', 'l’archivista ha finito');
});

test('con fogli pronti tocca al controllo qualità', () => {
  const s = stages({ ...base, files: 4, ready: 4 });
  assert.equal(currentStage(s).id, 'qualita');
});

test('un foglio da reimportare riporta il lavoro al controllo qualità', () => {
  const s = stages({ ...base, files: 4, imported: 4, inArchive: 100, drifted: 1 });
  assert.equal(currentStage(s).id, 'qualita',
    'se l’archivio non corrisponde al file, il progetto non è finito');
});

test('a lavoro finito tocca all’analista', () => {
  const s = stages({ ...base, files: 4, imported: 4, inArchive: 900 });
  assert.equal(currentStage(s).id, 'analisi');
  assert.match(s[3].outcome ?? '', /900/, 'il controllo qualità lascia detto quante righe ha verificato');
});

test('il data scientist non risulta "mancante" quando non manca niente', () => {
  const s = stages({ ...base, files: 4, imported: 4, inArchive: 900 });
  const sci = s.find((x) => x.id === 'scienza')!;
  assert.equal(sci.state, 'skipped',
    'è facoltativo: dirgli "da fare" quando tutto è a posto fa ignorare anche gli avvisi veri');
});

test('quando ha letto, il data scientist risulta fatto', () => {
  const s = stages({ ...base, files: 4, imported: 4, inArchive: 900, readByScientist: true });
  assert.equal(s.find((x) => x.id === 'scienza')!.state, 'done');
});
