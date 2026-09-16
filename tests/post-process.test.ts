import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postProcess, CONVERSATION_START } from '../web/core/post-process.ts';
import type { ChatMessage } from '../web/core/prompt.ts';

const sys = (content: string): ChatMessage => ({ role: 'system', content });
const usr = (content: string): ChatMessage => ({ role: 'user', content });
const bot = (content: string): ChatMessage => ({ role: 'assistant', content });

/** The shape Fabled actually builds: memory, a greeting, lore at depth, post-history. */
const realistic: ChatMessage[] = [
  sys('You are Lyra.'),
  sys('<memory>Earlier…</memory>'),
  bot('You came back.'),
  usr('I did.'),
  sys('The Vale is a green basin.'),
  usr('Tell me about it.'),
  sys('Stay in character.'),
];

const shape = (messages: ChatMessage[]) => messages.map((m) => m.role).join(',');

test('none leaves the prompt exactly as built', () => {
  assert.deepEqual(postProcess(realistic, 'none'), realistic);
});

test('merge folds runs of the same role and nothing else', () => {
  const out = postProcess(realistic, 'merge');
  assert.equal(shape(out), 'system,assistant,user,system,user,system');
  assert.equal(out[0].content, 'You are Lyra.\n\n<memory>Earlier…</memory>');
});

test('merge joins consecutive user turns, as lore at a depth can create', () => {
  const out = postProcess([sys('s'), usr('a'), usr('b'), bot('c')], 'merge');
  assert.equal(shape(out), 'system,user,assistant');
  assert.equal(out[1].content, 'a\n\nb');
});

test('semi leaves one system block and strictly alternating turns', () => {
  const out = postProcess(realistic, 'semi');
  assert.equal(shape(out), 'system,assistant,user');
});

test('semi keeps late system text where it was, not hoisted to the top', () => {
  const out = postProcess(realistic, 'semi');
  assert.ok(!out[0].content.includes('Stay in character'), 'post-history must not move to the front');
  assert.ok(out.at(-1)?.content.endsWith('Stay in character.'), 'it belongs with the newest turn');
  assert.ok(out.at(-1)?.content.includes('Tell me about it.'));
});

test('strict also makes the conversation open with the user', () => {
  const out = postProcess(realistic, 'strict');
  assert.equal(shape(out), 'system,user,assistant,user');
  assert.equal(out[1].content, CONVERSATION_START);
});

test('strict leaves a conversation that already opens with the user alone', () => {
  const out = postProcess([sys('s'), usr('hello'), bot('hi')], 'strict');
  assert.equal(shape(out), 'system,user,assistant');
  assert.ok(!out.some((m) => m.content === CONVERSATION_START));
});

test('strict alternates even when the greeting is the only turn', () => {
  const out = postProcess([sys('s'), bot('You came back.')], 'strict');
  assert.equal(shape(out), 'system,user,assistant');
});

test('single flattens everything into one user turn, in order', () => {
  const out = postProcess(realistic, 'single');
  assert.equal(out.length, 1);
  assert.equal(out[0].role, 'user');
  assert.ok(out[0].content.startsWith('You are Lyra.'));
  assert.ok(out[0].content.endsWith('Stay in character.'));
  assert.ok(out[0].content.includes('I did.'));
});

test('empty messages are dropped rather than leaving blank gaps', () => {
  const out = postProcess([sys('s'), usr('   '), bot('hi')], 'single');
  assert.equal(out[0].content, 's\n\nhi');
});

test('every format survives an empty prompt', () => {
  for (const format of ['none', 'merge', 'semi', 'strict', 'single'] as const) {
    assert.doesNotThrow(() => postProcess([], format), format);
    assert.deepEqual(postProcess([], format), [], format);
  }
});

test('no format ever loses the text of a message', () => {
  for (const format of ['merge', 'semi', 'strict', 'single'] as const) {
    const joined = postProcess(realistic, format)
      .map((m) => m.content)
      .join('\n');
    for (const original of realistic) {
      assert.ok(joined.includes(original.content), `${format} dropped: ${original.content}`);
    }
  }
});

test('the transforms do not mutate what they were given', () => {
  const input = [sys('a'), sys('b'), usr('c')];
  const copy = structuredClone(input);
  postProcess(input, 'strict');
  assert.deepEqual(input, copy);
});
