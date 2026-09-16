import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimKey, claimVerdict, distinctiveTerms, signalOf, toRow, verdictOf } from '../lib/factcheck';

// I verdetti arrivano scritti a mano da decine di testate in decine di lingue.
// Leggerli male vuol dire dire "smentita" di una cosa vera: il danno peggiore
// che questa sezione possa fare.

test('i verdetti si leggono in più lingue', () => {
  const casi: [string, string][] = [
    ['False', 'false'], ['Falso', 'false'], ['Pants on Fire!', 'false'], ['Bufala', 'false'],
    ['Faux', 'false'], ['Falsch', 'false'], ['Fake', 'false'], ['Incorrect', 'false'],
    ['Misleading', 'misleading'], ['Fuorviante', 'misleading'], ['Trompeur', 'misleading'],
    ['Engañoso', 'misleading'], ['Missing context', 'misleading'], ['Mostly False', 'misleading'],
    ['Partly false', 'misleading'], ['Parzialmente falso', 'misleading'],
    ['Half True', 'mixed'], ['Mixture', 'mixed'], ['Partly true', 'mixed'],
    ['True', 'true'], ['Vero', 'true'], ['Mostly True', 'true'], ['Correct', 'true'], ['Vrai', 'true'],
    ['Unproven', 'unverifiable'], ['Satire', 'unverifiable'], ['Non verificabile', 'unverifiable'],
    ['Four Pinocchios', 'other'], ['', 'other'],
  ];
  for (const [rating, atteso] of casi) assert.equal(verdictOf(rating), atteso, `"${rating}"`);
});

test('"not true" è falso, non vero; "incorrect" non è "correct"', () => {
  assert.equal(verdictOf('Not true'), 'false');
  assert.equal(verdictOf('This is not true'), 'false');
  assert.equal(verdictOf('Incorrect'), 'false');
});

test('falso e fuorviante insieme non sono un disaccordo', () => {
  assert.equal(claimVerdict(['False', 'Misleading']), 'false');
  assert.equal(claimVerdict(['Misleading', 'Missing context']), 'misleading');
});

test('vero e falso insieme sono una contestazione, non una media', () => {
  assert.equal(claimVerdict(['True', 'False']), 'contested');
  assert.equal(claimVerdict(['Half true', 'Misleading']), 'contested');
  assert.equal(claimVerdict(['Four Pinocchios']), 'other');
});

test('la chiave ignora maiuscole, accenti e punteggiatura', () => {
  assert.equal(claimKey('L\'AI ruberà il 40% dei lavori!', 'Tizio'), claimKey('l’ai rubera il 40% dei lavori', 'tizio'));
  assert.notEqual(claimKey('Stessa frase', 'Tizio'), claimKey('Stessa frase', 'Caio'));
});

test('le parole distintive scartano le comuni e preferiscono le lunghe', () => {
  const t = distinctiveTerms('Video shows that Anthropic founders were arrested in 2025 for fraud');
  assert.deepEqual([...t].sort(), ['Anthropic', 'arrested', 'founders']);
  assert.ok(!distinctiveTerms('the and for with').length);
});

test('il segnale dice se una smentita circola ancora', () => {
  assert.equal(signalOf('false', { last7: 5, prev7: 2, total: 20 }), 'debunked-growing');
  assert.equal(signalOf('misleading', { last7: 2, prev7: 5, total: 20 }), 'debunked-circulating');
  assert.equal(signalOf('false', { last7: 0, prev7: 3, total: 3 }), 'debunked-quiet');
  assert.equal(signalOf('false', null), 'debunked-quiet');
  assert.equal(signalOf('true', { last7: 9, prev7: 0, total: 9 }), 'confirmed');
  assert.equal(signalOf('contested', null), 'contested');
});

test('una verifica che non contiene il termine cercato si scarta', () => {
  // La ricerca di Google è larga: "Claude" trova anche Claude Monet.
  const monet = { text: 'Painting by Claude Monet sold for $1', claimReview: [{ url: 'https://x.org/a', textualRating: 'False', title: 'Monet' }] };
  assert.equal(toRow(monet, 'Anthropic'), null);
  const ok = toRow({ text: 'Anthropic banned in Italy', claimant: 'Post', claimReview: [
    { url: 'https://pagellapolitica.it/x', textualRating: 'Falso', publisher: { name: 'Facta' }, languageCode: 'it' },
  ] }, 'anthropic');
  assert.ok(ok);
  assert.equal(ok.verdict, 'false');
  assert.equal(ok.language, 'it');
  assert.equal(ok.reviews[0].publisher, 'Facta');
});

test('una verifica senza verdetto non entra', () => {
  assert.equal(toRow({ text: 'Anthropic x', claimReview: [{ url: 'https://x.org' }] }, 'Anthropic'), null);
});
