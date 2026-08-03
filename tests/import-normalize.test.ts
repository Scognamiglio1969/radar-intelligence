import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText, engagementScore, parseDateTime, parseLanguage, parseNumber, parseSentiment,
} from '../lib/import-normalize';

// I normalizzatori sono la parte dell'import in cui un errore non si vede:
// una data interpretata male non fa fallire niente, sposta soltanto i grafici.

test('parseNumber: abbreviazioni e separatori delle migliaia', () => {
  assert.equal(parseNumber('1.2K'), 1200);
  assert.equal(parseNumber('3,5K'), 3500);
  assert.equal(parseNumber('2M'), 2_000_000);
  assert.equal(parseNumber('1,5 mln'), 1_500_000);
  // Migliaia all'italiana e all'inglese: il punto qui NON è un decimale.
  assert.equal(parseNumber('12.500'), 12500);
  assert.equal(parseNumber('1,234'), 1234);
  // Misto: l'ultimo separatore è quello decimale.
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('1,234.56'), 1234.56);
  assert.equal(parseNumber('12 345'), 12345);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber(null), 0);
  assert.equal(parseNumber('n/d'), 0);
});

test('parseDateTime: seriale Excel', () => {
  const d = parseDateTime(45123);
  assert.ok(d);
  assert.equal(d.toISOString().slice(0, 10), '2023-07-16');
});

test('parseDateTime: giorno/mese/anno europeo', () => {
  const d = parseDateTime('25/12/2024');
  assert.ok(d);
  assert.equal(d.getFullYear(), 2024);
  assert.equal(d.getMonth(), 11);
  assert.equal(d.getDate(), 25);
});

test('parseDateTime: ora in colonna separata', () => {
  const d = parseDateTime('2024-03-15', '14:30');
  assert.ok(d);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
});

test('parseDateTime: 12 ore con am/pm', () => {
  const pm = parseDateTime('2024-03-15', '9:05 pm');
  const am = parseDateTime('2024-03-15', '12:05 am');
  assert.equal(pm?.getHours(), 21);
  assert.equal(am?.getHours(), 0);
});

test('parseDateTime: valore illeggibile → null, non "oggi"', () => {
  // Il fallback a oggi esiste a monte ed è CONTATO nel report: qui la
  // funzione deve dire di non sapere, altrimenti l'errore diventa invisibile.
  assert.equal(parseDateTime('non una data'), null);
  assert.equal(parseDateTime(''), null);
  assert.equal(parseDateTime(null), null);
});

test('parseSentiment: parole, punteggi -1..1 e scale 0..100', () => {
  assert.equal(parseSentiment('Positivo').sentiment, 'positive');
  assert.equal(parseSentiment('NEGATIVE').sentiment, 'negative');
  assert.equal(parseSentiment('neutro').sentiment, 'neutral');
  assert.equal(parseSentiment('0.8').score, 0.8);
  assert.equal(parseSentiment('-0.5').sentiment, 'negative');
  // 0..100 riscalato: 75 → +0.5
  assert.equal(parseSentiment('75').score, 0.5);
  assert.equal(parseSentiment('25').score, -0.5);
  // Sconosciuto: nessuna invenzione.
  assert.deepEqual(parseSentiment('n/d'), { sentiment: null, score: null });
  assert.deepEqual(parseSentiment(''), { sentiment: null, score: null });
});

test('parseLanguage: codici, varianti regionali e nomi estesi', () => {
  assert.equal(parseLanguage('it'), 'it');
  assert.equal(parseLanguage('it-IT'), 'it');
  assert.equal(parseLanguage('en_US'), 'en');
  assert.equal(parseLanguage('Italiano'), 'it');
  assert.equal(parseLanguage('English'), 'en');
  assert.equal(parseLanguage('klingon'), null);
});

test('cleanText: via HTML ed entità, spazi compattati', () => {
  assert.equal(cleanText('<p>Ciao <b>mondo</b></p>'), 'Ciao mondo');
  assert.equal(cleanText('a &amp; b &quot;c&quot;'), 'a & b "c"');
  assert.equal(cleanText('  troppi   spazi  '), 'troppi spazi');
  assert.equal(cleanText(null), '');
});

test('engagementScore: stessa formula dei connettori', () => {
  // Senza la stessa pesatura, un post importato e uno raccolto non sarebbero
  // confrontabili in "Contenuti top", che ordina proprio per questo numero.
  assert.equal(engagementScore({ likes: 10, comments: 5, shares: 2, views: 1000 }), 31);
  assert.equal(engagementScore({}), 0);
});
