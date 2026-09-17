import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compilePlan, describeQuery, legacyFields, matchesQuery, planFromLegacy, planFromRules,
  queriesMatching, toBoolean, validatePlan,
} from '../lib/query-plan';
import { newsdataQuery } from '../lib/connectors/newsdata';
import { booleanQuery } from '../lib/connectors/types';

const plan = validatePlan({
  brief: 'Ferrari e le proteste, contro Lamborghini',
  origin: 'ai',
  concepts: [
    { id: 'ferrari', label: 'Ferrari', role: 'subject', terms: ['Ferrari', 'Maranello', 'RACE'] },
    { id: 'protesta', label: 'Protesta', role: 'context', terms: ['sciopero', 'protesta', 'manifestazione'] },
    { id: 'lambo', label: 'Lamborghini', role: 'competitor', terms: ['Lamborghini'] },
    { id: 'rumore', label: 'Omonimi', role: 'noise', terms: ['Enzo Ferrari film', 'Ferrari pasticceria'] },
  ],
  queries: [
    { id: 'core', name: 'Ferrari', kind: 'core', all: ['ferrari'], none: ['rumore'] },
    { id: 'prot', name: 'Ferrari × protesta', kind: 'context', all: ['protesta', 'ferrari'], none: ['rumore'] },
    { id: 'lambo', name: 'Lamborghini', kind: 'competitor', all: ['lambo'] },
  ],
}).plan;

test('il soggetto fa da ancora anche se il contesto è scritto per primo', () => {
  const q = compilePlan(plan).find((x) => x.id === 'prot')!;
  assert.deepEqual(q.anchor, ['Ferrari', 'Maranello', 'RACE']);
  assert.deepEqual(q.groups, [['sciopero', 'protesta', 'manifestazione']]);
  assert.deepEqual(q.exclude, ['Enzo Ferrari film', 'Ferrari pasticceria']);
});

test('una menzione soddisfa la query solo con tutti i concetti e nessun rumore', () => {
  const q = compilePlan(plan).find((x) => x.id === 'prot')!;
  assert.equal(matchesQuery(q, 'Sciopero a Maranello, fermi i reparti Ferrari'), true);
  assert.equal(matchesQuery(q, 'Ferrari vince a Monza'), false);
  assert.equal(matchesQuery(q, 'Protesta davanti alla Ferrari pasticceria'), false);
  // Senza accenti e maiuscole il confronto regge lo stesso.
  assert.equal(matchesQuery(q, 'MANIFESTAZIONE a maranello'), true);
});

test('una menzione riceve tutte le query che soddisfa', () => {
  const ids = queriesMatching(compilePlan(plan), 'Sciopero alla Ferrari, Lamborghini osserva');
  assert.deepEqual(ids.sort(), ['core', 'lambo', 'prot']);
});

test('la sintassi booleana si può incollare altrove', () => {
  const q = compilePlan(plan).find((x) => x.id === 'prot')!;
  assert.equal(toBoolean(q), '(Ferrari OR Maranello OR RACE) AND (sciopero OR protesta OR manifestazione) AND NOT ("Enzo Ferrari film" OR "Ferrari pasticceria")');
});

test('la query si legge come una frase', () => {
  const q = plan.queries.find((x) => x.id === 'prot')!;
  assert.equal(describeQuery(plan, q), 'Trova quello che parla di Protesta e Ferrari, lasciando fuori Omonimi.');
});

test('la validazione scarta quello che non regge e lo dice', () => {
  const { plan: p, warnings } = validatePlan({
    concepts: [
      { id: 'a', label: 'A', role: 'subject', terms: ['Acme', 'acme', '"Acme"', 'AND'] },
      { id: 'vuoto', label: 'Vuoto', role: 'context', terms: [] },
      { id: 'n', label: 'Rumore', role: 'noise', terms: ['acme corda'] },
    ],
    queries: [
      { name: 'Solo rumore', all: ['n'] },
      { name: 'Acme', all: ['a', 'n', 'inesistente'] },
      { name: 'Acme bis', all: ['a'], none: ['n'] },
      { name: 'Senza nome', all: [] },
    ],
  });
  assert.deepEqual(p.concepts.map((c) => c.id), ['a', 'n']);
  assert.deepEqual(p.concepts[0].terms, ['Acme']);
  // Il rumore messo fra i requisiti diventa un'esclusione.
  assert.deepEqual(p.queries.map((q) => [q.name, q.all, q.none]), [['Acme', ['a'], ['n']]]);
  assert.ok(warnings.some((w) => w.includes('Vuoto')));
  assert.ok(warnings.some((w) => w.includes('Acme bis')));
});

test('le query citate per etichetta o con id rinominato restano collegate', () => {
  const { plan: p } = validatePlan({
    concepts: [
      { id: 'x', label: 'Uno', role: 'subject', terms: ['uno'] },
      { id: 'x', label: 'Due', role: 'competitor', terms: ['due'] },
    ],
    queries: [{ name: 'Q', all: ['Due'] }],
  });
  assert.equal(p.concepts[1].id, 'x-2');
  assert.deepEqual(p.queries[0].all, ['x-2']);
});

test('non più di otto query attive', () => {
  const { plan: p, warnings } = validatePlan({
    concepts: Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, role: 'competitor', terms: [`nome${i}`] })),
    queries: Array.from({ length: 10 }, (_, i) => ({ name: `Q${i}`, all: [`c${i}`] })),
  });
  assert.equal(p.queries.filter((q) => q.enabled).length, 8);
  assert.ok(warnings.some((w) => w.includes('spenta')));
});

test('la vecchia query diventa un piano senza perdere niente', () => {
  const p = planFromLegacy(
    { name: 'Energia', keywords: ['auto elettrica', 'EV'], allTerms: ['batteria'], excludeTerms: ['usato'] },
    [{ name: 'Tesla', keywords: ['Tesla'] }, { name: 'Mio brand', keywords: ['Mio'], isOwnBrand: 1 }],
  );
  const core = compilePlan(p)[0];
  assert.deepEqual(core.anchor, ['auto elettrica', 'EV']);
  assert.deepEqual(core.groups, [['batteria']]);
  assert.deepEqual(core.exclude, ['usato']);
  assert.ok(compilePlan(p).some((q) => q.anchor.includes('Tesla')));
  assert.equal(p.origin, 'legacy');
});

test('i campi che il resto di Radar legge si ricavano dal piano', () => {
  const l = legacyFields(plan);
  assert.ok(l.keywords.includes('Ferrari') && l.keywords.includes('sciopero') && l.keywords.includes('Lamborghini'));
  assert.deepEqual(l.excludeTerms, ['Enzo Ferrari film', 'Ferrari pasticceria']);
  assert.deepEqual(l.entities.map((e) => [e.name, e.isOwnBrand]), [['Ferrari', true], ['Lamborghini', false]]);
});

test('la richiesta dell’utente si capisce anche senza AI', () => {
  const p = planFromRules("Voglio monitorare l'azienda Ferrari in relazione alle proteste politiche (es. sciopero, manifestazione) e in relazione ai competitor Lamborghini, Porsche e McLaren");
  assert.deepEqual(p.concepts.map((c) => `${c.role}:${c.label}`), [
    'subject:Ferrari', 'context:proteste politiche', 'competitor:Lamborghini', 'competitor:Porsche', 'competitor:McLaren',
  ]);
  assert.deepEqual(p.concepts[1].terms, ['proteste politiche', 'sciopero', 'manifestazione']);
  assert.equal(compilePlan(p).length, 5);
});

test('le fonti booleane ricevono anche i gruppi', () => {
  const q = { anyTerms: ['Ferrari'], allTerms: [], excludeTerms: ['film'], groups: [['sciopero', 'protesta']], languages: [], countries: [] };
  assert.equal(booleanQuery(q), '(Ferrari) (sciopero OR protesta) -film');
  const nd = newsdataQuery({ ...q, anyTerms: Array.from({ length: 20 }, (_, i) => `termine lungo ${i}`) });
  assert.ok(nd.length <= 100, nd);
  assert.ok(nd.includes('sciopero'), `il gruppo deve entrare: ${nd}`);
});
