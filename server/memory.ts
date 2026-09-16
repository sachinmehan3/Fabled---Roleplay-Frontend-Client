// Chat memory: a rolling summary plus durable facts, folded in the background.
//
// This never runs before a reply - it runs after one is saved, on the messages
// that have just fallen out of the context window. If it fails, the chat is
// unaffected; the next fold picks up the same messages again.
import type { CharacterCard } from './cards.ts';
import { applyMacros } from './prompt.ts';
import { completeChat } from './llm.ts';
import { getMemory, saveMemory, type ChatMemory, type MemoryFact, type MessageRow, type Settings } from './store.ts';

/** Facts are cheap, but not free: past this the oldest unpinned ones fall off. */
const MAX_FACTS = 40;
const MAX_SUMMARY_CHARS = 1400;
/** Never send an unbounded transcript to the summariser. */
const MAX_FOLD_CHARS = 24_000;

const INSTRUCTIONS = `You keep the memory of an ongoing roleplay so it can continue after older messages are forgotten.

Rewrite the running summary so it also covers the new messages, and list the durable facts.

Rules:
- The summary is past tense, third person, at most 200 words. Keep what still matters: what happened, how the characters changed towards each other, and anything unresolved. Drop small talk.
- Facts are short standalone statements that stay true later: relationships, injuries, promises, possessions, places, names. One clause each, under 15 words.
- Use only what is written below. Never invent anything, and never continue the story.
- Reply with JSON and nothing else: {"summary": "...", "facts": ["...", "..."]}`;

/** Pull the JSON object out of a reply that may be fenced or padded with prose. */
export function parseFold(raw: string): { summary: string; facts: string[] } | null {
  const text = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const facts = Array.isArray(obj.facts)
    ? obj.facts.filter((f): f is string => typeof f === 'string').map((f) => f.replace(/^[-*]\s*/, '').trim())
    : [];
  if (!summary && !facts.length) return null;
  return { summary: summary.slice(0, MAX_SUMMARY_CHARS), facts };
}

const key = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Merge a fold into what is already remembered, keeping pinned facts safe. */
export function mergeMemory(current: ChatMemory, fold: { summary: string; facts: string[] }, coveredThrough: number): ChatMemory {
  const facts: MemoryFact[] = [...current.facts];
  const seen = new Set(facts.map((f) => key(f.text)));
  for (const text of fold.facts) {
    const trimmed = text.trim();
    if (!trimmed || seen.has(key(trimmed))) continue;
    seen.add(key(trimmed));
    facts.push({ id: `${Date.now().toString(36)}-${facts.length}`, text: trimmed, createdAt: Date.now() });
  }

  // Trim from the oldest unpinned end, never touching anything pinned.
  while (facts.length > MAX_FACTS) {
    const victim = facts.findIndex((f) => !f.pinned);
    if (victim === -1) break;
    facts.splice(victim, 1);
  }

  return {
    ...current,
    summary: fold.summary || current.summary,
    facts,
    coveredThrough: Math.max(current.coveredThrough, coveredThrough),
    folds: current.folds + 1,
    updatedAt: Date.now(),
  };
}

/** The transcript handed to the summariser, oldest first and length-capped. */
function transcript(messages: MessageRow[], charName: string, userName: string): string {
  const lines = messages.map((m) => {
    const who = m.role === 'user' ? userName : charName;
    return `[${who}]: ${applyMacros(m.swipes[m.swipe_index] ?? '', charName, userName)}`;
  });
  let out = lines.join('\n\n');
  if (out.length > MAX_FOLD_CHARS) out = `...\n\n${out.slice(out.length - MAX_FOLD_CHARS)}`; // keep the most recent
  return out;
}

const inFlight = new Set<number>();

/**
 * Fold `messages` into the chat's memory. Returns the new memory, or null when
 * there was nothing to do. Only one fold per chat runs at a time.
 */
export async function foldMemory(
  chatId: number,
  card: CharacterCard,
  settings: Settings,
  messages: MessageRow[],
): Promise<ChatMemory | null> {
  if (inFlight.has(chatId)) return null;

  const current = getMemory(chatId);
  const fresh = messages.filter((m) => m.id > current.coveredThrough && (m.swipes[m.swipe_index] ?? '').trim());
  if (!fresh.length) return null;

  inFlight.add(chatId);
  try {
    const factList = current.facts.map((f) => `- ${f.text}`).join('\n');
    const result = await completeChat(
      settings,
      [
        { role: 'system', content: applyMacros(INSTRUCTIONS, card.name, settings.userName) },
        {
          role: 'user',
          content: [
            current.summary ? `Summary so far:\n${current.summary}` : 'There is no summary yet.',
            factList ? `Known facts:\n${factList}` : 'No facts recorded yet.',
            `New messages to fold in:\n${transcript(fresh, card.name, settings.userName)}`,
          ].join('\n\n'),
        },
      ],
      { maxTokens: 700, temperature: 0.3, timeoutMs: 60_000 },
    );

    const fold = parseFold(result.reply);
    if (!fold) throw new Error('the model did not return usable JSON');

    const updated = mergeMemory(current, fold, fresh.at(-1)!.id);
    saveMemory(chatId, updated);
    return updated;
  } finally {
    inFlight.delete(chatId);
  }
}
