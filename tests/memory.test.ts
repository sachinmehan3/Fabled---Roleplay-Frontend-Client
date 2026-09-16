import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSummary } from '../web/core/memory.ts';

test('a plain summary is kept as written', () => {
  assert.equal(cleanSummary('  Kai and Lyra argued, then made peace.  '), 'Kai and Lyra argued, then made peace.');
});

test('a fenced reply is unwrapped', () => {
  assert.equal(cleanSummary('```\nThey argued.\n```'), 'They argued.');
  assert.equal(cleanSummary('```markdown\nThey argued.\n```'), 'They argued.');
});

test('a summary the model wrapped in quotes is unwrapped', () => {
  assert.equal(cleanSummary('"They argued."'), 'They argued.');
});

test('JSON is unwrapped when a model ignores the format instruction', () => {
  assert.equal(cleanSummary('{"summary":"They argued."}'), 'They argued.');
});

test('a chatty preamble is removed', () => {
  assert.equal(cleanSummary("Here's the updated summary: They argued."), 'They argued.');
  assert.equal(cleanSummary('Summary: They argued.'), 'They argued.');
});

test('quotation marks inside the prose are left alone', () => {
  const text = 'Kai said "the coastline is wrong" and Lyra agreed.';
  assert.equal(cleanSummary(text), text);
});

test('an empty or whitespace reply yields nothing to save', () => {
  assert.equal(cleanSummary(''), '');
  assert.equal(cleanSummary('   \n  '), '');
  assert.equal(cleanSummary('```\n\n```'), '');
});

test('a runaway summary is capped', () => {
  const summary = cleanSummary('word '.repeat(2000));
  assert.ok(summary.length <= 2000, `kept ${summary.length} characters`);
});

test('malformed JSON is treated as prose rather than lost', () => {
  assert.equal(cleanSummary('{"summary": broken'), '{"summary": broken');
});
