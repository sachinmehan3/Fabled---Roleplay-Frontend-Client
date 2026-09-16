import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateLore, entryMatches, matchesKey, EMPTY_ENTRY, type LoreEntry, type Lorebook } from '../server/lorebook.ts';

const estimateTokens = (t: string) => Math.ceil(t.length / 3.5) + 4;

let n = 0;
const entry = (over: Partial<LoreEntry> = {}): LoreEntry => ({
  ...EMPTY_ENTRY,
  id: `e${++n}`,
  content: 'Some lore.',
  ...over,
});

const book = (entries: LoreEntry[], over: Partial<Lorebook> = {}): Lorebook => ({
  id: 1,
  name: 'Book',
  enabled: true,
  characterIds: [],
  scanDepth: 2,
  caseSensitive: false,
  matchWholeWords: true,
  maxRecursionSteps: 1,
  budget: 0,
  entries,
  created_at: 0,
  ...over,
});

const said = (...texts: string[]) =>
  texts.map((content, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant', content }));

const run = (books: Lorebook[], messages: ReturnType<typeof said>, over: Partial<Parameters<typeof activateLore>[0]> = {}) =>
  activateLore({ books, messages, characterId: 1, state: {}, estimateTokens, random: () => 0.5, ...over });

const titles = (r: { entries: { entry: LoreEntry }[] }) => r.entries.map((e) => e.entry.title);

// ---------- keys ----------

test('a plain key matches case-insensitively by default', () => {
  assert.ok(matchesKey('The Vale is quiet', 'vale', false, true));
  assert.ok(!matchesKey('The Vale is quiet', 'vale', true, true));
});

test('whole-word matching does not fire on a fragment', () => {
  assert.ok(!matchesKey('He is a scarecrow', 'scar', false, true));
  assert.ok(matchesKey('He has a scar', 'scar', false, true));
  assert.ok(matchesKey('He is a scarecrow', 'scar', false, false), 'substring mode still matches');
});

test('punctuation around a word does not stop a match', () => {
  assert.ok(matchesKey('"Vale," she said.', 'vale', false, true));
  assert.ok(matchesKey('Vale', 'vale', false, true), 'a key on its own still matches');
});

test('multi-word keys are matched as text even in whole-word mode', () => {
  assert.ok(matchesKey('the long hush is closed', 'long hush', false, true));
});

test('a key written as /regex/ is treated as one', () => {
  assert.ok(matchesKey('she drew the blade', '/bl(a|o)de/', false, true));
  assert.ok(!matchesKey('she drew the sword', '/bl(a|o)de/', false, true));
});

test('a regex key honours case sensitivity and its own flags', () => {
  assert.ok(matchesKey('The VALE', '/vale/', false, true), 'case-insensitive by default');
  assert.ok(!matchesKey('The VALE', '/vale/', true, true), 'case-sensitive when asked');
  assert.ok(matchesKey('The VALE', '/vale/i', true, true), 'an explicit i flag wins');
});

test('a broken regex never matches instead of throwing', () => {
  assert.doesNotThrow(() => matchesKey('anything', '/[unclosed/', false, true));
  assert.equal(matchesKey('anything', '/[unclosed/', false, true), false);
});

// ---------- secondary logic ----------

test('AND ANY needs one of the filter keys', () => {
  const e = entry({ keys: ['song'], secondaryKeys: ['ghosts', 'rain'], logic: 'and_any' });
  assert.ok(entryMatches(e, 'sing me a song about ghosts', false, true));
  assert.ok(!entryMatches(e, 'sing me a song about cats', false, true));
});

test('AND ALL needs every filter key', () => {
  const e = entry({ keys: ['song'], secondaryKeys: ['ghosts', 'rain'], logic: 'and_all' });
  assert.ok(entryMatches(e, 'a song of ghosts and rain', false, true));
  assert.ok(!entryMatches(e, 'a song of ghosts', false, true));
});

test('NOT ANY blocks when any filter key appears', () => {
  const e = entry({ keys: ['song'], secondaryKeys: ['ghosts'], logic: 'not_any' });
  assert.ok(entryMatches(e, 'a song of rain', false, true));
  assert.ok(!entryMatches(e, 'a song of ghosts', false, true));
});

test('NOT ALL blocks only when every filter key appears', () => {
  const e = entry({ keys: ['song'], secondaryKeys: ['ghosts', 'rain'], logic: 'not_all' });
  assert.ok(entryMatches(e, 'a song of ghosts', false, true), 'one of them is fine');
  assert.ok(!entryMatches(e, 'a song of ghosts and rain', false, true));
});

// ---------- activation ----------

test('a constant entry is in without being mentioned', () => {
  const r = run([book([entry({ title: 'always', mode: 'constant' })])], said('hello'));
  assert.deepEqual(titles(r), ['always']);
});

test('a selective entry waits to be named', () => {
  const b = book([entry({ title: 'vale', keys: ['vale'] })]);
  assert.deepEqual(titles(run([b], said('nothing relevant'))), []);
  assert.deepEqual(titles(run([b], said('we rode to the Vale'))), ['vale']);
});

test('scan depth limits how far back keys are looked for', () => {
  const b = book([entry({ title: 'vale', keys: ['vale'] })], { scanDepth: 2 });
  assert.deepEqual(titles(run([b], said('the Vale', 'a', 'b'))), [], 'three messages back is out of range');
  assert.deepEqual(titles(run([b], said('a', 'the Vale', 'b'))), ['vale']);
});

test('an entry can override the book scan depth', () => {
  const b = book([entry({ title: 'deep', keys: ['vale'], scanDepth: 5 })], { scanDepth: 1 });
  assert.deepEqual(titles(run([b], said('the Vale', 'a', 'b'))), ['deep']);
});

test('a disabled entry, an empty one, and a disabled book stay out', () => {
  const b = book([
    entry({ title: 'off', mode: 'constant', enabled: false }),
    entry({ title: 'blank', mode: 'constant', content: '   ' }),
  ]);
  assert.deepEqual(titles(run([b], said('hi'))), []);
  assert.deepEqual(titles(run([book([entry({ title: 'x', mode: 'constant' })], { enabled: false })], said('hi'))), []);
});

test('a book bound to other characters does not apply', () => {
  const mine = book([entry({ title: 'mine', mode: 'constant' })], { id: 1, characterIds: [1] });
  const theirs = book([entry({ title: 'theirs', mode: 'constant' })], { id: 2, characterIds: [2] });
  assert.deepEqual(titles(run([mine, theirs], said('hi'))), ['mine']);
});

// ---------- recursion ----------

test('with recursion off, an entry cannot pull in another', () => {
  const b = book(
    [
      entry({ title: 'first', keys: ['vale'], content: 'The Vale is ruled from Tarn Keep.' }),
      entry({ title: 'second', keys: ['tarn keep'] }),
    ],
    { maxRecursionSteps: 1 },
  );
  assert.deepEqual(titles(run([b], said('we rode to the Vale'))), ['first']);
});

test('with recursion on, one entry activates another', () => {
  const b = book(
    [
      entry({ title: 'first', keys: ['vale'], content: 'The Vale is ruled from Tarn Keep.', order: 1 }),
      entry({ title: 'second', keys: ['tarn keep'], order: 2 }),
    ],
    { maxRecursionSteps: 2 },
  );
  assert.deepEqual(titles(run([b], said('we rode to the Vale'))), ['first', 'second']);
});

test('recursion stops at the configured number of steps', () => {
  const b = book(
    [
      entry({ title: 'a', keys: ['vale'], content: 'mentions Tarn', order: 1 }),
      entry({ title: 'b', keys: ['tarn'], content: 'mentions Reeve', order: 2 }),
      entry({ title: 'c', keys: ['reeve'], order: 3 }),
    ],
    { maxRecursionSteps: 2 },
  );
  assert.deepEqual(titles(run([b], said('the Vale'))), ['a', 'b'], 'c is one step too far');
});

test('prevent-recursion stops an entry passing activation on', () => {
  const b = book(
    [
      entry({ title: 'first', keys: ['vale'], content: 'mentions Tarn Keep', preventRecursion: true }),
      entry({ title: 'second', keys: ['tarn keep'] }),
    ],
    { maxRecursionSteps: 3 },
  );
  assert.deepEqual(titles(run([b], said('the Vale'))), ['first']);
});

test('exclude-from-recursion keeps an entry out unless the chat itself names it', () => {
  const b = book(
    [
      entry({ title: 'first', keys: ['vale'], content: 'mentions Tarn Keep' }),
      entry({ title: 'second', keys: ['tarn keep'], excludeRecursion: true }),
    ],
    { maxRecursionSteps: 3 },
  );
  assert.deepEqual(titles(run([b], said('the Vale'))), ['first']);
  assert.deepEqual(titles(run([b], said('the Vale and Tarn Keep'))).sort(), ['first', 'second']);
});

test('delay-until-recursion keeps an entry out of the first pass', () => {
  const b = book(
    [
      entry({ title: 'first', keys: ['vale'], content: 'mentions Tarn Keep', order: 1 }),
      entry({ title: 'late', keys: ['tarn keep'], delayUntilRecursion: true, order: 2 }),
    ],
    { maxRecursionSteps: 3 },
  );
  assert.deepEqual(titles(run([b], said('Tarn Keep'))), [], 'named by the chat, but it waits for recursion');
  assert.deepEqual(titles(run([b], said('the Vale'))), ['first', 'late']);
});

// ---------- chance, groups, budget ----------

test('probability decides whether an entry makes it', () => {
  const b = book([entry({ title: 'maybe', mode: 'constant', probability: 40 })]);
  assert.deepEqual(titles(run([b], said('hi'), { random: () => 0.2 })), ['maybe'], '20 < 40');
  assert.deepEqual(titles(run([b], said('hi'), { random: () => 0.8 })), [], '80 >= 40');
});

test('only one entry from an inclusion group is used', () => {
  const b = book([
    entry({ title: 'a', mode: 'constant', group: 'weather' }),
    entry({ title: 'b', mode: 'constant', group: 'weather' }),
    entry({ title: 'c', mode: 'constant', group: 'weather' }),
  ]);
  assert.equal(run([b], said('hi')).entries.length, 1);
});

test('prioritise-inclusion makes the highest order win its group', () => {
  const b = book([
    entry({ title: 'low', mode: 'constant', group: 'weather', order: 1 }),
    entry({ title: 'high', mode: 'constant', group: 'weather', order: 9, prioritizeInclusion: true }),
  ]);
  assert.deepEqual(titles(run([b], said('hi'))), ['high']);
});

test('group weight steers the draw', () => {
  const b = book([
    entry({ title: 'rare', mode: 'constant', group: 'weather', groupWeight: 1 }),
    entry({ title: 'common', mode: 'constant', group: 'weather', groupWeight: 99 }),
  ]);
  assert.deepEqual(titles(run([b], said('hi'), { random: () => 0.9 })), ['common']);
  assert.deepEqual(titles(run([b], said('hi'), { random: () => 0 })), ['rare']);
});

test('entries are ordered so the highest insertion order comes last', () => {
  const b = book([
    entry({ title: 'late', mode: 'constant', order: 300 }),
    entry({ title: 'early', mode: 'constant', order: 100 }),
    entry({ title: 'middle', mode: 'constant', order: 200 }),
  ]);
  assert.deepEqual(titles(run([b], said('hi'))), ['early', 'middle', 'late']);
});

test('the budget drops the lowest priority entries, keeping constants', () => {
  const long = 'word '.repeat(40); // about 60 tokens each
  const b = book(
    [
      entry({ title: 'constant', mode: 'constant', content: long, order: 1 }),
      entry({ title: 'keyed', keys: ['vale'], content: long, order: 500 }),
    ],
    { budget: 80 },
  );
  const r = run([b], said('the Vale'));
  assert.deepEqual(titles(r), ['constant'], 'constants are paid for first');
  assert.ok(r.tokens <= 80);
  assert.equal(r.considered, 2, 'both matched; one did not fit');
});

test('an entry named by the chat outranks one named by another entry', () => {
  const long = 'word '.repeat(40);
  const b = book(
    [
      entry({ title: 'direct', keys: ['vale'], content: `${long} mentions Tarn Keep`, order: 1 }),
      entry({ title: 'recursed', keys: ['tarn keep'], content: long, order: 999 }),
    ],
    { budget: 90, maxRecursionSteps: 2 },
  );
  assert.deepEqual(titles(run([b], said('the Vale'))), ['direct']);
});

// ---------- timed effects ----------

test('delay keeps an entry out until the chat is long enough', () => {
  const b = book([entry({ title: 'later', mode: 'constant', delay: 3 })]);
  assert.deepEqual(titles(run([b], said('a', 'b'))), []);
  assert.deepEqual(titles(run([b], said('a', 'b', 'c'))), ['later']);
});

test('sticky keeps an entry in after its keys stop appearing', () => {
  const b = book([entry({ title: 'vale', keys: ['vale'], sticky: 2 })]);
  const first = run([b], said('the Vale'));
  assert.deepEqual(titles(first), ['vale']);
  assert.equal(first.state['1:e' + n].sticky, 3, 'one message in, sticky for two more');

  const later = run([b], said('the Vale', 'nothing'), { state: first.state });
  assert.deepEqual(titles(later), ['vale'], 'still in without being named');
});

test('a sticky entry ignores probability while it lasts', () => {
  const b = book([entry({ title: 'vale', keys: ['vale'], sticky: 3, probability: 1 })]);
  const state = { ['1:e' + n]: { sticky: 99 } };
  assert.deepEqual(titles(run([b], said('anything'), { state, random: () => 0.99 })), ['vale']);
});

test('cooldown keeps an entry out for a while after it fires', () => {
  const b = book([entry({ title: 'vale', keys: ['vale'], cooldown: 3 })]);
  const first = run([b], said('the Vale'));
  assert.equal(first.state['1:e' + n].cooldown, 4);

  const soon = run([b], said('the Vale', 'the Vale'), { state: first.state });
  assert.deepEqual(titles(soon), [], 'named again, but still cooling down');

  const later = run([b], said('a', 'b', 'c', 'd', 'the Vale'), { state: first.state });
  assert.deepEqual(titles(later), ['vale'], 'the cooldown has passed');
});

test('cooldown starts only once sticky has run out', () => {
  const b = book([entry({ title: 'vale', keys: ['vale'], sticky: 2, cooldown: 2 })]);
  const first = run([b], said('the Vale'));
  assert.equal(first.state['1:e' + n].sticky, 3);
  assert.equal(first.state['1:e' + n].cooldown, 5, 'two sticky messages, then two cooling');
});
