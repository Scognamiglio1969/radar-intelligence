import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heuristicMapping, profileColumns } from '../lib/import-profile';

// Il riconoscimento delle colonne è deterministico e deve restarlo: è la rete
// di sicurezza che tiene in piedi l'import quando la chiamata all'AI non
// risponde. Ogni caso qui sotto è un errore che si è verificato davvero su un
// export reale.

/** Un export di listening realistico, con le sue trappole. */
function realisticExport() {
  const columns = [
    'Date', 'Time', 'Social Network', 'Source', 'Post Text', 'Author Name',
    'Handle', 'Followers', 'Reach', 'Likes', 'Comments', 'Shares',
    'Engagement Rate %', 'Sentiment', 'Language', 'URL',
  ];
  const rows = Array.from({ length: 40 }, (_, i) => ({
    'Date': `0${(i % 9) + 1}/03/2024`,
    'Time': '14:30',
    'Social Network': ['Twitter', 'Facebook', 'Instagram', 'TikTok'][i % 4],
    'Source': i % 2 ? 'Organic' : 'Sponsored',
    'Post Text': `Un contenuto abbastanza lungo da sembrare un post numero ${i}, con qualche parola in più.`,
    'Author Name': `Autore ${i}`,
    'Handle': `@utente${i}`,
    'Followers': 1000 + i * 7,
    'Reach': 5000 + i * 31,
    'Likes': i * 3,
    'Comments': i,
    'Shares': i % 5,
    'Engagement Rate %': 1.5 + (i % 10) / 10,
    'Sentiment': ['Positive', 'Neutral', 'Negative'][i % 3],
    'Language': ['it', 'en'][i % 2],
    'URL': `https://example.com/post/${i}`,
  }));
  return { columns, rows };
}

function mapOf(profiles: ReturnType<typeof profileColumns>, rowCount: number) {
  const out: Record<string, string> = {};
  for (const p of heuristicMapping(profiles, rowCount)) {
    if (p.field && p.confidence !== 'bassa') out[p.field] = p.column;
  }
  return out;
}

test('riconosce i campi di un export di listening reale', () => {
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.content, 'Post Text');
  assert.equal(map.date, 'Date');
  assert.equal(map.time, 'Time');
  assert.equal(map.author, 'Author Name');
  assert.equal(map.authorHandle, 'Handle');
  assert.equal(map.url, 'URL');
  assert.equal(map.sentiment, 'Sentiment');
  assert.equal(map.language, 'Language');
  assert.equal(map.likes, 'Likes');
  assert.equal(map.comments, 'Comments');
  assert.equal(map.shares, 'Shares');
});

test('la fonte si riconosce dai VALORI, non dal nome della colonna', () => {
  // "Source" contiene Organic/Sponsored: è il tipo di acquisizione, non la
  // piattaforma. La fonte vera è "Social Network", che contiene i nomi delle
  // piattaforme. Fidarsi del nome della colonna qui sbaglia.
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.source, 'Social Network');
  assert.notEqual(map.source, 'Source');
});

test('reach non viene confuso con followers', () => {
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);
  assert.equal(map.reach, 'Reach');
});

test('un tasso percentuale non viene preso per un totale', () => {
  // "Engagement Rate %" vale 1,5: usarlo come engagement totale falserebbe
  // ogni classifica di contenuti.
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);
  assert.notEqual(map.engagement, 'Engagement Rate %');
});

test('nessuna colonna viene assegnata a due campi diversi', () => {
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);
  const used = Object.values(map);
  assert.equal(new Set(used).size, used.length, `colonna assegnata due volte: ${used.join(', ')}`);
});

test('intestazioni in italiano', () => {
  const columns = ['Data', 'Testo', 'Autore', 'Piattaforma', 'Mi piace', 'Commenti', 'Link'];
  const rows = Array.from({ length: 30 }, (_, i) => ({
    'Data': `1${i % 9}/04/2024`,
    'Testo': `Un contenuto italiano abbastanza lungo per sembrare un post, numero ${i}.`,
    'Autore': `Autore ${i}`,
    'Piattaforma': ['Twitter', 'Facebook', 'LinkedIn'][i % 3],
    'Mi piace': i * 2,
    'Commenti': i,
    'Link': `https://example.com/${i}`,
  }));
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.content, 'Testo');
  assert.equal(map.date, 'Data');
  assert.equal(map.author, 'Autore');
  assert.equal(map.source, 'Piattaforma');
  assert.equal(map.url, 'Link');
});

test('gli URL non vengono scambiati per date', () => {
  // Gli URL contengono "/" e ":" e Date.parse li accetta: senza escluderli
  // prima, una colonna di link veniva profilata come colonna di date.
  const columns = ['Testo', 'Link'];
  const rows = Array.from({ length: 20 }, (_, i) => ({
    'Testo': `Contenuto numero ${i} lungo quanto basta per essere un post.`,
    'Link': `https://example.com/2024/03/12/articolo-${i}`,
  }));
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.url, 'Link');
  assert.notEqual(map.date, 'Link');
});

test('un file senza colonna di testo non ne inventa una', () => {
  const columns = ['Data', 'Like', 'Commenti'];
  const rows = Array.from({ length: 15 }, (_, i) => ({
    'Data': `0${(i % 9) + 1}/05/2024`, 'Like': i, 'Commenti': i % 3,
  }));
  const map = mapOf(profileColumns(columns, rows), rows.length);
  assert.equal(map.content, undefined);
});
