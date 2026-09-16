import { test } from 'node:test';
import assert from 'node:assert/strict';
import { languageCode, newsdataQuery, parseNewsdataDate, toMention } from '../lib/connectors/newsdata';
import { lemmyText, literalMatch } from '../lib/connectors/lemmy';
import { episodeToMention, feedLanguage, podcastIndexHeaders } from '../lib/connectors/podcastindex';
import { excerptAround } from '../lib/connectors/util';

const q = (anyTerms: string[], allTerms: string[] = [], excludeTerms: string[] = []) => ({
  anyTerms, allTerms, excludeTerms, languages: [], countries: [],
});

// --- NewsData.io ---------------------------------------------------------------

test('la query NewsData non supera i cento caratteri', () => {
  const terms = Array.from({ length: 30 }, (_, i) => `termine numero ${i}`);
  const out = newsdataQuery(q(terms, ['vincolo'], ['escluso']));
  assert.ok(out.length <= 100, `${out.length} caratteri: "${out}"`);
  assert.ok(out.startsWith('("termine numero 0" OR'));
});

test('la query NewsData porta AND e NOT solo se c\'è spazio', () => {
  assert.equal(newsdataQuery(q(['Anthropic'], ['Claude'], ['musica'])), 'Anthropic AND Claude NOT musica');
  assert.equal(newsdataQuery(q([])), '');
});

test('le date di NewsData sono UTC anche se non lo dicono', () => {
  // Senza la Z, "2026-09-16 14:26:45" verrebbe letta nel fuso del server.
  assert.equal(parseNewsdataDate('2026-09-16 14:26:45').toISOString(), '2026-09-16T14:26:45.000Z');
  assert.ok(Number.isNaN(parseNewsdataDate(undefined).getTime()));
});

test('il segnaposto del piano gratuito non diventa il testo dell\'articolo', () => {
  const m = toMention({
    article_id: 'a1', title: 'Titolo', link: 'https://x.it/a',
    description: 'Il sommario vero.', content: 'ONLY AVAILABLE IN PAID PLANS',
    pubDate: '2026-09-16 10:00:00', source_name: 'La Testata', language: 'italian', country: ['italy'],
  });
  assert.ok(m);
  assert.equal(m.content, 'Il sommario vero.');
  assert.equal(m.language, 'it');
  assert.equal(m.country, 'italy');
  assert.equal(m.author, 'La Testata');
});

test('un articolo senza titolo o link si scarta', () => {
  assert.equal(toMention({ title: 'x' }), null);
  assert.equal(toMention({ link: 'https://x' }), null);
});

test('le lingue per esteso diventano codici', () => {
  assert.equal(languageCode('English'), 'en');
  assert.equal(languageCode('it'), 'it');
  assert.equal(languageCode('klingon'), undefined);
});

// --- Lemmy -------------------------------------------------------------------

test('il markdown di Lemmy diventa testo leggibile', () => {
  const t = lemmyText('![](https://img/x.jpg) Secondo [Politico](https://politico.com) il **63%** degli americani');
  assert.equal(t, 'Secondo Politico il 63% degli americani');
});

test('la corrispondenza di Lemmy è letterale', () => {
  assert.equal(literalMatch('Claude', 'Anthropic rilascia Claude 5'), true);
  assert.equal(literalMatch('Claude', 'the CLAUDS survey'), false);
});

// --- Podcast Index -----------------------------------------------------------------

test('la firma di Podcast Index è lo SHA-1 di chiave + segreto + data', async () => {
  const h = await podcastIndexHeaders('KEY', 'SECRET', 1613713388 * 1000);
  assert.equal(h['X-Auth-Date'], '1613713388');
  assert.equal(h.Authorization, 'ff125b7e8565a2a52f5900320f6cd498e7468ff8');
  assert.equal(h['X-Auth-Key'], 'KEY');
  assert.ok(h['User-Agent'].length > 0);
});

test('un episodio che non nomina il termine si scarta', () => {
  const base = { id: 1, title: 'Puntata 12', description: 'Parliamo di calcio', datePublished: 1_790_000_000 };
  assert.equal(episodeToMention(base, 'Anthropic'), null);
  const m = episodeToMention({ ...base, description: 'Ospite da Anthropic', feedTitle: 'Tech Talk', duration: 3600 }, 'anthropic');
  assert.ok(m);
  assert.equal(m.community, 'Tech Talk · 60 min');
  assert.equal(m.publishedAt.getTime(), 1_790_000_000_000);
});

test('la lingua del feed diventa un codice', () => {
  assert.equal(feedLanguage('it-IT'), 'it');
  assert.equal(feedLanguage('en-us'), 'en');
  assert.equal(feedLanguage(''), undefined);
});

test('l\'estratto di un testo lungo contiene il termine cercato', () => {
  const text = `${'parole di contorno '.repeat(200)}qui si parla di Anthropic e del resto ${'altro testo '.repeat(50)}`;
  const out = excerptAround(text, 'anthropic', 300);
  assert.ok(out.includes('Anthropic'));
  assert.ok(out.length <= 300);
  assert.ok(out.startsWith('…'));
  // Un testo breve resta com'è.
  assert.equal(excerptAround('breve Anthropic', 'anthropic', 300), 'breve Anthropic');
});
