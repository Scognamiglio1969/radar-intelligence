import { test } from 'node:test';
import assert from 'node:assert/strict';
import { talkwalkerQuery, mapDocument } from '../lib/connectors/talkwalker';
import type { ListeningQuery } from '../lib/connectors/types';

const q = (over: Partial<ListeningQuery> = {}): ListeningQuery => ({
  anyTerms: [], allTerms: [], excludeTerms: [], languages: [], countries: [], ...over,
});

test('la query booleana del progetto diventa sintassi Talkwalker', () => {
  assert.equal(
    talkwalkerQuery(q({ anyTerms: ['clima', 'energia'], allTerms: ['italia'], excludeTerms: ['calcio'] })),
    '("clima" OR "energia") AND "italia" AND NOT "calcio"',
  );
});

test('con i soli termini OR non si aggiungono operatori inutili', () => {
  assert.equal(talkwalkerQuery(q({ anyTerms: ['banche'] })), '("banche")');
});

test('senza termini la query è vuota: il connettore non deve chiamare (e pagare)', () => {
  assert.equal(talkwalkerQuery(q()), '');
});

test('oltre 50 operandi si taglia, e a cadere sono gli OR non i filtri', () => {
  const many = Array.from({ length: 60 }, (_, i) => `t${i}`);
  const out = talkwalkerQuery(q({ anyTerms: many, allTerms: ['sempre'], excludeTerms: ['mai'] }));
  const operandi = (out.match(/"/g)?.length ?? 0) / 2;
  assert.equal(operandi, 50, 'esattamente il tetto dell\'API');
  assert.match(out, /"sempre"/, 'il termine AND sopravvive');
  assert.match(out, /NOT "mai"/, 'l\'esclusione sopravvive');
});

test('un documento editoriale viene letto come articolo, un post come post', () => {
  const news = mapDocument({ content: 'testo', url: 'https://ansa.it/x', source_type: ['ONLINE_NEWS'] });
  assert.equal(news?.source, 'talkwalker_news');
  const post = mapDocument({ content: 'testo', url: 'https://x.com/y', source_type: ['TWITTER'] });
  assert.equal(post?.source, 'talkwalker');
});

test('la mappatura prende autore, dominio, lingua, reach e paese dichiarato', () => {
  const m = mapDocument({
    url: 'https://ansa.it/x', title: 'Titolo', content: 'c'.repeat(1000),
    published: 1_757_000_000_000, lang: 'it', engagement: 42, reach: 9000,
    source_type: 'ONLINE_NEWS',
    extra_author_attributes: { name: 'Mario Rossi', short_name: 'mrossi' },
    extra_source_attributes: { name: 'ansa.it', world_data: { country: 'it' } },
  })!;
  assert.equal(m.author, 'Mario Rossi');
  assert.equal(m.authorHandle, 'mrossi');
  assert.equal(m.community, 'ansa.it');
  assert.equal(m.language, 'it');
  assert.equal(m.country, 'it');
  assert.equal(m.reach, 9000);
  assert.deepEqual(m.engagement, { likes: 42 });
  assert.equal(m.content.length, 800, 'contenuto troncato');
  assert.equal(m.publishedAt.getUTCFullYear(), 2025);
});

test('un documento senza testo viene scartato invece di entrare vuoto in archivio', () => {
  assert.equal(mapDocument({ url: 'https://x/1', content: '   ' }), null);
});

test('senza url l\'identificativo si costruisce da data e titolo, per il dedup', () => {
  const m = mapDocument({ content: 'testo', title: 'Titolo', published: 1_757_000_000_000 })!;
  assert.match(m.externalId, /^1757000000000:Titolo$/);
});

// --- da dove prende i dati: il topic comanda, la query è il ripiego ----------

import { talkwalker } from '../lib/connectors/talkwalker';

/** Intercetta la fetch e restituisce una risposta vuota ma valida. */
function captureUrl(): { urls: string[]; restore: () => void } {
  const urls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ status_code: '0', result_content: { data: [] } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = original; } };
}

test('con i topic scelti NON si manda nessuna query: comanda Talkwalker', async () => {
  process.env.TALKWALKER_ACCESS_TOKEN = 'tok';
  const cap = captureUrl();
  try {
    await talkwalker.fetchMentions(q({
      anyTerms: ['queste', 'parole', 'non', 'devono', 'partire'],
      talkwalkerProject: 'proj1',
      talkwalkerTopics: ['kpnutesu_1', 'kpnutesu_2'],
    }));
    const url = new URL(cap.urls[0]!);
    assert.equal(url.pathname, '/api/v1/search/p/proj1/results');
    assert.deepEqual(url.searchParams.getAll('topic'), ['kpnutesu_1', 'kpnutesu_2']);
    assert.equal(url.searchParams.has('q'), false, 'la ricerca è già scritta in Talkwalker');
  } finally {
    cap.restore();
  }
});

test('senza topic ma con parole chiave si usa la query booleana', async () => {
  process.env.TALKWALKER_ACCESS_TOKEN = 'tok';
  const cap = captureUrl();
  try {
    await talkwalker.fetchMentions(q({ anyTerms: ['clima'], talkwalkerProject: 'proj1' }));
    const url = new URL(cap.urls[0]!);
    assert.equal(url.searchParams.get('q'), '("clima")');
    assert.equal(url.searchParams.has('topic'), false);
  } finally {
    cap.restore();
  }
});

test('senza topic e senza parole chiave si prende TUTTO il progetto', async () => {
  process.env.TALKWALKER_ACCESS_TOKEN = 'tok';
  const cap = captureUrl();
  try {
    await talkwalker.fetchMentions(q({ talkwalkerProject: 'proj1' }));
    const url = new URL(cap.urls[0]!);
    assert.equal(url.searchParams.get('topic'), 'search', 'il topic jolly di Talkwalker');
    assert.equal(url.searchParams.has('q'), false);
    assert.equal(url.searchParams.get('hpp'), '100');
    assert.equal(url.searchParams.get('time_range'), '7d');
  } finally {
    cap.restore();
  }
});

test('senza token non parte nessuna chiamata', async () => {
  delete process.env.TALKWALKER_ACCESS_TOKEN;
  const cap = captureUrl();
  try {
    const out = await talkwalker.fetchMentions(q({ talkwalkerProject: 'proj1' }));
    assert.deepEqual(out, []);
    assert.equal(cap.urls.length, 0);
  } finally {
    cap.restore();
  }
});
