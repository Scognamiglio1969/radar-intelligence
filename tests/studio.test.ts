import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Studio Graph: uno strumento libero è anche un modo elegante per pubblicare
// un numero sbagliato. Questi test sorvegliano i tre punti dove può succedere.
//
//   1. l'aritmetica: somme, medie e ultimo-valore devono dare il numero che
//      si otterrebbe a mano — verificato su righe vere, non su firme;
//   2. i campi: nessuna stringa scelta dal client può diventare SQL;
//   3. le avvertenze: un tasso sommato, una torta con dodici fette e una
//      linea fra categorie devono essere DETTI, non impediti.
//
// Gira su un PGlite usa-e-getta: nessun database di sviluppo viene sfiorato.
// ---------------------------------------------------------------------------

const dir = mkdtempSync(join(tmpdir(), 'radar-studio-'));
process.env.PGLITE_DIR = dir;
delete process.env.DATABASE_URL;
delete process.env.DEMO_MODE;

type Studio = typeof import('../lib/studio');
let studio: Studio;
let projectId: number;
// Le fonti escono con il nome leggibile, non con lo slug: le attese si
// calcolano dallo stesso vocabolario che usa l'app, non a mano.
let LI: string;
let IG: string;

const iso = (d: number) => new Date(Date.now() - d * 86400_000);

before(async () => {
  studio = await import('../lib/studio');
  const { sourceLabel } = await import('../lib/source-label');
  LI = sourceLabel('linkedin');
  IG = sourceLabel('instagram');
  const dbMod = await import('../lib/db');
  const schema = await import('../lib/db/schema');
  const db = await dbMod.getDb();

  const [p] = await db.insert(schema.projects).values({
    name: 'Studio test', keywords: ['x'], languages: ['it'], mode: 'upload',
  }).returning();
  projectId = p.id;

  // Contenuti: due canali, tre giorni, numeri scelti per essere ricontrollabili
  // a mente. LinkedIn 10+20+30 = 60; Instagram 5+5 = 10.
  await db.insert(schema.mentions).values([
    { projectId, source: 'linkedin', externalId: 'a1', content: 'a', publishedAt: iso(1), engagementScore: 10, sentiment: 'positive', custom: { PILLAR: 'Persone' } },
    { projectId, source: 'linkedin', externalId: 'a2', content: 'b', publishedAt: iso(2), engagementScore: 20, sentiment: 'positive', custom: { PILLAR: 'Persone' } },
    { projectId, source: 'linkedin', externalId: 'a3', content: 'c', publishedAt: iso(3), engagementScore: 30, sentiment: 'negative', custom: { PILLAR: 'Innovazione' } },
    { projectId, source: 'instagram', externalId: 'b1', content: 'd', publishedAt: iso(1), engagementScore: 5, sentiment: 'neutral', custom: { PILLAR: 'Innovazione' } },
    { projectId, source: 'instagram', externalId: 'b2', content: 'e', publishedAt: iso(2), engagementScore: 5, sentiment: 'neutral' },
  ]);

  // Misure: i follower sono un totale cumulato — sommarli è sbagliato, l'ultimo
  // valore è il solo numero giusto. 1000 → 1200 su LinkedIn.
  await db.insert(schema.metricPoints).values([
    { projectId, entity: 'LinkedIn', metric: 'Follower', date: iso(30), value: 1000, dims: { piattaforma: 'LinkedIn' } },
    { projectId, entity: 'LinkedIn', metric: 'Follower', date: iso(2), value: 1200, dims: { piattaforma: 'LinkedIn' } },
    { projectId, entity: 'Instagram', metric: 'Follower', date: iso(30), value: 500, dims: { piattaforma: 'Instagram' } },
    { projectId, entity: 'Instagram', metric: 'Follower', date: iso(2), value: 400, dims: { piattaforma: 'Instagram' } },
  ]);
});

after(() => rmSync(dir, { recursive: true, force: true }));

const base = {
  source: 'mentions' as const, chart: 'bar' as const,
  x: 'source', y: 'count', yAgg: 'count' as const,
  days: 90, limit: 50, palette: 'categorical',
};

test('un conteggio per canale dà i numeri veri', async () => {
  const r = await studio.runStudio(projectId, base);
  const byX = Object.fromEntries(r.rows.map((x) => [x.x, x.y]));
  assert.equal(byX[LI], 3);
  assert.equal(byX[IG], 2);
  assert.equal(r.total, 5);
});

test('somma e media danno risultati diversi e corretti', async () => {
  const somma = await studio.runStudio(projectId, { ...base, y: 'engagement_score', yAgg: 'sum' });
  const media = await studio.runStudio(projectId, { ...base, y: 'engagement_score', yAgg: 'avg' });
  const s = Object.fromEntries(somma.rows.map((x) => [x.x, x.y]));
  const m = Object.fromEntries(media.rows.map((x) => [x.x, x.y]));
  assert.equal(s[LI], 60);
  assert.equal(m[LI], 20, '60 su tre righe fa 20, non 60');
  assert.equal(s[IG], 10);
  assert.equal(m[IG], 5);
});

test('l’ultimo valore è l’unica lettura giusta di un totale cumulato', async () => {
  const spec = {
    ...base, source: 'metrics' as const, x: 'entity', y: 'value', yAgg: 'last' as const,
  };
  const r = await studio.runStudio(projectId, spec);
  const v = Object.fromEntries(r.rows.map((x) => [x.x, x.y]));
  assert.equal(v['LinkedIn'], 1200, 'l’ultimo dato, non 1000+1200');
  assert.equal(v['Instagram'], 400, 'anche quando scende');

  const sommati = await studio.runStudio(projectId, { ...spec, yAgg: 'sum' });
  assert.equal(Object.fromEntries(sommati.rows.map((x) => [x.x, x.y]))['LinkedIn'], 2200,
    'la somma resta possibile: si avvisa, non si impedisce');
});

test('una seconda dimensione divide in serie senza perdere il totale', async () => {
  const r = await studio.runStudio(projectId, { ...base, z: 'sentiment' });
  assert.equal(r.rows.reduce((s, x) => s + x.y, 0), 5, 'nessuna riga persa nella divisione');
  const li = r.rows.filter((x) => x.x === LI);
  assert.equal(li.find((x) => x.z === 'positive')?.y, 2);
  assert.equal(li.find((x) => x.z === 'negative')?.y, 1);
});

test('un campo di Excel funziona anche come SERIE, non solo come asse', async () => {
  // Questo caso è sfuggito ai test finché non l'ho provato sui dati veri:
  // raggruppare per un'espressione parametrica (`custom ->> $1`) rompeva la
  // query, perché per Postgres il parametro nella SELECT e quello nel GROUP BY
  // non sono lo stesso nodo. Ora il raggruppamento usa le posizioni.
  const r = await studio.runStudio(projectId, { ...base, x: 'source', z: 'custom:PILLAR' });
  assert.ok(r.rows.length > 0, 'la query deve andare a buon fine');
  assert.equal(r.rows.reduce((s, x) => s + x.y, 0), 5,
    'nessuna riga sparisce: quella senza PILLAR resta, in una serie sua');
  assert.deepEqual(r.series.sort(), ['Innovazione', 'Persone', '—'],
    'il vuoto si mostra come "—", non si nasconde e non diventa una categoria inventata');

  const m = await studio.runStudio(projectId, {
    ...base, source: 'metrics', x: 'month', y: 'value', yAgg: 'last', z: 'dim:piattaforma',
  });
  assert.ok(m.rows.length > 0);
  assert.deepEqual(m.series.sort(), ['Instagram', 'LinkedIn']);
});

test('un campo personalizzato arrivato da Excel è un asse come gli altri', async () => {
  const r = await studio.runStudio(projectId, { ...base, x: 'custom:PILLAR' });
  const v = Object.fromEntries(r.rows.map((x) => [x.x, x.y]));
  assert.equal(v['Persone'], 2);
  assert.equal(v['Innovazione'], 2);
  assert.equal(r.rows.length, 2, 'la riga senza PILLAR non inventa una categoria');
});

test('una dimensione delle misure arrivata dai fogli funziona', async () => {
  const r = await studio.runStudio(projectId, {
    ...base, source: 'metrics', x: 'dim:piattaforma', y: 'value', yAgg: 'last',
  });
  assert.equal(Object.fromEntries(r.rows.map((x) => [x.x, x.y]))['LinkedIn'], 1200);
});

test('nessuna stringa scelta dal client diventa SQL', async () => {
  for (const evil of [
    "day'); DROP TABLE mentions; --",
    'source UNION SELECT password_hash FROM users',
    'engagement_score) , (select count(*) from users',
    'inesistente',
    '',
  ]) {
    await assert.rejects(
      () => studio.runStudio(projectId, { ...base, x: evil }),
      /Campi non validi/,
      `dimensione accettata: ${evil}`,
    );
    await assert.rejects(
      () => studio.runStudio(projectId, { ...base, y: evil, yAgg: 'sum' }),
      /Campi non validi/,
      `misura accettata: ${evil}`,
    );
  }
  // La tabella è ancora lì: nessuna delle stringhe sopra è stata eseguita.
  const alive = await studio.runStudio(projectId, base);
  assert.equal(alive.total, 5);
});

test('un campo personalizzato ostile resta un valore, non codice', async () => {
  // Un progetto può davvero avere una colonna chiamata così. Deve dare zero
  // righe, non un errore e tantomeno una query eseguita.
  const r = await studio.runStudio(projectId, { ...base, x: "custom:x'); DROP TABLE mentions; --" });
  assert.equal(r.rows.length, 0);
  const alive = await studio.runStudio(projectId, base);
  assert.equal(alive.total, 5, 'le mention sono ancora tutte lì');
});

test('sommare un tasso viene detto', async () => {
  const r = await studio.runStudio(projectId, { ...base, y: 'sentiment_score', yAgg: 'sum' });
  assert.ok(r.warnings.some((w) => /medi/i.test(w)),
    `atteso l’avviso sulla media, ricevuto: ${r.warnings.join(' | ')}`);

  const ok = await studio.runStudio(projectId, base);
  assert.equal(ok.warnings.filter((w) => /medi/i.test(w)).length, 0,
    'un conteggio sommato non va segnalato');
});

test('una torta con troppe fette viene segnalata', async () => {
  // Un progetto a parte con sei giorni distinti: la torta diventa illeggibile
  // ben prima che il grafico sia sbagliato, e va detto mentre lo si costruisce.
  const dbMod = await import('../lib/db');
  const schema = await import('../lib/db/schema');
  const db = await dbMod.getDb();
  const [p] = await db.insert(schema.projects).values({
    name: 'Torta', keywords: ['z'], languages: ['it'], mode: 'upload',
  }).returning();
  await db.insert(schema.mentions).values(
    [1, 2, 3, 4, 5, 6].map((d) => ({
      projectId: p.id, source: 'linkedin', externalId: `t${d}`,
      content: 'x', publishedAt: iso(d), engagementScore: d,
    })),
  );

  const r = await studio.runStudio(p.id, { ...base, chart: 'pie', x: 'day' });
  assert.ok(r.rows.length > 4, `servono più di quattro fette, ricevute ${r.rows.length}`);
  assert.ok(r.warnings.some((w) => /torta|fette/i.test(w)),
    `atteso l’avviso sulla torta, ricevuto: ${r.warnings.join(' | ')}`);

  const poche = await studio.runStudio(p.id, { ...base, chart: 'pie' });
  assert.equal(poche.warnings.filter((w) => /torta|fette/i.test(w)).length, 0,
    'due sole fette non vanno segnalate');
});

test('una linea fra categorie viene segnalata, una nel tempo no', async () => {
  const male = await studio.runStudio(projectId, { ...base, chart: 'line' });
  assert.ok(male.warnings.some((w) => /linea/i.test(w)));

  const bene = await studio.runStudio(projectId, { ...base, chart: 'line', x: 'day' });
  assert.equal(bene.warnings.filter((w) => /linea/i.test(w)).length, 0);
});

test('le fonti escono con il nome leggibile, non con lo slug', async () => {
  const r = await studio.runStudio(projectId, base);
  const xs = r.rows.map((x) => x.x);
  assert.ok(!xs.includes('linkedin'), 'lo slug tecnico non deve arrivare sull’asse');
  assert.ok(xs.includes(LI) && /^[A-Z]/.test(LI), `atteso un nome leggibile, ricevuto ${xs.join(', ')}`);
});

test('la palette categorica resta nell’ordine in cui è stata validata', async () => {
  const { PALETTES, paletteColor } = await import('../lib/entity-colors');
  // L'ordine non è estetico: le otto tinte sono validate come SEQUENZA per la
  // separazione in deuteranopia e protanopia. Scambiare il terzo con il quinto
  // porta due serie vicine a ΔE 1,6, cioè indistinguibili.
  assert.deepEqual(PALETTES.categorical.colors.slice(0, 3), ['#3987e5', '#d95926', '#199e70']);
  assert.equal(paletteColor('categorical', 0), '#3987e5');
  // Oltre l'ottava serie non si inventano colori: si degrada al grigio.
  assert.equal(paletteColor('categorical', 99), '#64748b');
});

test('le rampe si campionano su tutta l’estensione', async () => {
  const { PALETTES, paletteColor } = await import('../lib/entity-colors');
  const ramp = PALETTES.sequential.colors;
  // Con tre serie servono gli estremi e il centro, non tre passi consecutivi
  // che a occhio sono lo stesso azzurro.
  assert.equal(paletteColor('sequential', 0, 3), ramp[0]);
  assert.equal(paletteColor('sequential', 2, 3), ramp[ramp.length - 1]);
  assert.notEqual(paletteColor('sequential', 0, 3), paletteColor('sequential', 1, 3));
});

test('il blocco Studio Graph sopravvive alla ripulitura della scaletta', async () => {
  const { sanitizePages } = await import('../lib/custom-report');
  const pages = sanitizePages([{
    title: 'Pagina',
    blocks: [
      { type: 'studio', chartId: 7 },
      { type: 'studio', chartId: 'non un numero' },
      { type: 'studio' },
      { type: 'chart', section: 'volume' },
    ],
  }]);
  assert.deepEqual(
    pages[0].blocks.filter((b) => b.type === 'studio'),
    [{ type: 'studio', chartId: 7 }],
  );
});

test('un grafico cancellato non fa fallire il report che lo cita', async () => {
  const resolved = await studio.resolveStudioBlocks(projectId, [999_999]);
  assert.equal(resolved.size, 0, 'nessun risultato, nessuna eccezione');
});

test('un grafico salvato viene rieseguito con i dati di oggi', async () => {
  const dbMod = await import('../lib/db');
  const schema = await import('../lib/db/schema');
  const db = await dbMod.getDb();
  const [saved] = await db.insert(schema.studioCharts).values({
    projectId, title: 'Interazioni per canale',
    spec: { ...base, y: 'engagement_score', yAgg: 'sum' },
  }).returning();

  const resolved = await studio.resolveStudioBlocks(projectId, [saved.id]);
  const chart = resolved.get(saved.id);
  assert.ok(chart, 'il grafico salvato deve essere risolto');
  assert.equal(chart.title, 'Interazioni per canale');
  assert.equal(chart.rows.find((r) => r.x === LI)?.y, 60);
  assert.equal(chart.palette[0], '#3987e5', 'la palette segue il grafico dentro il PDF');
});

test('un grafico di un altro progetto non si può citare', async () => {
  const dbMod = await import('../lib/db');
  const schema = await import('../lib/db/schema');
  const db = await dbMod.getDb();
  const [other] = await db.insert(schema.projects).values({
    name: 'Altro', keywords: ['y'], languages: ['it'], mode: 'upload',
  }).returning();
  const [chart] = await db.insert(schema.studioCharts).values({
    projectId: other.id, title: 'Riservato', spec: base,
  }).returning();

  const resolved = await studio.resolveStudioBlocks(projectId, [chart.id]);
  assert.equal(resolved.size, 0, 'i grafici non attraversano i confini di progetto');
});
