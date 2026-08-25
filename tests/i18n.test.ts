import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DICT, formatDate, formatNumber, tFor } from '../lib/i18n-dict';
import { localeDirective } from '../lib/content-locale';

test('English and Italian dictionaries have identical keys', () => {
  assert.deepEqual(Object.keys(DICT.en).sort(), Object.keys(DICT.it).sort());
});

test('translator uses localized copy and falls back safely', () => {
  assert.equal(tFor('it')('ui.save', 'Save'), 'Salva');
  assert.equal(tFor('en')('ui.save', 'Save'), 'Save');
  assert.equal(tFor('en')('unknown.key', 'Fallback'), 'Fallback');
  assert.equal(tFor('it')('unknown.key', 'Fallback'), 'Fallback');
});

test('date and number helpers follow the selected locale', () => {
  assert.equal(formatNumber('en', 12345.5), '12,345.5');
  assert.equal(formatNumber('it', 12345.5), '12.345,5');
  const date = new Date('2026-08-25T00:00:00Z');
  assert.notEqual(formatDate('en', date, { timeZone: 'UTC' }), formatDate('it', date, { timeZone: 'UTC' }));
});

test('content prompt explicitly requests either configured language', () => {
  assert.match(localeDirective('en'), /in English/);
  assert.match(localeDirective('it'), /in Italian/);
  assert.match(localeDirective('it'), /JSON keys/);
});
