// Models that mark reasoning with <think> tags send them inside the normal
// content stream, split across chunks at arbitrary points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThinkSplitter } from '../web/core/llm.ts';

/** Feed a stream through the splitter and collect prose and thinking separately. */
function run(chunks: string[]) {
  const splitter = createThinkSplitter();
  const parts = [...chunks.flatMap((c) => splitter.push(c)), ...splitter.flush()];
  return {
    text: parts.filter((p) => !p.reasoning).map((p) => p.text).join(''),
    reasoning: parts.filter((p) => p.reasoning).map((p) => p.text).join(''),
  };
}

test('content without tags passes straight through', () => {
  assert.deepEqual(run(['Hello ', 'there.']), { text: 'Hello there.', reasoning: '' });
});

test('a think block is separated from the prose', () => {
  const out = run(['<think>Let me consider.</think>She looked up.']);
  assert.equal(out.reasoning, 'Let me consider.');
  assert.equal(out.text, 'She looked up.');
});

test('tags split across chunks are still caught', () => {
  const out = run(['<th', 'ink>', 'Consider', 'ing.', '</thi', 'nk>', 'She looked up.']);
  assert.equal(out.reasoning, 'Considering.');
  assert.equal(out.text, 'She looked up.');
});

test('a tag split one character at a time is caught', () => {
  const out = run('<think>Hmm.</think>Hello.'.split(''));
  assert.equal(out.reasoning, 'Hmm.');
  assert.equal(out.text, 'Hello.');
});

test('prose before the block is kept', () => {
  const out = run(['Wait. <think>thinking</think> Done.']);
  assert.equal(out.text, 'Wait.  Done.');
  assert.equal(out.reasoning, 'thinking');
});

test('an unclosed block is treated as thinking to the end', () => {
  const out = run(['<think>still going', ' and going']);
  assert.equal(out.reasoning, 'still going and going');
  assert.equal(out.text, '');
});

test('several blocks accumulate', () => {
  const out = run(['<think>one</think>A<think>two</think>B']);
  assert.equal(out.reasoning, 'onetwo');
  assert.equal(out.text, 'AB');
});

test('a lone angle bracket is not mistaken for a tag', () => {
  assert.deepEqual(run(['a < b and c > d']), { text: 'a < b and c > d', reasoning: '' });
});

test('text that merely starts like a tag is emitted once it cannot match', () => {
  assert.deepEqual(run(['<thin', 'g> is not a tag']), { text: '<thing> is not a tag', reasoning: '' });
});

test('a held-back partial tag is flushed at the end of the stream', () => {
  assert.deepEqual(run(['done <thi']), { text: 'done <thi', reasoning: '' });
});
