import 'fake-indexeddb/auto';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { CharacterCard, GenerationMeta } from '../web/types.ts';
import * as store from '../web/core/db.ts';

after(() => store.resetDatabase());

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

test('settings start from the defaults and merge on save', async () => {
  assert.equal((await store.getSettings()).userName, store.DEFAULT_SETTINGS.userName);
  await store.saveSettings({ userName: 'Kai', temperature: 0.5 });
  const saved = await store.getSettings();
  assert.equal(saved.userName, 'Kai');
  assert.equal(saved.temperature, 0.5);
  assert.equal(saved.model, store.DEFAULT_SETTINGS.model, 'untouched fields keep their default');
});

test('settings of the wrong type are refused', async () => {
  await store.saveSettings({ temperature: 'hot' as unknown as number });
  assert.equal((await store.getSettings()).temperature, 0.5, 'the good value survives');
});

test('unknown settings keys are not stored', async () => {
  await store.saveSettings({ nonsense: true } as never);
  assert.ok(!('nonsense' in await store.getSettings()));
});

test('characters round-trip, and ids are never reused', async () => {
  const a = await store.insertCharacter('Lyra', card('Lyra'));
  const b = await store.insertCharacter('Callie', card('Callie'));
  assert.notEqual(a.id, b.id);
  assert.equal((await store.getCharacter(a.id))?.name, 'Lyra');
  assert.deepEqual(
    (await store.listCharacters()).map((c) => c.name),
    ['Callie', 'Lyra'],
    'listed by name, case-insensitively',
  );
});

test('a character update keeps the rest of the row', async () => {
  const c = await store.insertCharacter('Edit me', card('Edit me'));
  await store.updateCharacter(c.id, { avatar: 'pic.png' });
  const after = (await store.getCharacter(c.id))!;
  assert.equal(after.avatar, 'pic.png');
  assert.equal(after.created_at, c.created_at);
});

test('messages append to the chat log and come back in order', async () => {
  const c = await store.insertCharacter('Chatty', card('Chatty'));
  const chat = await store.insertChat(c.id, 'A chat');
  await store.insertMessage(chat.id, 'assistant', ['Greeting.']);
  await store.insertMessage(chat.id, 'user', ['Hello.']);

  const messages = await store.listMessages(chat.id);
  assert.deepEqual(
    messages.map((m) => m.role),
    ['assistant', 'user'],
  );
  assert.equal((await store.getChat(chat.id))?.message_count, 2);
});

test('a record is kept per swipe, with the prompt kept apart', async () => {
  const c = await store.insertCharacter('Recorded', card('Recorded'));
  const chat = await store.insertChat(c.id, 'A chat');
  const prompt = [{ role: 'system' as const, content: 'You are Recorded.' }];
  const msg = await store.insertMessage(chat.id, 'assistant', ['First reply.'], [meta({ prompt })]);

  // The message stays small: the prompt is not on it.
  assert.ok(!JSON.stringify(await store.getMessage(msg.id)).includes('You are Recorded.'));
  assert.equal((await store.getMessage(msg.id))?.meta[0]?.status, 'ok');
  assert.deepEqual((await store.getRecord(msg.id, 0))?.prompt, prompt);
});

test('a second swipe gets its own record and prompt', async () => {
  const c = await store.insertCharacter('Swiper', card('Swiper'));
  const chat = await store.insertChat(c.id, 'A chat');
  const first = [{ role: 'system' as const, content: 'first prompt' }];
  const msg = await store.insertMessage(chat.id, 'assistant', ['One.'], [meta({ prompt: first })]);

  const second = [{ role: 'system' as const, content: 'second prompt' }];
  await store.saveSwipes(msg.id, ['One.', 'Two.'], [meta({ prompt: first }), meta({ status: 'stopped', prompt: second })], 1);

  const saved = (await store.getMessage(msg.id))!;
  assert.deepEqual(saved.swipes, ['One.', 'Two.']);
  assert.equal(saved.swipe_index, 1);
  assert.equal(saved.meta[1]?.status, 'stopped');
  assert.deepEqual((await store.getRecord(msg.id, 1))?.prompt, second);
});

test('reasoning is kept beside the log, not inside it', async () => {
  const c = await store.insertCharacter('Thinker', card('Thinker'));
  const chat = await store.insertChat(c.id, 'A chat');
  const msg = await store.insertMessage(
    chat.id,
    'assistant',
    ['The answer.'],
    [meta({ reasoning: 'First I considered the map.', reasoningChars: 27 })],
  );

  assert.ok(!JSON.stringify(await store.getMessage(msg.id)).includes('First I considered'), 'thinking must not bloat the message');
  assert.equal((await store.getMessage(msg.id))?.meta[0]?.reasoningChars, 27, 'but its size stays, so the UI knows');
  assert.equal((await store.getRecord(msg.id, 0))?.reasoning, 'First I considered the map.');
});

test('records stay aligned with swipes when a message has none', async () => {
  const c = await store.insertCharacter('Greeter', card('Greeter'));
  const chat = await store.insertChat(c.id, 'A chat');
  const msg = await store.insertMessage(chat.id, 'assistant', ['Hi.', 'Hello.', 'Hey.']);
  assert.deepEqual((await store.getMessage(msg.id))?.meta, [null, null, null]);
});

test('deleting a message prunes its prompts and updates the count', async () => {
  const c = await store.insertCharacter('Deleter', card('Deleter'));
  const chat = await store.insertChat(c.id, 'A chat');
  const keep = await store.insertMessage(chat.id, 'user', ['Keep me.']);
  const drop = await store.insertMessage(chat.id, 'assistant', ['Drop me.'], [meta({ prompt: [{ role: 'system', content: 'gone' }] })]);

  await store.deleteMessage(drop.id);
  assert.equal(await store.getMessage(drop.id), undefined);
  assert.equal((await store.getMessage(keep.id))?.swipes[0], 'Keep me.');
  assert.equal((await store.getChat(chat.id))?.message_count, 1);
  assert.equal(await store.getRecord(drop.id, 0), undefined);
});

test('deleting many messages at once takes their prompts with them', async () => {
  const c = await store.insertCharacter('Bulk', card('Bulk'));
  const chat = await store.insertChat(c.id, 'A chat');
  const keep = await store.insertMessage(chat.id, 'assistant', ['Greeting.']);
  const a = await store.insertMessage(chat.id, 'user', ['One.'], [meta({ prompt: [{ role: 'system', content: 'p1' }] })]);
  const b = await store.insertMessage(chat.id, 'assistant', ['Two.'], [meta({ prompt: [{ role: 'system', content: 'p2' }] })]);
  const d = await store.insertMessage(chat.id, 'user', ['Three.']);

  assert.equal(await store.deleteMessages(chat.id, [a.id, b.id, d.id]), 3);
  assert.deepEqual(
    (await store.listMessages(chat.id)).map((m) => m.id),
    [keep.id],
    'only the greeting is left',
  );
  assert.equal((await store.getChat(chat.id))?.message_count, 1);
  assert.equal(await store.getRecord(a.id, 0), undefined, 'their prompts went too');
  assert.equal(await store.getRecord(b.id, 0), undefined);
});

test('deleting an empty or unknown set changes nothing', async () => {
  const c = await store.insertCharacter('Untouched', card('Untouched'));
  const chat = await store.insertChat(c.id, 'A chat');
  await store.insertMessage(chat.id, 'user', ['Still here.']);

  assert.equal(await store.deleteMessages(chat.id, []), 0);
  assert.equal(await store.deleteMessages(chat.id, [99999]), 0);
  assert.equal((await store.listMessages(chat.id)).length, 1);
  assert.equal((await store.getChat(chat.id))?.message_count, 1);
});

test('deleting a character takes its chats and their messages with it', async () => {
  const c = await store.insertCharacter('Doomed', card('Doomed'));
  const chat = await store.insertChat(c.id, 'A chat');
  const msg = await store.insertMessage(chat.id, 'assistant', ['Hello.'], [meta({ prompt: [{ role: 'system', content: 'p' }] })]);
  await store.saveMemory(chat.id, { ...store.EMPTY_MEMORY, summary: 'They met.' });

  await store.deleteCharacter(c.id);
  assert.equal(await store.getCharacter(c.id), undefined);
  assert.equal(await store.getChat(chat.id), undefined);
  assert.equal(await store.getMessage(msg.id), undefined, 'the messages should be gone too');
  assert.equal(await store.getRecord(msg.id, 0), undefined);
  assert.equal((await store.getMemory(chat.id)).summary, '');
});

test('a message can be found by id alone, across chats', async () => {
  const c = await store.insertCharacter('Finder', card('Finder'));
  const one = await store.insertChat(c.id, 'One');
  const two = await store.insertChat(c.id, 'Two');
  await store.insertMessage(one.id, 'user', ['In chat one.']);
  const target = await store.insertMessage(two.id, 'user', ['In chat two.']);

  assert.equal((await store.getMessage(target.id))?.chat_id, two.id);
});

test('message counts and chat counts come from what is stored', async () => {
  const c = await store.insertCharacter('Counted', card('Counted'));
  const one = await store.insertChat(c.id, 'One');
  await store.insertChat(c.id, 'Two');
  await store.insertMessage(one.id, 'user', ['a']);
  const counts = await store.chatCounts();
  assert.equal(counts[c.id], 2);
  const chats = await store.listChats(c.id);
  assert.deepEqual(chats.map((x) => x.title), ['Two', 'One'], 'newest first');
  assert.equal(chats[1].message_count, 1);
});

test('fewer swipes drop the records of the ones that are gone', async () => {
  const c = await store.insertCharacter('Trim', card('Trim'));
  const chat = await store.insertChat(c.id, 'A chat');
  const p = (content: string) => [{ role: 'system' as const, content }];
  const msg = await store.insertMessage(chat.id, 'assistant', ['A', 'B'], [meta({ prompt: p('a') }), meta({ prompt: p('b') })]);
  await store.saveSwipes(msg.id, ['C'], [meta({ prompt: p('c') })], 0);
  assert.deepEqual((await store.getRecord(msg.id, 0))?.prompt, p('c'));
  assert.equal(await store.getRecord(msg.id, 1), undefined);
});

test('images are stored and read back byte for byte', async () => {
  const id = await store.putImage(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  const blob = (await store.getImage(id))!;
  assert.equal(blob.type, 'image/png');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
  await store.deleteImage(id);
  assert.equal(await store.getImage(id), undefined);
});

test('a backup leaves out the API key unless asked', async () => {
  await store.saveSettings({ apiKey: 'sk-secret-123' });
  const plain = await store.exportBackup();
  assert.ok(!JSON.stringify(plain).includes('sk-secret-123'));
  const withKey = await store.exportBackup({ includeApiKey: true });
  assert.equal(withKey.settings.apiKey, 'sk-secret-123');
});

test('a backup restores everything, and replaces what was there', async () => {
  const c = await store.insertCharacter('Saved', card('Saved'), await store.putImage(new Blob(['png'])));
  const chat = await store.insertChat(c.id, 'Kept chat');
  const msg = await store.insertMessage(chat.id, 'assistant', ['Hi.'], [meta({ reasoning: 'hmm' })]);
  await store.saveMemory(chat.id, { ...store.EMPTY_MEMORY, summary: 'Remembered.' });
  await store.insertLorebook({
    name: 'World', enabled: true, characterIds: [c.id], scanDepth: 2, caseSensitive: false,
    matchWholeWords: true, maxRecursionSteps: 0, budget: 0, entries: [],
  });
  const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
  const before = await store.listCharacters();

  await store.resetDatabase();
  await store.insertCharacter('Stray', card('Stray'));
  await store.saveSettings({ apiKey: 'sk-this-browser' });
  await store.importBackup(backup);

  const after = await store.listCharacters();
  assert.deepEqual(after, before, 'the same characters, ids and all');
  assert.equal((await store.getMessage(msg.id))?.swipes[0], 'Hi.');
  assert.equal((await store.getRecord(msg.id, 0))?.reasoning, 'hmm');
  assert.equal((await store.getMemory(chat.id)).summary, 'Remembered.');
  assert.equal((await store.listLorebooks())[0].name, 'World');
  assert.ok(await store.getImage(c.avatar!), 'pictures come back too');
  assert.equal((await store.getSettings()).apiKey, 'sk-this-browser', 'a backup without a key keeps this one');

  // New rows carry on after the restored ids.
  const next = await store.insertCharacter('After', card('After'));
  assert.ok(next.id > Math.max(...before.map((b) => b.id)));
});

test('something that is not a backup is refused', async () => {
  await assert.rejects(() => store.importBackup({ hello: 1 }), /not a Fabled backup/);
});
