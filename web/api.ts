import type {
  Character,
  CharacterCard,
  Chat,
  ChatMemory,
  ConnectionTest,
  GenerationMeta,
  Lorebook,
  Message,
  Settings,
  VisionCheck,
} from './types.ts';

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isRaw = body instanceof Blob;
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': isRaw ? 'application/octet-stream' : 'application/json' },
    body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  getSettings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (s: Partial<Settings> & { apiKey?: string | null }) => request<Settings>('PUT', '/api/settings', s),
  listModels: () => request<{ models: string[] }>('GET', '/api/models'),
  testConnection: () => request<ConnectionTest>('POST', '/api/test'),
  uploadUserAvatar: (file: File) => request<Settings>('POST', '/api/user/avatar', file),
  removeUserAvatar: () => request<Settings>('DELETE', '/api/user/avatar'),
  checkVision: () => request<VisionCheck>('GET', '/api/user/vision'),
  describeMe: () => request<{ text: string }>('POST', '/api/user/describe'),
  uploadChatBackground: (file: File) => request<Settings>('POST', '/api/background', file),
  removeChatBackground: () => request<Settings>('DELETE', '/api/background'),

  listCharacters: () => request<Character[]>('GET', '/api/characters'),
  importCharacter: (file: File) => request<Character>('POST', '/api/characters/import', file),
  createCharacter: (card: CharacterCard) => request<Character>('POST', '/api/characters', card),
  updateCharacter: (id: number, card: CharacterCard) => request<Character>('PUT', `/api/characters/${id}`, card),
  uploadCharacterAvatar: (id: number, file: File) => request<Character>('POST', `/api/characters/${id}/avatar`, file),
  removeCharacterAvatar: (id: number) => request<Character>('DELETE', `/api/characters/${id}/avatar`),
  deleteCharacter: (id: number) => request('DELETE', `/api/characters/${id}`),

  listChats: (charId: number) => request<Chat[]>('GET', `/api/characters/${charId}/chats`),
  createChat: (charId: number) => request<Chat>('POST', `/api/characters/${charId}/chats`),
  deleteChat: (id: number) => request('DELETE', `/api/chats/${id}`),
  branchChat: (chatId: number, messageId: number) =>
    request<Chat>('POST', `/api/chats/${chatId}/branch`, { messageId }),

  listLorebooks: () => request<Lorebook[]>('GET', '/api/lorebooks'),
  createLorebook: (name?: string) => request<Lorebook>('POST', '/api/lorebooks', { name }),
  saveLorebook: (id: number, patch: Partial<Omit<Lorebook, 'id'>>) =>
    request<Lorebook>('PUT', `/api/lorebooks/${id}`, patch),
  deleteLorebook: (id: number) => request('DELETE', `/api/lorebooks/${id}`),
  importLorebook: (file: File) => request<Lorebook>('POST', '/api/lorebooks/import', file),

  getMemory: (chatId: number) => request<ChatMemory>('GET', `/api/chats/${chatId}/memory`),
  saveMemory: (chatId: number, patch: { summary: string }) =>
    request<ChatMemory>('PUT', `/api/chats/${chatId}/memory`, patch),
  foldMemory: (chatId: number) => request<ChatMemory>('POST', `/api/chats/${chatId}/memory/fold`),
  clearMemory: (chatId: number) => request<ChatMemory>('DELETE', `/api/chats/${chatId}/memory`),

  listMessages: (chatId: number) => request<Message[]>('GET', `/api/chats/${chatId}/messages`),
  sendMessage: (chatId: number, content: string) => request<Message>('POST', `/api/chats/${chatId}/messages`, { content }),
  updateMessage: (id: number, patch: { content?: string; swipe_index?: number }) =>
    request<Message>('PATCH', `/api/messages/${id}`, patch),
  deleteMessage: (id: number) => request('DELETE', `/api/messages/${id}`),
  deleteMessages: (chatId: number, ids: number[]) =>
    request<{ removed: number }>('POST', `/api/chats/${chatId}/messages/delete`, { ids }),
  /** The full record for one swipe, including the prompt as it was sent. */
  getMessageMeta: (id: number, swipe: number) =>
    request<GenerationMeta>('GET', `/api/messages/${id}/meta/${swipe}`),
};

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onReasoning?: (text: string) => void;
  signal: AbortSignal;
}

/** Start a generation and read the SSE stream. Resolves with the saved message (if any). */
export async function generate(
  chatId: number,
  mode: 'new' | 'swipe' | 'redo',
  { onDelta, onReasoning, signal }: StreamHandlers,
  /** Which reply to add a version to. Defaults to the last one. */
  messageId?: number,
): Promise<Message | undefined> {
  const res = await fetch(`/api/chats/${chatId}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, messageId }),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Generation failed (${res.status})`);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let saved: Message | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = event.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const data = JSON.parse(line.slice(5));
      if (data.delta) onDelta(data.delta);
      if (data.reasoning) onReasoning?.(data.reasoning);
      if (data.message) saved = data.message;
      if (data.error) {
        const err = new Error(data.error) as Error & { saved?: Message };
        err.saved = saved;
        throw err;
      }
    }
  }
  return saved;
}
