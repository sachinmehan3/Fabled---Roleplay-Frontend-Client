// Prompt builder: turns card + settings + chat history into an OpenAI-style message list,
// trimming the oldest history so everything fits in the context window.
import type { CharacterCard } from './cards.ts';
import type { ChatMemory, Settings } from './store.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Rough token estimate (~3.5 chars per token for English).
 * Swap in a real tokenizer (e.g. `gpt-tokenizer` or `@huggingface/transformers`) for accuracy.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5) + 4; // +4 per-message overhead
}

/** Replace {{char}}, {{user}} and legacy <BOT>/<USER> placeholders. */
export function applyMacros(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}|<BOT>/gi, charName)
    .replace(/\{\{user\}\}|<USER>/gi, userName);
}

export interface BuiltPrompt {
  messages: ChatMessage[];
  usedHistory: number;
  estimatedTokens: number;
  /** Context spent on the remembered summary. */
  memoryTokens: number;
  /** Tokens that were left for chat history after the fixed parts were counted. */
  historyBudget: number;
  /** Whether the system prompt came from the card or from Settings. */
  systemSource: 'card' | 'default';
  usedOriginalMacro: boolean;
  hasPostHistory: boolean;
}

/** The remembered block, or null when there is nothing worth sending. */
function memoryBlock(memory: ChatMemory | undefined, budget: number, m: (t: string) => string): string | null {
  if (!memory || budget <= 0) return null;
  const summary = memory.summary.trim();
  if (!summary) return null;

  // Measure the finished block, wrapper included, or it can overrun the budget.
  const wrap = (text: string) =>
    text.trim() ? `<memory>\nEarlier in this story, before the messages below:\n\n${text.trim()}\n</memory>` : '';

  // Too long for its budget: shave the oldest end until the finished block fits,
  // measuring as we go rather than guessing at what the wrapper costs.
  let text = m(summary);
  while (text && estimateTokens(wrap(text)) > budget) {
    text = text.slice(Math.max(1, Math.ceil(text.length * 0.1)));
  }
  return text ? wrap(text) : null; // no room to say anything at all
}

export function buildPrompt(
  card: CharacterCard,
  settings: Settings,
  history: { role: 'user' | 'assistant'; content: string }[],
  memory?: ChatMemory,
): BuiltPrompt {
  const m = (t: string) => applyMacros(t, card.name, settings.userName).trim();

  // The card's own system prompt overrides the global one; {{original}} inserts the global one.
  const baseSystem = card.system_prompt
    ? card.system_prompt.replace(/\{\{original\}\}/gi, settings.systemPrompt)
    : settings.systemPrompt;

  const sections = [
    m(baseSystem),
    card.description && `<character name="${card.name}">\n${m(card.description)}\n</character>`,
    card.personality && `${card.name}'s personality: ${m(card.personality)}`,
    // The user card (Settings -> User) describes who {{user}} is in the scene.
    settings.userDescription.trim() &&
      `<user name="${settings.userName}">\n${m(settings.userDescription)}\n</user>`,
    card.scenario && `Scenario: ${m(card.scenario)}`,
    card.mes_example && `Example dialogue (style reference only):\n${m(card.mes_example.replace(/<START>/gi, '---'))}`,
  ].filter(Boolean);

  const system: ChatMessage = { role: 'system', content: sections.join('\n\n') };
  const postHistory: ChatMessage | null = card.post_history_instructions
    ? { role: 'system', content: m(card.post_history_instructions) }
    : null;

  // Memory is paid for out of the context before history gets any, so a long
  // chat keeps its past at the cost of a shorter raw window.
  const remembered = memoryBlock(memory, settings.memoryTokens, m);
  const memoryMessage: ChatMessage | null = remembered ? { role: 'system', content: remembered } : null;
  const memoryTokens = memoryMessage ? estimateTokens(memoryMessage.content) : 0;

  // Budget for history = context - reply - fixed parts - memory.
  const historyBudget =
    settings.contextSize -
    settings.maxTokens -
    estimateTokens(system.content) -
    (postHistory ? estimateTokens(postHistory.content) : 0) -
    memoryTokens;
  let budget = historyBudget;

  // Walk backwards from the newest message, keeping as many as fit.
  const kept: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = { role: history[i].role, content: m(history[i].content) };
    const cost = estimateTokens(msg.content);
    if (cost > budget) break;
    budget -= cost;
    kept.unshift(msg);
  }

  const messages = [system, ...(memoryMessage ? [memoryMessage] : []), ...kept, ...(postHistory ? [postHistory] : [])];
  const estimatedTokens = messages.reduce((n, x) => n + estimateTokens(x.content), 0);
  return {
    messages,
    usedHistory: kept.length,
    estimatedTokens,
    memoryTokens,
    historyBudget,
    systemSource: card.system_prompt ? 'card' : 'default',
    usedOriginalMacro: /\{\{original\}\}/i.test(card.system_prompt),
    hasPostHistory: !!postHistory,
  };
}
