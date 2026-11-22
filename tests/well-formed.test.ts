import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wellFormed } from '../lib/ingest';

// Un post troncato a metà di un'emoji: Neon rifiuta il surrogato isolato e
// fa fallire l'intero blocco di insert. Dopo la pulizia il testo è valido,
// anche dentro i campi JSONB, e le Date non diventano oggetti vuoti.
test('i surrogati isolati diventano U+FFFD, il resto resta com’è', () => {
  const quando = new Date('2026-11-21T10:00:00Z');
  const riga = {
    content: 'ciao \uD83D fine',
    title: 'intero 😀',
    publishedAt: quando,
    engagement: { likes: 3, note: ['\uDE00x'] },
    reach: null,
  };
  const pulita = wellFormed(riga);
  assert.equal(pulita.content, 'ciao � fine');
  assert.equal(pulita.title, 'intero 😀');
  assert.equal(pulita.publishedAt, quando);
  assert.deepEqual(pulita.engagement, { likes: 3, note: ['�x'] });
  assert.equal(pulita.reach, null);
  assert.ok(pulita.content.isWellFormed());
});
