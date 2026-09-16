import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMemory, parseFold } from '../server/memory.ts';
import type { ChatMemory } from '../server/store.ts';

const empty: ChatMemory = { version: 1, summary: '', facts: [], coveredThrough: 0, folds: 0, updatedAt: 0 };

const fact = (text: string, pinned = false) => ({ id: text, text, pinned, createdAt: 1 });

test('plain JSON is parsed', () => {
  const fold = parseFold('{"summary":"They argued.","facts":["Kai forged a map"]}');
  assert.deepEqual(fold, { summary: 'They argued.', facts: ['Kai forged a map'] });
});

test('a fenced reply is parsed', () => {
  const fold = parseFold('```json\n{"summary":"They argued.","facts":[]}\n```');
  assert.equal(fold?.summary, 'They argued.');
});

test('prose around the JSON is ignored', () => {
  const fold = parseFold('Sure! Here is the memory:\n{"summary":"A quiet evening.","facts":["It rained"]}\nHope that helps.');
  assert.equal(fold?.summary, 'A quiet evening.');
  assert.deepEqual(fold?.facts, ['It rained']);
});

test('bullet markers are stripped from facts', () => {
  const fold = parseFold('{"summary":"x","facts":["- Kai is hurt","* Lyra left"]}');
  assert.deepEqual(fold?.facts, ['Kai is hurt', 'Lyra left']);
});

test('non-string facts are dropped rather than trusted', () => {
  const fold = parseFold('{"summary":"x","facts":["good",42,null,{"a":1}]}');
  assert.deepEqual(fold?.facts, ['good']);
});

test('unusable replies return null instead of throwing', () => {
  assert.equal(parseFold('I cannot do that.'), null);
  assert.equal(parseFold('{"summary":'), null);
  assert.equal(parseFold('{"summary":"","facts":[]}'), null, 'an empty fold is not worth saving');
  assert.equal(parseFold(''), null);
});

test('a fold replaces the summary and appends new facts', () => {
  const current: ChatMemory = { ...empty, summary: 'Old summary.', facts: [fact('Kai has a satchel')] };
  const merged = mergeMemory(current, { summary: 'New summary.', facts: ['Lyra distrusts the archivist'] }, 42);

  assert.equal(merged.summary, 'New summary.');
  assert.deepEqual(
    merged.facts.map((f) => f.text),
    ['Kai has a satchel', 'Lyra distrusts the archivist'],
  );
  assert.equal(merged.coveredThrough, 42);
  assert.equal(merged.folds, 1);
});

test('facts that only differ in punctuation or case are not duplicated', () => {
  const current: ChatMemory = { ...empty, facts: [fact('Kai has a satchel')] };
  const merged = mergeMemory(current, { summary: 's', facts: ['kai has a satchel.', 'Kai  has a  satchel!'] }, 1);
  assert.equal(merged.facts.length, 1);
});

test('an empty summary from a bad fold keeps the old one', () => {
  const current: ChatMemory = { ...empty, summary: 'Worth keeping.' };
  assert.equal(mergeMemory(current, { summary: '', facts: ['a new fact'] }, 5).summary, 'Worth keeping.');
});

test('coveredThrough never moves backwards', () => {
  const current: ChatMemory = { ...empty, coveredThrough: 100 };
  assert.equal(mergeMemory(current, { summary: 's', facts: [] }, 40).coveredThrough, 100);
});

test('the fact list is capped, oldest unpinned first', () => {
  const current: ChatMemory = {
    ...empty,
    facts: Array.from({ length: 40 }, (_, i) => fact(`fact ${i}`, i === 0)),
  };
  const merged = mergeMemory(current, { summary: 's', facts: ['brand new fact'] }, 1);

  assert.equal(merged.facts.length, 40);
  assert.equal(merged.facts[0].text, 'fact 0', 'the pinned one survives');
  assert.ok(!merged.facts.some((f) => f.text === 'fact 1'), 'the oldest unpinned one was dropped');
  assert.equal(merged.facts.at(-1)?.text, 'brand new fact');
});

test('pinned facts are never dropped, even when the list is full of them', () => {
  const current: ChatMemory = {
    ...empty,
    facts: Array.from({ length: 41 }, (_, i) => fact(`pinned ${i}`, true)),
  };
  const merged = mergeMemory(current, { summary: 's', facts: [] }, 1);
  assert.equal(merged.facts.length, 41, 'nothing pinned is sacrificed');
});
