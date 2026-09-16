// Storage: plain files, no database.
//
//   data/settings.json          one object
//   data/characters.json        array of characters
//   data/chats.json             array of chat headers
//   data/counters.json          the next id for each kind
//   data/chats/<id>.jsonl       one message per line - the chat log
//   data/chats/<id>.prompts.jsonl   one prompt per line, appended and never rewritten
//   data/avatars/               pictures
//
// Prompts live beside the log rather than inside it: they are by far the largest
// thing we keep, and the log is rewritten whenever a message is edited or swiped.
import fs from 'node:fs';
import path from 'node:path';
import type { CharacterCard } from './cards.ts';
import type { Lorebook, LoreState } from './lorebook.ts';
import type { PromptFormat } from './post-process.ts';

export const DATA_DIR = path.resolve(process.env.RP_DATA_DIR ?? 'data');
export const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
export const CHAT_DIR = path.join(DATA_DIR, 'chats');
fs.mkdirSync(AVATAR_DIR, { recursive: true });
fs.mkdirSync(CHAT_DIR, { recursive: true });

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');
const chatFile = (chatId: number) => path.join(CHAT_DIR, `${chatId}.jsonl`);
const memoryFile = (chatId: number) => path.join(CHAT_DIR, `${chatId}.memory.json`);
const loreFile = (chatId: number) => path.join(CHAT_DIR, `${chatId}.lore.json`);
const LOREBOOKS_FILE = path.join(DATA_DIR, 'lorebooks.json');
const promptFile = (chatId: number) => path.join(CHAT_DIR, `${chatId}.prompts.jsonl`);

// ---------- file helpers ----------

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback; // missing or corrupt: start from the default rather than crash
  }
}

/** Write through a temp file so a crash can never leave a half-written file behind. */
function writeFileAtomic(file: string, text: string) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const writeJson = (file: string, value: unknown) => writeFileAtomic(file, JSON.stringify(value, null, 2));

function readJsonl<T>(file: string): T[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Skip a torn line rather than lose the whole chat.
    }
  }
  return out;
}

const appendJsonl = (file: string, row: unknown) => fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
const writeJsonl = (file: string, rows: unknown[]) =>
  writeFileAtomic(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));

/** Count lines without parsing them. */
function countLines(file: string): number {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

// ---------- ids ----------

interface Counters {
  character: number;
  chat: number;
  message: number;
  lorebook: number;
}

function nextId(kind: keyof Counters): number {
  const c = readJson<Counters>(COUNTERS_FILE, { character: 0, chat: 0, message: 0, lorebook: 0 });
  const id = (c[kind] ?? 0) + 1;
  writeJson(COUNTERS_FILE, { ...c, [kind]: id });
  return id;
}

// ---------- settings ----------

/** How hard a reasoning model should think. 'default' sends nothing at all. */
export type ThinkingLevel = 'default' | 'low' | 'medium' | 'high';

export interface Settings {
  apiBase: string;
  apiKey: string;
  model: string;
  userName: string;
  userDescription: string;
  userAvatar: string; // file name in data/avatars
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  contextSize: number;
  thinkingLevel: ThinkingLevel;
  /** Reshapes the finished prompt for backends that demand a particular order. */
  promptFormat: PromptFormat;
  /** Context tokens set aside for chat memory. 0 turns memory off entirely. */
  memoryTokens: number;
  /** Draw a panel behind every message, rather than plain text on the page. */
  messageBubbles: boolean;
  chatBackground: string; // file name in data/avatars
  chatBackgroundDim: number; // 0-100, how far it fades into the page colour
}

export const DEFAULT_SETTINGS: Settings = {
  apiBase: 'http://127.0.0.1:11434/v1', // Ollama default; change to OpenRouter etc.
  apiKey: '',
  model: '',
  userName: 'User',
  userDescription: '',
  userAvatar: '',
  systemPrompt:
    "You are {{char}} in an ongoing roleplay with {{user}}. Stay in character, write vivid prose, and never speak or act for {{user}}.",
  temperature: 0.9,
  maxTokens: 400,
  contextSize: 8192,
  thinkingLevel: 'default',
  promptFormat: 'none',
  memoryTokens: 800,
  messageBubbles: true,
  chatBackground: '',
  chatBackgroundDim: 60,
};

export function getSettings(): Settings {
  const saved = readJson<Partial<Settings>>(SETTINGS_FILE, {});
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(saved)) {
    if (k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k as keyof Settings]) out[k] = v;
  }
  return out as unknown as Settings;
}

export function saveSettings(patch: Partial<Settings>) {
  const current = getSettings() as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS) || v === undefined) continue;
    if (typeof v !== typeof DEFAULT_SETTINGS[k as keyof Settings]) continue;
    current[k] = v;
  }
  writeJson(SETTINGS_FILE, current);
}

// ---------- characters ----------

export interface CharacterRow {
  id: number;
  name: string;
  avatar: string | null;
  card: CharacterCard;
  created_at: number;
}

const allCharacters = () => readJson<CharacterRow[]>(CHARACTERS_FILE, []);
const saveCharacters = (rows: CharacterRow[]) => writeJson(CHARACTERS_FILE, rows);

export function listCharacters(): CharacterRow[] {
  return allCharacters().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function getCharacter(id: number): CharacterRow | undefined {
  return allCharacters().find((c) => c.id === id);
}

export function insertCharacter(name: string, card: CharacterCard, createdAt = Date.now()): CharacterRow {
  const row: CharacterRow = { id: nextId('character'), name, avatar: null, card, created_at: createdAt };
  saveCharacters([...allCharacters(), row]);
  return row;
}

export function updateCharacter(id: number, patch: Partial<Omit<CharacterRow, 'id'>>): CharacterRow | undefined {
  const rows = allCharacters();
  const row = rows.find((c) => c.id === id);
  if (!row) return undefined;
  Object.assign(row, patch);
  saveCharacters(rows);
  return row;
}

export function deleteCharacter(id: number) {
  saveCharacters(allCharacters().filter((c) => c.id !== id));
  for (const chat of listChats(id)) deleteChat(chat.id); // no foreign keys here: cascade by hand
}

// ---------- chats ----------

export interface ChatRow {
  id: number;
  character_id: number;
  title: string;
  created_at: number;
  message_count: number;
  /** The chat this one was split off from, if it was. */
  branched_from?: number;
}

const allChats = () => readJson<ChatRow[]>(CHATS_FILE, []);
const saveChats = (rows: ChatRow[]) => writeJson(CHATS_FILE, rows);

/** Chats for one character, newest first. */
export function listChats(characterId: number): ChatRow[] {
  const rows = allChats();
  let dirty = false;
  for (const row of rows) {
    if (typeof row.message_count !== 'number') {
      row.message_count = countLines(chatFile(row.id)); // heal a count written before this field existed
      dirty = true;
    }
  }
  if (dirty) saveChats(rows);
  return rows.filter((c) => c.character_id === characterId).sort((a, b) => b.id - a.id);
}

export function getChat(id: number): ChatRow | undefined {
  return allChats().find((c) => c.id === id);
}

export function updateChat(id: number, patch: Partial<Omit<ChatRow, 'id'>>): ChatRow | undefined {
  const rows = allChats();
  const row = rows.find((c) => c.id === id);
  if (!row) return undefined;
  Object.assign(row, patch);
  saveChats(rows);
  return row;
}

export function insertChat(
  characterId: number,
  title: string,
  createdAt = Date.now(),
  branchedFrom?: number,
): ChatRow {
  const row: ChatRow = {
    id: nextId('chat'),
    character_id: characterId,
    title,
    created_at: createdAt,
    message_count: 0,
    ...(branchedFrom ? { branched_from: branchedFrom } : {}),
  };
  saveChats([...allChats(), row]);
  return row;
}

export function deleteChat(id: number) {
  saveChats(allChats().filter((c) => c.id !== id));
  fs.rmSync(chatFile(id), { force: true });
  fs.rmSync(promptFile(id), { force: true });
  fs.rmSync(memoryFile(id), { force: true });
  fs.rmSync(loreFile(id), { force: true });
}

// ---------- chat memory ----------

/** What a chat remembers once its older messages have left the context window. */
export interface ChatMemory {
  version: 1;
  summary: string;
  /** Memory covers every message up to and including this id. */
  coveredThrough: number;
  folds: number;
  updatedAt: number;
}

export const EMPTY_MEMORY: ChatMemory = { version: 1, summary: '', coveredThrough: 0, folds: 0, updatedAt: 0 };

/** Built field by field, so anything stale in an older file is dropped on the next save. */
export function getMemory(chatId: number): ChatMemory {
  const saved = readJson<Partial<ChatMemory>>(memoryFile(chatId), {});
  return {
    version: 1,
    summary: typeof saved.summary === 'string' ? saved.summary : '',
    coveredThrough: typeof saved.coveredThrough === 'number' ? saved.coveredThrough : 0,
    folds: typeof saved.folds === 'number' ? saved.folds : 0,
    updatedAt: typeof saved.updatedAt === 'number' ? saved.updatedAt : 0,
  };
}

export function saveMemory(chatId: number, memory: ChatMemory) {
  writeJson(memoryFile(chatId), { ...memory, version: 1, updatedAt: Date.now() });
}

export function clearMemory(chatId: number): ChatMemory {
  saveMemory(chatId, EMPTY_MEMORY);
  return getMemory(chatId);
}

// ---------- lorebooks ----------

const allLorebooks = () => readJson<Lorebook[]>(LOREBOOKS_FILE, []);
const saveLorebooks = (rows: Lorebook[]) => writeJson(LOREBOOKS_FILE, rows);

export function listLorebooks(): Lorebook[] {
  return allLorebooks().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function getLorebook(id: number): Lorebook | undefined {
  return allLorebooks().find((b) => b.id === id);
}

export function insertLorebook(book: Omit<Lorebook, 'id' | 'created_at'>): Lorebook {
  const row: Lorebook = { ...book, id: nextId('lorebook'), created_at: Date.now() };
  saveLorebooks([...allLorebooks(), row]);
  return row;
}

export function updateLorebook(id: number, patch: Partial<Omit<Lorebook, 'id'>>): Lorebook | undefined {
  const rows = allLorebooks();
  const row = rows.find((b) => b.id === id);
  if (!row) return undefined;
  Object.assign(row, patch);
  saveLorebooks(rows);
  return row;
}

export function deleteLorebook(id: number) {
  saveLorebooks(allLorebooks().filter((b) => b.id !== id));
}

/** Timed lorebook state for one chat: which entries are sticky or cooling down. */
export function getLoreState(chatId: number): LoreState {
  const saved = readJson<LoreState>(loreFile(chatId), {});
  return saved && typeof saved === 'object' ? saved : {};
}

export function saveLoreState(chatId: number, state: LoreState) {
  writeJson(loreFile(chatId), state);
}

function bumpCount(chatId: number, delta: number) {
  const rows = allChats();
  const row = rows.find((c) => c.id === chatId);
  if (!row) return;
  row.message_count = Math.max(0, (row.message_count ?? 0) + delta);
  saveChats(rows);
}

// ---------- generation records ----------

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** What happened when one reply was generated. Stored per swipe, alongside the text. */
export interface GenerationMeta {
  status: 'ok' | 'stopped' | 'error';
  error?: string;
  createdAt: number;
  edited?: boolean; // the text was changed by hand after it was generated

  // Request
  provider: string;
  modelRequested: string;
  modelReported?: string;
  temperature: number;
  maxTokens: number;
  contextSize: number;
  thinkingLevel: ThinkingLevel;
  /** The provider refused the optional fields, so they were sent without them. */
  extrasDropped?: boolean;
  promptFormat?: PromptFormat;
  memoryTokens?: number;
  loreTokens?: number;
  loreEntries?: number;
  /** Titles of the entries that made it in, for the details panel. */
  loreTitles?: string[];

  // Bulky fields: these live in <chat>.prompts.jsonl, not in the chat log.
  prompt?: PromptMessage[];
  reasoning?: string;
  systemSource: 'card' | 'default';
  usedOriginalMacro: boolean;
  hasPostHistory: boolean;
  historyTotal: number;
  historySent: number;
  historyBudget: number;
  estimatedPromptTokens: number;

  // Response
  finishReason?: string;
  usage?: TokenUsage;
  outputChars: number;
  /** How much the model thought before answering; 0 when it did not, or did not say. */
  reasoningChars?: number;
  estimatedCompletionTokens: number;
  msToFirstToken?: number;
  msTotal: number;
}

interface RecordLine {
  message_id: number;
  swipe: number;
  prompt?: PromptMessage[];
  reasoning?: string;
}

/** The prompt and reasoning behind one swipe, or undefined if nothing was kept. */
export function getRecord(chatId: number, messageId: number, swipe: number): Omit<RecordLine, 'message_id' | 'swipe'> | undefined {
  const lines = readJsonl<RecordLine>(promptFile(chatId));
  // Read backwards: the newest line for a swipe wins.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].message_id === messageId && lines[i].swipe === swipe) {
      return { prompt: lines[i].prompt, reasoning: lines[i].reasoning };
    }
  }
  return undefined;
}

function saveRecord(chatId: number, messageId: number, swipe: number, meta: GenerationMeta) {
  if (!meta.prompt && !meta.reasoning) return;
  appendJsonl(promptFile(chatId), {
    message_id: messageId,
    swipe,
    prompt: meta.prompt,
    reasoning: meta.reasoning,
  } satisfies RecordLine);
}

function dropRecords(chatId: number, messageId: number) {
  const file = promptFile(chatId);
  if (!fs.existsSync(file)) return;
  const kept = readJsonl<RecordLine>(file).filter((l) => l.message_id !== messageId);
  writeJsonl(file, kept);
}

// ---------- messages ----------

export interface MessageRow {
  id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  swipes: string[];
  meta: (GenerationMeta | null)[];
  swipe_index: number;
  created_at: number;
}

/** Remembers which chat a message id belongs to, so /api/messages/:id stays a cheap lookup. */
const chatOfMessage = new Map<number, number>();

function alignMeta(row: MessageRow): MessageRow {
  const meta = Array.isArray(row.meta) ? row.meta : [];
  return { ...row, meta: row.swipes.map((_, i) => meta[i] ?? null) };
}

export function listMessages(chatId: number): MessageRow[] {
  const rows = readJsonl<MessageRow>(chatFile(chatId));
  for (const r of rows) chatOfMessage.set(r.id, chatId);
  return rows.map(alignMeta);
}

function findChatOf(messageId: number): number | undefined {
  const known = chatOfMessage.get(messageId);
  if (known !== undefined) return known;
  for (const chat of allChats()) {
    listMessages(chat.id); // fills the cache
    const found = chatOfMessage.get(messageId);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function getMessage(id: number): MessageRow | undefined {
  const chatId = findChatOf(id);
  if (chatId === undefined) return undefined;
  return listMessages(chatId).find((m) => m.id === id);
}

export function insertMessage(
  chatId: number,
  role: 'user' | 'assistant',
  swipes: string[],
  meta: (GenerationMeta | null)[] = [],
  createdAt = Date.now(),
  swipeIndex = 0,
): MessageRow {
  const row: MessageRow = {
    id: nextId('message'),
    chat_id: chatId,
    role,
    swipes,
    meta: swipes.map((_, i) => withoutBulk(meta[i])),
    swipe_index: Math.min(Math.max(0, swipeIndex), Math.max(0, swipes.length - 1)),
    created_at: createdAt,
  };
  appendJsonl(chatFile(chatId), row);
  chatOfMessage.set(row.id, chatId);
  bumpCount(chatId, 1);
  // These could only be written once the message had an id.
  meta.forEach((m, i) => m && saveRecord(chatId, row.id, i, m));
  return alignMeta(row);
}

/** The record as it is kept in the log: everything except the bulky fields. */
function withoutBulk(meta: GenerationMeta | null | undefined): GenerationMeta | null {
  if (!meta) return null;
  const { prompt: _prompt, reasoning: _reasoning, ...rest } = meta;
  return rest;
}

/** Replace a message's texts and records. */
export function saveSwipes(id: number, swipes: string[], meta: (GenerationMeta | null)[], swipeIndex: number) {
  const chatId = findChatOf(id);
  if (chatId === undefined) return;
  const rows = readJsonl<MessageRow>(chatFile(chatId));
  const row = rows.find((m) => m.id === id);
  if (!row) return;
  row.swipes = swipes;
  row.meta = swipes.map((_, i) => withoutBulk(meta[i]));
  row.swipe_index = swipeIndex;
  writeJsonl(chatFile(chatId), rows);
  // Only a freshly generated swipe carries these; everything else was already stripped.
  meta.forEach((m, i) => m && saveRecord(chatId, id, i, m));
}

/** Remove several messages in one rewrite of the log, rather than one each. */
export function deleteMessages(chatId: number, ids: number[]): number {
  const doomed = new Set(ids);
  const rows = readJsonl<MessageRow>(chatFile(chatId));
  const kept = rows.filter((m) => !doomed.has(m.id));
  const removed = rows.length - kept.length;
  if (!removed) return 0;

  writeJsonl(chatFile(chatId), kept);
  const file = promptFile(chatId);
  if (fs.existsSync(file)) {
    writeJsonl(file, readJsonl<RecordLine>(file).filter((l) => !doomed.has(l.message_id)));
  }
  for (const id of doomed) chatOfMessage.delete(id);
  bumpCount(chatId, -removed);
  return removed;
}

export function deleteMessage(id: number) {
  const chatId = findChatOf(id);
  if (chatId === undefined) return;
  const rows = readJsonl<MessageRow>(chatFile(chatId));
  const kept = rows.filter((m) => m.id !== id);
  if (kept.length === rows.length) return;
  writeJsonl(chatFile(chatId), kept);
  dropRecords(chatId, id);
  chatOfMessage.delete(id);
  bumpCount(chatId, -1);
}

// Rebuild the id counters if the file is missing, so ids are never handed out twice.
if (!fs.existsSync(COUNTERS_FILE)) {
  const chats = allChats();
  let message = 0;
  for (const chat of chats) {
    for (const m of readJsonl<MessageRow>(chatFile(chat.id))) message = Math.max(message, m.id);
  }
  writeJson(COUNTERS_FILE, {
    character: Math.max(0, ...allCharacters().map((c) => c.id)),
    chat: Math.max(0, ...chats.map((c) => c.id)),
    message,
  });
}
