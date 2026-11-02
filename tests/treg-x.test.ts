import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTregXPost, type TregXPost } from '../lib/connectors/x';

// mapTregXPost normalizza righe "provider-native" (la forma cambia per
// provider) in RawMention. Qui si prova che legge i nomi di campo alternativi
// e scarta ciò che non è una menzione.

test('mapTregXPost: forma public_metrics + user annidato', () => {
  const row: TregXPost = {
    id_str: '123',
    full_text: 'ANC manifesto launch in Soweto',
    created_at: '2026-10-20T10:00:00Z',
    lang: 'en',
    user: { name: 'Jane Doe', username: 'janedoe' },
    public_metrics: { like_count: 10, retweet_count: 4, reply_count: 2, impression_count: 5000 },
  };
  const m = mapTregXPost(row);
  assert.ok(m);
  assert.equal(m!.source, 'x');
  assert.equal(m!.externalId, '123');
  assert.equal(m!.authorHandle, '@janedoe');
  assert.equal(m!.author, 'Jane Doe');
  assert.equal(m!.url, 'https://x.com/janedoe/status/123');
  assert.equal(m!.engagement?.likes, 10);
  assert.equal(m!.engagement?.shares, 4);
  assert.equal(m!.engagement?.comments, 2);
  assert.equal(m!.reach, 5000);
  assert.equal(m!.language, 'en');
});

test('mapTregXPost: forma piatta con nomi alternativi (text, favorite_count, views)', () => {
  const row: TregXPost = {
    id: 456,
    text: 'another post',
    author: { name: 'Bob', screen_name: 'bob' },
    favorite_count: 7,
    retweet_count: 1,
    views: 900,
  };
  const m = mapTregXPost(row);
  assert.ok(m);
  assert.equal(m!.externalId, '456');
  assert.equal(m!.authorHandle, '@bob');
  assert.equal(m!.engagement?.likes, 7);
  assert.equal(m!.reach, 900);
});

test('mapTregXPost: author come stringa handle con @', () => {
  const m = mapTregXPost({ id: '7', text: 'hi', author: '@someone' });
  assert.ok(m);
  assert.equal(m!.authorHandle, '@someone');
  assert.equal(m!.author, undefined);
});

test('mapTregXPost: scarta una riga senza id o senza testo', () => {
  assert.equal(mapTregXPost({ text: 'no id' }), null);
  assert.equal(mapTregXPost({ id: '1' }), null);
});

test('mapTregXPost: data assente o non valida ripiega su adesso, non NaN', () => {
  const m = mapTregXPost({ id: '1', text: 'x', created_at: 'not-a-date' });
  assert.ok(m);
  assert.ok(!Number.isNaN(m!.publishedAt.getTime()));
});
