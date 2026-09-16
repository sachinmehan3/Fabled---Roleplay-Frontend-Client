import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chubCardUrl, chubPath } from '../web/core/chub.ts';

test('character links from both Chub domains are understood', () => {
  assert.equal(chubPath('https://www.characterhub.org/characters/Nihunu/rachel-29118321'), 'Nihunu/rachel-29118321');
  assert.equal(chubPath('https://chub.ai/characters/Nihunu/rachel-29118321'), 'Nihunu/rachel-29118321');
  assert.equal(chubPath('https://www.chub.ai/characters/a/b'), 'a/b');
  assert.equal(chubPath('characterhub.org/characters/a/b'), 'a/b', 'the scheme is optional');
});

test('query strings, fragments and trailing parts are ignored', () => {
  assert.equal(chubPath('  https://chub.ai/characters/a/b/main?tab=x#top  '), 'a/b');
  assert.equal(chubPath('https://chub.ai/characters/a/b/'), 'a/b');
});

test('anything else is refused', () => {
  assert.equal(chubPath(''), null);
  assert.equal(chubPath('not a link'), null);
  assert.equal(chubPath('https://example.com/characters/a/b'), null);
  assert.equal(chubPath('https://chub.ai.evil.com/characters/a/b'), null);
  assert.equal(chubPath('https://chub.ai/lorebooks/a/b'), null);
  assert.equal(chubPath('https://chub.ai/characters/a'), null);
  assert.equal(chubPath('https://chub.ai/characters/a/%2e%2e'), null);
});

test('path parts are escaped before they go into the card URL', () => {
  const path = chubPath('https://chub.ai/characters/some%20one/n%3Fx')!;
  assert.equal(path, 'some%20one/n%3Fx');
  assert.equal(chubCardUrl(path), 'https://avatars.charhub.io/avatars/some%20one/n%3Fx/chara_card_v2.png');
});
