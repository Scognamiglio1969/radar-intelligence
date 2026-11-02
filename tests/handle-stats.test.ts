import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTregProfile, isHandlePlatform, type TregProfile } from '../lib/handle-stats';

// Forme reali osservate dai profile endpoint treg (profilo @nasa), una per
// piattaforma: i nomi dei campi cambiano (name / full_name / nickname;
// posts_count / videos_count) e mapTregProfile deve normalizzarli.

test('mapTregProfile: X (name, posts_count, description)', () => {
  const o: TregProfile = {
    username: 'NASA', name: 'NASA', followers: 92297175, following: 115,
    posts_count: 74481, is_verified: true, description: 'Making the impossible possible',
  };
  const s = mapTregProfile('x', o, 'crawl4ai.x.user.profile');
  assert.ok(s);
  assert.equal(s!.platform, 'x');
  assert.equal(s!.handle, 'nasa');            // normalizzato minuscolo, senza @
  assert.equal(s!.displayName, 'NASA');
  assert.equal(s!.followers, 92297175);
  assert.equal(s!.following, 115);
  assert.equal(s!.postsCount, 74481);
  assert.equal(s!.verified, true);
  assert.equal(s!.servedBy, 'crawl4ai.x.user.profile');
  assert.equal(s!.likes, undefined);
});

test('mapTregProfile: Instagram (full_name, biography, posts_count)', () => {
  const o: TregProfile = {
    username: 'nasa', full_name: 'NASA', followers: 104370960, following: 90,
    posts_count: 4986, is_verified: true, biography: 'bio',
  };
  const s = mapTregProfile('instagram', o);
  assert.ok(s);
  assert.equal(s!.displayName, 'NASA');
  assert.equal(s!.postsCount, 4986);
  assert.equal(s!.bio, 'bio');
});

test('mapTregProfile: TikTok (nickname, videos_count, likes)', () => {
  const o: TregProfile = {
    username: 'nasa', nickname: 'NASA', followers: 2151006, following: 23,
    videos_count: 62, likes: 11473351, is_verified: true, biography: 'bio',
  };
  const s = mapTregProfile('tiktok', o);
  assert.ok(s);
  assert.equal(s!.displayName, 'NASA');
  assert.equal(s!.postsCount, 62);           // da videos_count
  assert.equal(s!.likes, 11473351);
});

test('mapTregProfile: scarta un output vuoto o senza identità', () => {
  assert.equal(mapTregProfile('x', null), null);
  assert.equal(mapTregProfile('x', {}), null);        // né handle né follower
});

test('mapTregProfile: follower mancanti non diventano NaN', () => {
  const s = mapTregProfile('x', { username: 'someone' });
  assert.ok(s);
  assert.equal(s!.followers, 0);
  assert.equal(s!.handle, 'someone');
});

test('isHandlePlatform: solo le tre piattaforme', () => {
  assert.equal(isHandlePlatform('x'), true);
  assert.equal(isHandlePlatform('instagram'), true);
  assert.equal(isHandlePlatform('tiktok'), true);
  assert.equal(isHandlePlatform('facebook'), false);
  assert.equal(isHandlePlatform('linkedin'), false);
});
