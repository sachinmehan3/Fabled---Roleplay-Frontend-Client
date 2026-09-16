import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CharacterCard } from '../server/cards.ts';
import type { GenerationMeta } from '../server/store.ts';

// store.ts reads RP_DATA_DIR when it is first imported, so point it somewhere
// disposable before importing it.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fabled-test-'));
process.env.RP_DATA_DIR = dir;
const store = await import('../server/store.ts');

after(() => fs.rmSync(dir, { recursive: true, force: true }));

const card = (name: string): CharacterCard => ({
  name,
  description: '',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: [],
  creator_notes: '',
  creator: '',
  tags: [],
});

const meta = (over: Partial<GenerationMeta> = {}): GenerationMeta => ({
  status: 'ok',
  createdAt: Date.now(),
  provider: 'http://127.0.0.1/v1',
  modelRequested: 'test-model',
  temperature: 1,
  maxTokens: 100,
  contextSize: 4096,
  thinkingLevel: 'default',
  systemSource: 'default',
  usedOriginalMacro: false,
  hasPostHistory: false,
  historyTotal: 1,
  historySent: 1,
  historyBudget: 3000,
  estimatedPromptTokens: 50,
  outputChars: 10,
  estimatedCompletionTokens: 5,
  msTotal: 200,
  ...over,
});

test('settings start from the defaults and merge on save', () => {
  assert.equal(store.getSettings().userName, store.DEFAULT_SETTINGS.userName);
  store.saveSettings({ userName: 'Kai', temperature: 0.5 });
  const saved = store.getSettings();
  assert.equal(saved.userName, 'Kai');
  assert.equal(saved.temperature, 0.5);
  assert.equal(saved.model, store.DEFAULT_SETTINGS.model, 'untouched fields keep their default');
});

test('settings of the wrong type are refused', () => {
  store.saveSettings({ temperature: 'hot' as unknown as number });
  assert.equal(store.getSettings().temperature, 0.5, 'the good value survives');
});

test('unknown settings keys are not stored', () => {
  store.saveSettings({ nonsense: true } as never);
  assert.ok(!('nonsense' in store.getSettings()));
});

test('characters round-trip, and ids are never reused', () => {
  const a = store.insertCharacter('Lyra', card('Lyra'));
  const b = store.insertCharacter('Callie', card('Callie'));
  assert.notEqual(a.id, b.id);
  assert.equal(store.getCharacter(a.id)?.name, 'Lyra');
  assert.deepEqual(
    store.listCharacters().map((c) => c.name),
    ['Callie', 'Lyra'],
    'listed by name, case-insensitively',
  );
});

test('a character update keeps the rest of the row', () => {
  const c = store.insertCharacter('Edit me', card('Edit me'));
  store.updateCharacter(c.id, { avatar: 'pic.png' });
  const after = store.getCharacter(c.id)!;
  assert.equal(after.avatar, 'pic.png');
  assert.equal(after.created_at, c.created_at);
});

test('messages append to the chat log and come back in order', () => {
  const c = store.insertCharacter('Chatty', card('Chatty'));
  const chat = store.insertChat(c.id, 'A chat');
  store.insertMessage(chat.id, 'assistant', ['Greeting.']);
  store.insertMessage(chat.id, 'user', ['Hello.']);

  const messages = store.listMessages(chat.id);
  assert.deepEqual(
    messages.map((m) => m.role),
    ['assistant', 'user'],
  );
  assert.equal(store.getChat(chat.id)?.message_count, 2);
});

test('a record is kept per swipe, with the prompt in the sidecar file', () => {
  const c = store.insertCharacter('Recorded', card('Recorded'));
  const chat = store.insertChat(c.id, 'A chat');
  const prompt = [{ role: 'system' as const, content: 'You are Recorded.' }];
  const msg = store.insertMessage(chat.id, 'assistant', ['First reply.'], [meta({ prompt })]);

  // The log stays small: the prompt is not in it.
  const line = fs.readFileSync(path.join(dir, 'chats', `${chat.id}.jsonl`), 'utf8');
  assert.ok(!line.includes('You are Recorded.'), 'the prompt must not be in the chat log');
  assert.equal(store.getMessage(msg.id)?.meta[0]?.status, 'ok');
  assert.deepEqual(store.getRecord(chat.id, msg.id, 0)?.prompt, prompt);
});

test('a second swipe gets its own record and prompt', () => {
  const c = store.insertCharacter('Swiper', card('Swiper'));
  const chat = store.insertChat(c.id, 'A chat');
  const first = [{ role: 'system' as const, content: 'first prompt' }];
  const msg = store.insertMessage(chat.id, 'assistant', ['One.'], [meta({ prompt: first })]);

  const second = [{ role: 'system' as const, content: 'second prompt' }];
  store.saveSwipes(msg.id, ['One.', 'Two.'], [meta({ prompt: first }), meta({ status: 'stopped', prompt: second })], 1);

  const saved = store.getMessage(msg.id)!;
  assert.deepEqual(saved.swipes, ['One.', 'Two.']);
  assert.equal(saved.swipe_index, 1);
  assert.equal(saved.meta[1]?.status, 'stopped');
  assert.deepEqual(store.getRecord(chat.id, msg.id, 1)?.prompt, second);
});

test('reasoning is kept beside the log, not inside it', () => {
  const c = store.insertCharacter('Thinker', card('Thinker'));
  const chat = store.insertChat(c.id, 'A chat');
  const msg = store.insertMessage(
    chat.id,
    'assistant',
    ['The answer.'],
    [meta({ reasoning: 'First I considered the map.', reasoningChars: 27 })],
  );

  const line = fs.readFileSync(path.join(dir, 'chats', `${chat.id}.jsonl`), 'utf8');
  assert.ok(!line.includes('First I considered'), 'thinking must not bloat the chat log');
  assert.equal(store.getMessage(msg.id)?.meta[0]?.reasoningChars, 27, 'but its size stays, so the UI knows');
  assert.equal(store.getRecord(chat.id, msg.id, 0)?.reasoning, 'First I considered the map.');
});

test('records stay aligned with swipes when a message has none', () => {
  const c = store.insertCharacter('Greeter', card('Greeter'));
  const chat = store.insertChat(c.id, 'A chat');
  const msg = store.insertMessage(chat.id, 'assistant', ['Hi.', 'Hello.', 'Hey.']);
  assert.deepEqual(store.getMessage(msg.id)?.meta, [null, null, null]);
});

test('deleting a message prunes its prompts and updates the count', () => {
  const c = store.insertCharacter('Deleter', card('Deleter'));
  const chat = store.insertChat(c.id, 'A chat');
  const keep = store.insertMessage(chat.id, 'user', ['Keep me.']);
  const drop = store.insertMessage(chat.id, 'assistant', ['Drop me.'], [meta({ prompt: [{ role: 'system', content: 'gone' }] })]);

  store.deleteMessage(drop.id);
  assert.equal(store.getMessage(drop.id), undefined);
  assert.equal(store.getMessage(keep.id)?.swipes[0], 'Keep me.');
  assert.equal(store.getChat(chat.id)?.message_count, 1);
  assert.equal(store.getRecord(chat.id, drop.id, 0), undefined);
});

test('deleting many messages at once takes their prompts with them', () => {
  const c = store.insertCharacter('Bulk', card('Bulk'));
  const chat = store.insertChat(c.id, 'A chat');
  const keep = store.insertMessage(chat.id, 'assistant', ['Greeting.']);
  const a = store.insertMessage(chat.id, 'user', ['One.'], [meta({ prompt: [{ role: 'system', content: 'p1' }] })]);
  const b = store.insertMessage(chat.id, 'assistant', ['Two.'], [meta({ prompt: [{ role: 'system', content: 'p2' }] })]);
  const d = store.insertMessage(chat.id, 'user', ['Three.']);

  assert.equal(store.deleteMessages(chat.id, [a.id, b.id, d.id]), 3);
  assert.deepEqual(
    store.listMessages(chat.id).map((m) => m.id),
    [keep.id],
    'only the greeting is left',
  );
  assert.equal(store.getChat(chat.id)?.message_count, 1);
  assert.equal(store.getRecord(chat.id, a.id, 0), undefined, 'their prompts went too');
  assert.equal(store.getRecord(chat.id, b.id, 0), undefined);
});

test('deleting an empty or unknown set changes nothing', () => {
  const c = store.insertCharacter('Untouched', card('Untouched'));
  const chat = store.insertChat(c.id, 'A chat');
  store.insertMessage(chat.id, 'user', ['Still here.']);

  assert.equal(store.deleteMessages(chat.id, []), 0);
  assert.equal(store.deleteMessages(chat.id, [99999]), 0);
  assert.equal(store.listMessages(chat.id).length, 1);
  assert.equal(store.getChat(chat.id)?.message_count, 1);
});

test('deleting a character takes its chats and their files with it', () => {
  const c = store.insertCharacter('Doomed', card('Doomed'));
  const chat = store.insertChat(c.id, 'A chat');
  store.insertMessage(chat.id, 'user', ['Hello.']);
  const file = path.join(dir, 'chats', `${chat.id}.jsonl`);
  assert.ok(fs.existsSync(file));

  store.deleteCharacter(c.id);
  assert.equal(store.getCharacter(c.id), undefined);
  assert.equal(store.getChat(chat.id), undefined);
  assert.ok(!fs.existsSync(file), 'the chat log should be gone too');
});

test('a torn line is skipped instead of losing the whole chat', () => {
  const c = store.insertCharacter('Torn', card('Torn'));
  const chat = store.insertChat(c.id, 'A chat');
  store.insertMessage(chat.id, 'user', ['Good line.']);
  const file = path.join(dir, 'chats', `${chat.id}.jsonl`);
  fs.appendFileSync(file, '{"id":999,"chat_id":1,"role":"user","swipes":["hal\n');

  const messages = store.listMessages(chat.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].swipes[0], 'Good line.');
});

test('a message can be found by id alone, across chats', () => {
  const c = store.insertCharacter('Finder', card('Finder'));
  const one = store.insertChat(c.id, 'One');
  const two = store.insertChat(c.id, 'Two');
  store.insertMessage(one.id, 'user', ['In chat one.']);
  const target = store.insertMessage(two.id, 'user', ['In chat two.']);

  assert.equal(store.getMessage(target.id)?.chat_id, two.id);
});
