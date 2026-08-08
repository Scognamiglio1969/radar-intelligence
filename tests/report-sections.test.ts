import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_SECTION_IDS, EXPORT_SECTIONS } from '../lib/export-sections';
import { sectionFacts } from '../lib/custom-report';
import { SECTION_RENDERERS } from '../lib/report-pdf';

// Ogni sezione esportabile deve essere conosciuta da TUTTI e tre i pezzi che
// la usano: il catalogo, il renderer del PDF e l'estrattore di cifre per il
// commento AI. Aggiungerne una e dimenticarne uno è un guasto silenzioso —
// è già successo: le tre sezioni "People" mancavano a sectionFacts, il
// commento AI non trovava niente da mandare, il modello non veniva nemmeno
// chiamato e l'utente leggeva "il modello non ha risposto, riprova".

/** Un ExportData vuoto ma completo: serve a far girare ogni estrattore. */
function emptyData() {
  return {
    project: { id: 1, name: 'Test', keywords: ['x'] },
    dashboard: { kpi: { total7: 0, avgSentiment: null, sources: 0 }, topTopics: [], volumeByDay: [], sentimentDist: [] },
    benchmark: [], audience: { communities: [], languages: [] }, ratings: [],
    briefs: [], alerts: [], trends: [], narratives: [], timeline: [],
    geo: [], emotions: [], momentum: [], constellation: { nodes: [], edges: [] },
    sov: { entities: [], days: [] }, flow: { nodes: [], links: [] },
    network: { nodes: [] }, crisis: { peak: null, risk: 0, level: 'basso', drivers: [] },
    pyramid: { tiers: [], topConcentration: 0 },
    health: { theme: { total: 0, score: 0, grade: '', components: [] }, brand: null, compare: [] },
    pov: { facts: {}, pov: null },
    people: { ranking: [], cards: [] },
    allMentions: [],
  } as unknown as Parameters<typeof sectionFacts>[0];
}

test('ogni sezione del catalogo ha un renderer nel PDF', () => {
  for (const id of ALL_SECTION_IDS) {
    assert.ok(SECTION_RENDERERS[id], `manca il renderer PDF per la sezione "${id}"`);
  }
});

test('ogni sezione del catalogo sa produrre cifre per il commento AI', () => {
  // Non si pretende che con dati vuoti restituisca qualcosa: si pretende che
  // la sezione sia PREVISTA, cioè che non finisca nel ramo di default.
  const handled = new Set(
    // Le sezioni gestite sono quelle che compaiono come `case` nel sorgente:
    // è il modo diretto di verificare che nessuna sia stata dimenticata.
    require('node:fs').readFileSync(new URL('../lib/custom-report.ts', import.meta.url), 'utf8')
      .match(/case '([a-zA-Z]+)':/g)?.map((m: string) => m.slice(6, -2)) ?? [],
  );
  for (const id of ALL_SECTION_IDS) {
    assert.ok(handled.has(id), `sectionFacts non prevede la sezione "${id}": il commento AI non avrebbe niente da dire`);
  }
});

test('nessun estrattore esplode su un progetto vuoto', () => {
  const d = emptyData();
  for (const id of ALL_SECTION_IDS) {
    assert.doesNotThrow(() => sectionFacts(d, id), `sectionFacts("${id}") esplode con dati vuoti`);
  }
});

test('il catalogo non ha id duplicati', () => {
  const ids = EXPORT_SECTIONS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});
