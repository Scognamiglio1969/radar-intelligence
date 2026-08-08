import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySheet, looksLikePerson, ARCHETYPE_LABEL } from '../lib/sheet-archetype';
import { mergeSamePerson } from '../lib/people-insights';
import { profileColumns } from '../lib/import-profile';

// Riconoscere una persona è la premessa di una scheda intestata a lei. Ogni
// errore qui si vede subito e fa perdere fiducia in tutto il resto: una scheda
// "AVG Commenti" con follower e ritmo di pubblicazione è ridicola, e tre schede
// per la stessa persona dividono i suoi dati in tre.

test('una metrica non è una persona', () => {
  // Sono tutti due parole capitalizzate, come un nome e cognome.
  for (const m of ['AVG Commenti', 'Total Followers', 'Engagement Rate', 'Impressions',
    'Condivisioni', 'Reactions', 'Reazioni', 'Totale Interazioni', 'LK Follower', 'Updates']) {
    assert.equal(looksLikePerson(m), false, `"${m}" non deve passare per una persona`);
  }
});

test('un nome di persona viene riconosciuto', () => {
  for (const n of ['Donnet', 'Marco Sesana', 'Philippe Donnet', 'Anchustegui',
    'Gurtler', 'Riccardo Acquaviva', "Cécile Paillard"]) {
    assert.equal(looksLikePerson(n), true, `"${n}" è una persona`);
  }
});

test('una piattaforma o un brand non sono persone', () => {
  for (const x of ['LinkedIn', 'Instagram', 'TikTok', 'Gruppo FS', 'Generali Italia']) {
    assert.equal(looksLikePerson(x), false, `"${x}" non è una persona`);
  }
});

test('la stessa persona scritta in tre modi diventa una scheda sola', () => {
  // Il file reale la chiama così in tre fogli diversi.
  const merged = mergeSamePerson(['Acquaviva', 'RICCARDO ACQUAVIVA', 'ACQUAVIVA']);
  assert.equal(merged.length, 1);
  assert.equal(merged[0], 'Riccardo Acquaviva', 'si tiene il nome più completo, reso leggibile');
});

test('persone diverse restano distinte', () => {
  const merged = mergeSamePerson(['Donnet', 'Borean', 'Marco Sesana', 'Sesana']);
  assert.deepEqual(merged.sort(), ['Borean', 'Donnet', 'Marco Sesana']);
});

test('un foglio intestato a una persona è di personal branding', () => {
  const columns = ['COUNT', 'DATA', 'LINK', 'COPY', 'FORMATO', 'IMPRESSION', 'REACTION'];
  const rows = Array.from({ length: 20 }, (_, i) => ({
    COUNT: i, DATA: `0${(i % 9) + 1}/03/2024`, LINK: `https://x.com/${i}`,
    COPY: `Un post lungo abbastanza da essere il contenuto, numero ${i}, con parole vere.`,
    FORMATO: ['Video', 'Immagine'][i % 2], IMPRESSION: 1000 + i, REACTION: i,
  }));
  const g = classifySheet(profileColumns(columns, rows), 'mentions', 'Donnet');
  assert.equal(g.archetype, 'person-posts');
  assert.equal(g.people, true);
  assert.match(g.reason, /Donnet/);
});

test('un foglio di canale non viene scambiato per una persona', () => {
  const columns = ['Canale', 'Data', 'Titolo del post', 'Impressioni', 'Clic'];
  const rows = Array.from({ length: 20 }, (_, i) => ({
    Canale: 'LinkedIn', Data: `0${(i % 9) + 1}/03/2024`,
    'Titolo del post': `Un post aziendale lungo abbastanza da essere contenuto, numero ${i}.`,
    Impressioni: 5000 + i, Clic: i,
  }));
  const g = classifySheet(profileColumns(columns, rows), 'mentions', 'LK');
  assert.equal(g.archetype, 'platform-posts');
  assert.equal(g.people, false);
});

test('una serie di follower e una di pubblicazioni sono archetipi diversi', () => {
  const audience = classifySheet(
    profileColumns(['Data', 'FB fan', 'IG follower'], [{ Data: '31/01/2024', 'FB fan': 100, 'IG follower': 200 }]),
    'metrics', 'FOLLOWER', { date: 'Data', metrics: ['FB fan', 'IG follower'] },
  );
  assert.equal(audience.archetype, 'audience-series');

  const publishing = classifySheet(
    profileColumns(['Data', 'LK', 'FB'], [{ Data: '31/01/2024', LK: 12, FB: 3 }]),
    'metrics', 'tot pubblicazioni', { date: 'Data', metrics: ['LK', 'FB'] },
  );
  assert.equal(publishing.archetype, 'publishing-series');

  const breakdown = classifySheet(
    profileColumns(['DATA POST', 'AZIENDA', '%'], [{ 'DATA POST': '12/01/2026', AZIENDA: 'Generali', '%': 0.16 }]),
    'metrics', 'Donnet_Aud', { date: 'DATA POST', entity: 'AZIENDA', metrics: ['%'], dims: ['AZIENDA'] },
  );
  assert.equal(breakdown.archetype, 'audience-breakdown');
});

test('ogni archetipo ha una etichetta leggibile', () => {
  for (const k of Object.keys(ARCHETYPE_LABEL)) {
    assert.ok(ARCHETYPE_LABEL[k as keyof typeof ARCHETYPE_LABEL].length > 3);
  }
});
