// HTTP API server. Zero runtime dependencies: node:http + node:sqlite.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {
  AVATAR_DIR,
  clearMemory,
  deleteChat,
  deleteCharacter,
  deleteMessage,
  getCharacter,
  getChat,
  getLoreState,
  getLorebook,
  getMemory,
  getMessage,
  getRecord,
  getSettings,
  deleteLorebook,
  insertChat,
  insertCharacter,
  insertLorebook,
  insertMessage,
  listCharacters,
  listChats,
  listLorebooks,
  listMessages,
  saveLoreState,
  saveMemory,
  saveSettings,
  saveSwipes,
  updateCharacter,
  updateLorebook,
  type CharacterRow,
  type GenerationMeta,
  type MessageRow,
} from './store.ts';
import { foldMemory } from './memory.ts';
import { activateLore, EMPTY_ENTRY, type Lorebook } from './lorebook.ts';
import { importLorebook } from './lorebook-import.ts';
import './migrate-sqlite.ts'; // one-time import of an older data/rp.db, if one is there
import { seedStarterCharacter } from './seed.ts';
import { isPng, normalizeCard, parseCardFile, type CharacterCard } from './cards.ts';
import { buildPrompt, estimateTokens } from './prompt.ts';
import { describeImage, listModels, streamChat, testChat, type StreamReport } from './llm.ts';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1'; // local only by default: the API key lives here
const DIST_DIR = path.resolve('dist');
const MAX_UPLOAD = 20 * 1024 * 1024;

// ---------- tiny router ----------

type Ctx = {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  params: Record<string, string>;
  body: () => Promise<Buffer>;
  json: <T = any>() => Promise<T>;
};
type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(method: string, pathPattern: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + pathPattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$',
  );
  routes.push({ method, pattern, keys, handler });
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_UPLOAD) {
        reject(new HttpError(413, 'Upload too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const id = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new HttpError(400, 'Bad id');
  return n;
};

// ---------- settings ----------

// The API key never leaves the server; the browser only learns whether one is set.
function settingsOut() {
  const { apiKey, ...rest } = getSettings();
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

route('GET', '/api/settings', () => settingsOut());

route('PUT', '/api/settings', async ({ json }) => {
  const patch = await json();
  // An empty apiKey field means "keep the existing key"; send null to clear it.
  if (patch.apiKey === '' || patch.apiKey === undefined) delete patch.apiKey;
  else if (patch.apiKey === null) patch.apiKey = '';
  saveSettings(patch);
  return settingsOut();
});

// ---------- avatars ----------

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Sniff the file type of an uploaded avatar; null if it isn't an image we serve. */
function imageExt(buf: Buffer): string | null {
  if (isPng(buf)) return '.png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  if (buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF') return '.gif';
  return null;
}

/** Write an avatar under a unique name (so browsers don't serve a cached old one) and drop the previous file. */
function writeAvatar(buf: Buffer, prefix: string, previous: string | null): string {
  const ext = imageExt(buf);
  if (!ext) throw new HttpError(400, 'Avatar must be a PNG, JPEG, WebP or GIF image');
  const file = `${prefix}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(AVATAR_DIR, file), buf);
  removeAvatar(previous);
  return file;
}

function removeAvatar(file: string | null) {
  if (file) fs.rmSync(path.join(AVATAR_DIR, path.basename(file)), { force: true });
}

// ---------- describing your picture ----------

const DESCRIBE_PROMPT = `Write how the person in this picture would look to someone meeting them for the first time.

- Third person, present tense, at most 60 words.
- Cover build, hair, eyes, clothing and bearing. Keep it concrete.
- Write it as a character description for a roleplay, not as a photo caption. Do not mention photographs, cameras, backgrounds or image quality.
- Do not guess at names, jobs, ethnicity, health or exact age. An age range is fine if it is obvious.
- Reply with the description alone.`;

/** The saved user picture, inlined for a vision request. */
function userPictureDataUrl(): string {
  const file = getSettings().userAvatar;
  if (!file) throw new HttpError(400, 'Upload a picture first.');
  const full = path.join(AVATAR_DIR, path.basename(file));
  if (!fs.existsSync(full)) throw new HttpError(400, 'That picture is no longer on disk.');
  const mime = IMAGE_MIME[path.extname(full).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
}

/** Whether a given provider+model can read images. Cleared when the server restarts. */
const visionCache = new Map<string, { vision: boolean; reason?: string }>();
const visionKey = (s: { apiBase: string; model: string }) => `${s.apiBase}|${s.model}`;

/** Asks the model to look at the picture and say one word, to learn whether it can. */
route('GET', '/api/user/vision', async () => {
  const settings = getSettings();
  if (!settings.model) return { vision: false, reason: 'Choose a model first.' };
  if (!settings.userAvatar) return { vision: false, reason: 'Upload a picture first.' };

  const cached = visionCache.get(visionKey(settings));
  if (cached) return cached;

  try {
    await describeImage(settings, userPictureDataUrl(), 'Reply with the single word: ok', 1);
    const result = { vision: true };
    visionCache.set(visionKey(settings), result);
    return result;
  } catch (e) {
    const reason = (e as Error).message;
    const result = { vision: false, reason };
    // A key or network problem says nothing about the model, so don't remember it as a verdict.
    if (!/could not reach|no response|401|403|429|timed out/i.test(reason)) {
      visionCache.set(visionKey(settings), result);
    }
    return result;
  }
});

route('POST', '/api/user/describe', async () => {
  const settings = getSettings();
  if (!settings.model) throw new HttpError(400, 'Choose a model first.');
  const result = await describeImage(settings, userPictureDataUrl(), DESCRIBE_PROMPT, 220);
  const text = result.reply.trim();
  if (!text) throw new HttpError(502, 'The model looked at the picture but said nothing.');
  visionCache.set(visionKey(settings), { vision: true }); // it plainly can
  return { text };
});

route('POST', '/api/user/avatar', async ({ body }) => {
  const file = writeAvatar(await body(), 'user', getSettings().userAvatar || null);
  saveSettings({ userAvatar: file });
  return settingsOut();
});

route('DELETE', '/api/user/avatar', () => {
  removeAvatar(getSettings().userAvatar || null);
  saveSettings({ userAvatar: '' });
  return settingsOut();
});

// The chat background lives in the same folder and is served by the same route.
route('POST', '/api/background', async ({ body }) => {
  const file = writeAvatar(await body(), 'background', getSettings().chatBackground || null);
  saveSettings({ chatBackground: file });
  return settingsOut();
});

route('DELETE', '/api/background', () => {
  removeAvatar(getSettings().chatBackground || null);
  saveSettings({ chatBackground: '' });
  return settingsOut();
});

route('GET', '/api/models', async () => ({ models: await listModels(getSettings()) }));

// Spends a handful of tokens to prove the whole chain works, not just /models.
route('POST', '/api/test', async () => {
  const settings = getSettings();
  if (!settings.apiBase.trim()) throw new HttpError(400, 'Set an API base URL first.');
  if (!settings.model) throw new HttpError(400, 'Choose a model first.');
  const started = Date.now();
  const result = await testChat(settings);
  return { ...result, ms: Date.now() - started };
});

// ---------- characters ----------

function characterOut(row: CharacterRow) {
  return { id: row.id, name: row.name, avatar: row.avatar, card: row.card };
}

function requireCharacter(charId: number) {
  const row = getCharacter(charId);
  if (!row) throw new HttpError(404, 'Character not found');
  return row;
}

route('GET', '/api/characters', () => listCharacters().map(characterOut));

// Body: raw file bytes (PNG card or JSON card).
route('POST', '/api/characters/import', async ({ body }) => {
  const buf = await body();
  let parsed;
  try {
    parsed = parseCardFile(buf);
  } catch (e) {
    throw new HttpError(400, `Could not read card: ${(e as Error).message}`);
  }
  const row = insertCharacter(parsed.card.name, parsed.card);
  if (parsed.png) {
    const file = `${row.id}.png`;
    fs.writeFileSync(path.join(AVATAR_DIR, file), buf);
    updateCharacter(row.id, { avatar: file });
  }
  return characterOut(requireCharacter(row.id));
});

// Body: a card as JSON (from the in-app character editor).
route('POST', '/api/characters', async ({ json }) => {
  let card: CharacterCard;
  try {
    card = normalizeCard(await json());
  } catch (e) {
    throw new HttpError(400, `Could not save card: ${(e as Error).message}`);
  }
  return characterOut(insertCharacter(card.name, card));
});

route('PUT', '/api/characters/:id', async ({ params, json }) => {
  const current = requireCharacter(id(params.id));
  const card = normalizeCard({ ...current.card, ...(await json()) });
  updateCharacter(current.id, { name: card.name, card });
  return characterOut(requireCharacter(current.id));
});

route('DELETE', '/api/characters/:id', ({ params }) => {
  const c = requireCharacter(id(params.id));
  deleteCharacter(c.id);
  removeAvatar(c.avatar);
  return { ok: true };
});

// Body: raw image bytes.
route('POST', '/api/characters/:id/avatar', async ({ params, body }) => {
  const c = requireCharacter(id(params.id));
  const file = writeAvatar(await body(), String(c.id), c.avatar);
  updateCharacter(c.id, { avatar: file });
  return characterOut(requireCharacter(c.id));
});

route('DELETE', '/api/characters/:id/avatar', ({ params }) => {
  const c = requireCharacter(id(params.id));
  removeAvatar(c.avatar);
  updateCharacter(c.id, { avatar: null });
  return characterOut(requireCharacter(c.id));
});

route('GET', '/api/avatars/:file', ({ params, res }) => {
  const file = path.basename(params.file);
  const full = path.join(AVATAR_DIR, file);
  if (!fs.existsSync(full)) throw new HttpError(404, 'Not found');
  res.writeHead(200, {
    'Content-Type': IMAGE_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'max-age=3600',
  });
  fs.createReadStream(full).pipe(res);
  return undefined;
});

// ---------- chats ----------

route('GET', '/api/characters/:id/chats', ({ params }) => listChats(id(params.id)));

route('POST', '/api/characters/:id/chats', ({ params }) => {
  const c = requireCharacter(id(params.id));
  const chat = insertChat(c.id, `${c.name} — ${new Date().toLocaleString()}`);
  // Greeting + alternate greetings become swipes of the first message.
  const greetings = [c.card.first_mes, ...c.card.alternate_greetings].filter((g) => g.trim());
  if (greetings.length) insertMessage(chat.id, 'assistant', greetings);
  return getChat(chat.id);
});

route('DELETE', '/api/chats/:id', ({ params }) => {
  deleteChat(id(params.id));
  return { ok: true };
});

function requireChat(chatId: number) {
  const chat = getChat(chatId);
  if (!chat) throw new HttpError(404, 'Chat not found');
  return chat;
}

/**
 * A message as the browser sees it. The prompt that produced each swipe can be
 * hundreds of kilobytes, so it is left out here and fetched on demand instead.
 */
function messageOut(m: MessageRow) {
  return {
    ...m,
    meta: m.meta.map((entry) => {
      if (!entry) return null;
      const { prompt: _prompt, ...rest } = entry;
      return rest;
    }),
  };
}

route('GET', '/api/chats/:id/messages', ({ params }) => listMessages(requireChat(id(params.id)).id).map(messageOut));

route('POST', '/api/chats/:id/messages', async ({ params, json }) => {
  const chat = requireChat(id(params.id));
  const { content } = await json<{ content: string }>();
  if (typeof content !== 'string' || !content.trim()) throw new HttpError(400, 'Empty message');
  return messageOut(insertMessage(chat.id, 'user', [content]));
});

// ---------- lorebooks ----------

const NEW_BOOK: Omit<Lorebook, 'id' | 'created_at'> = {
  name: 'New lorebook',
  enabled: true,
  characterIds: [],
  scanDepth: 4,
  caseSensitive: false,
  matchWholeWords: true,
  maxRecursionSteps: 2,
  budget: 1024,
  entries: [],
};

function requireLorebook(bookId: number) {
  const book = getLorebook(bookId);
  if (!book) throw new HttpError(404, 'Lorebook not found');
  return book;
}

route('GET', '/api/lorebooks', () => listLorebooks());

route('POST', '/api/lorebooks', async ({ json }) => {
  const { name } = await json<{ name?: string }>().catch(() => ({}) as { name?: string });
  return insertLorebook({ ...NEW_BOOK, name: name?.trim() || NEW_BOOK.name });
});

route('GET', '/api/lorebooks/:id', ({ params }) => requireLorebook(id(params.id)));

route('PUT', '/api/lorebooks/:id', async ({ params, json }) => {
  const book = requireLorebook(id(params.id));
  const patch = await json<Partial<Lorebook>>();
  const entries = Array.isArray(patch.entries)
    ? patch.entries.map((e, i) => ({ ...EMPTY_ENTRY, ...e, id: e.id || `e-${Date.now().toString(36)}-${i}` }))
    : book.entries;
  updateLorebook(book.id, { ...patch, id: undefined, created_at: undefined, entries } as Partial<Lorebook>);
  return requireLorebook(book.id);
});

route('DELETE', '/api/lorebooks/:id', ({ params }) => {
  deleteLorebook(requireLorebook(id(params.id)).id);
  return { ok: true };
});

// Body: raw JSON bytes, ours or a SillyTavern World Info export.
route('POST', '/api/lorebooks/import', async ({ body }) => {
  const buf = await body();
  let parsed;
  try {
    parsed = importLorebook(JSON.parse(buf.toString('utf8')), 'Imported lorebook');
  } catch (e) {
    throw new HttpError(400, `Could not read that lorebook: ${(e as Error).message}`);
  }
  return insertLorebook(parsed);
});

// ---------- chat memory ----------

route('GET', '/api/chats/:id/memory', ({ params }) => getMemory(requireChat(id(params.id)).id));

// Body: { summary } - what the memory panel saves after an edit.
route('PUT', '/api/chats/:id/memory', async ({ params, json }) => {
  const chat = requireChat(id(params.id));
  const { summary } = await json<{ summary?: string }>();
  const current = getMemory(chat.id);
  saveMemory(chat.id, { ...current, summary: typeof summary === 'string' ? summary : current.summary });
  return getMemory(chat.id);
});

route('DELETE', '/api/chats/:id/memory', ({ params }) => clearMemory(requireChat(id(params.id)).id));

// Summarise now, rather than waiting for messages to fall out of the window.
route('POST', '/api/chats/:id/memory/fold', async ({ params }) => {
  const chat = requireChat(id(params.id));
  const character = requireCharacter(chat.character_id);
  const settings = getSettings();
  if (!settings.model) throw new HttpError(400, 'No model selected - open Settings first.');
  const messages = listMessages(chat.id);
  const updated = await foldMemory(chat.id, character.card, settings, messages.slice(0, -1));
  if (!updated) throw new HttpError(400, 'Nothing new to remember yet.');
  return updated;
});

// The full generation record for one swipe, including the prompt as it was sent.
route('GET', '/api/messages/:id/meta/:swipe', ({ params }) => {
  const msg = getMessage(id(params.id));
  if (!msg) throw new HttpError(404, 'Message not found');
  const swipe = id(params.swipe);
  const meta = msg.meta[swipe];
  if (!meta) throw new HttpError(404, 'No generation record for this version');
  return { ...meta, ...getRecord(msg.chat_id, msg.id, swipe) };
});

// Edit the active swipe's text, or change which swipe is active.
route('PATCH', '/api/messages/:id', async ({ params, json }) => {
  const msg = getMessage(id(params.id));
  if (!msg) throw new HttpError(404, 'Message not found');
  const { content, swipe_index } = await json<{ content?: string; swipe_index?: number }>();
  if (typeof swipe_index === 'number') {
    if (swipe_index < 0 || swipe_index >= msg.swipes.length) throw new HttpError(400, 'Bad swipe index');
    msg.swipe_index = swipe_index;
  }
  if (typeof content === 'string') {
    msg.swipes[msg.swipe_index] = content;
    // Keep the record, but say the text no longer matches what the model produced.
    const record = msg.meta[msg.swipe_index];
    if (record) msg.meta[msg.swipe_index] = { ...record, edited: true };
  }
  saveSwipes(msg.id, msg.swipes, msg.meta, msg.swipe_index);
  return messageOut(getMessage(msg.id)!);
});

route('DELETE', '/api/messages/:id', ({ params }) => {
  deleteMessage(id(params.id));
  return { ok: true };
});

// ---------- generation (Server-Sent Events) ----------
// mode "new":   append a new assistant reply
// mode "swipe": add an alternative version of the last assistant reply
route('POST', '/api/chats/:id/generate', async ({ params, json, res }) => {
  const chat = requireChat(id(params.id));
  const { mode = 'new' } = await json<{ mode?: 'new' | 'swipe' }>().catch(() => ({}) as { mode?: 'new' | 'swipe' });
  const character = requireCharacter(chat.character_id);
  const settings = getSettings();
  if (!settings.model) throw new HttpError(400, 'No model selected — open Settings first.');

  let all = listMessages(chat.id);
  let target: MessageRow | undefined;
  if (mode === 'swipe') {
    target = all.at(-1);
    if (!target || target.role !== 'assistant') throw new HttpError(400, 'Last message is not a reply');
    all = all.slice(0, -1);
  }

  const history = all.map((m) => ({ role: m.role, content: m.swipes[m.swipe_index] ?? '' }));

  // Lorebooks look at the conversation and decide what the model needs to know.
  const lore = activateLore({
    books: listLorebooks(),
    messages: history,
    characterId: character.id,
    state: getLoreState(chat.id),
    estimateTokens,
  });
  saveLoreState(chat.id, lore.state); // sticky and cooldown are remembered per chat

  const built = buildPrompt(character.card, settings, history, getMemory(chat.id), lore.entries);
  const { messages } = built;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const emit = (data: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const controller = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) controller.abort(); // user pressed Stop / closed tab
  });

  const report: StreamReport = {};
  const startedAt = Date.now();
  let firstTokenAt: number | undefined;
  let text = '';
  let reasoning = '';
  let error: string | null = null;
  try {
    for await (const part of streamChat(settings, messages, controller.signal, report)) {
      if (part.reasoning) {
        reasoning += part.text;
        emit({ reasoning: part.text });
        continue;
      }
      firstTokenAt ??= Date.now(); // the clock starts at the first word of the reply
      text += part.text;
      emit({ delta: part.text });
    }
  } catch (e) {
    if (!controller.signal.aborted) error = (e as Error).message;
  }
  finished = true;

  // Everything worth knowing about this reply, kept next to the text itself.
  const meta: GenerationMeta = {
    status: error ? 'error' : controller.signal.aborted ? 'stopped' : 'ok',
    error: error ?? undefined,
    createdAt: Date.now(),
    provider: settings.apiBase,
    modelRequested: settings.model,
    modelReported: report.modelReported,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    contextSize: settings.contextSize,
    thinkingLevel: settings.thinkingLevel,
    extrasDropped: report.extrasDropped,
    prompt: messages,
    systemSource: built.systemSource,
    usedOriginalMacro: built.usedOriginalMacro,
    hasPostHistory: built.hasPostHistory,
    historyTotal: history.length,
    historySent: built.usedHistory,
    historyBudget: built.historyBudget,
    memoryTokens: built.memoryTokens,
    loreTokens: built.loreTokens || undefined,
    loreEntries: built.loreTitles.length || undefined,
    loreTitles: built.loreTitles.length ? built.loreTitles : undefined,
    estimatedPromptTokens: built.estimatedTokens,
    finishReason: report.finishReason,
    usage: report.usage,
    reasoning: reasoning.trim() || undefined,
    reasoningChars: reasoning.trim().length || undefined,
    outputChars: text.length,
    estimatedCompletionTokens: estimateTokens(text),
    msToFirstToken: firstTokenAt && firstTokenAt - startedAt,
    msTotal: Date.now() - startedAt,
  };

  // Save whatever we got (including partial output after Stop).
  let saved: MessageRow | undefined;
  if (text.trim()) {
    if (target) {
      target.swipes.push(text);
      target.meta.push(meta);
      saveSwipes(target.id, target.swipes, target.meta, target.swipes.length - 1);
      saved = getMessage(target.id);
    } else {
      saved = insertMessage(chat.id, 'assistant', [text], [meta]);
    }
  }

  const out = saved && messageOut(saved);
  if (error) emit({ error, message: out });
  else emit({ done: true, message: out });
  res.end();

  // Remember whatever just fell out of the window. This runs after the reply is
  // sent, so a slow or failing summariser never delays the roleplay.
  if (settings.memoryTokens > 0 && built.usedHistory < all.length) {
    const forgotten = all.slice(0, all.length - built.usedHistory);
    foldMemory(chat.id, character.card, settings, forgotten).catch((e: Error) =>
      console.error(`Memory fold failed for chat ${chat.id}:`, e.message),
    );
  }
  return undefined;
});

// ---------- static files (production build) ----------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveStatic(urlPath: string, res: http.ServerResponse): boolean {
  if (!fs.existsSync(DIST_DIR)) return false;
  let file = path.join(DIST_DIR, path.normalize(decodeURIComponent(urlPath)));
  if (!file.startsWith(DIST_DIR)) return false;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, 'index.html'); // SPA fallback
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';

  for (const r of routes) {
    if (r.method !== method) continue;
    const match = r.pattern.exec(url.pathname);
    if (!match) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
    let bodyPromise: Promise<Buffer> | null = null;
    const body = () => (bodyPromise ??= readBody(req));
    const ctx: Ctx = {
      req,
      res,
      params,
      body,
      json: async () => {
        const b = await body();
        try {
          return b.length ? JSON.parse(b.toString('utf8')) : {};
        } catch {
          throw new HttpError(400, 'Invalid JSON');
        }
      },
    };
    try {
      const result = await r.handler(ctx);
      if (result !== undefined && !res.headersSent) send(res, 200, result);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) send(res, status, { error: (e as Error).message });
      else res.end();
    }
    return;
  }

  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
  if (method === 'GET' && serveStatic(url.pathname, res)) return;
  send(res, 404, { error: 'Not found (run `npm run dev` and open the Vite URL)' });
});

seedStarterCharacter(); // runs after any migration above has had its turn

server.listen(PORT, HOST, () => {
  console.log(`RP server listening on http://${HOST}:${PORT}`);
});
