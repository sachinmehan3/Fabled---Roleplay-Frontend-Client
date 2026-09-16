// Reshaping the finished prompt for backends that are fussy about message order.
//
// Fabled builds the prompt in the shape OpenAI accepts: several system messages,
// some of them after the conversation has started (post-history instructions,
// memory, lorebook entries at a depth). Anthropic-style APIs, Bedrock, Mistral
// and various gateways reject that, wanting one system block and strictly
// alternating turns. These transforms bend the prompt into what they will take.
import type { ChatMessage } from './prompt.ts';

export type PromptFormat = 'none' | 'merge' | 'semi' | 'strict' | 'single';

export const PROMPT_FORMATS: PromptFormat[] = ['none', 'merge', 'semi', 'strict', 'single'];

/** Inserted when a backend demands the conversation open with the user. */
export const CONVERSATION_START = '[Start a new chat]';

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join('\n\n');

/** Fold runs of the same role into one message. */
function mergeAdjacent(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const last = out.at(-1);
    if (last && last.role === m.role) last.content = join(last.content, m.content);
    else out.push({ ...m });
  }
  return out;
}

/**
 * Leave one system message at the front and attach any later one to the turn
 * before it, so post-history instructions keep the recency they were placed for
 * instead of being hoisted to the top where the model will weigh them less.
 */
function foldSystem(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role !== 'system') {
      out.push({ ...m });
      continue;
    }
    const last = out.at(-1);
    if (!last) out.push({ ...m });
    else if (last.role === 'system') last.content = join(last.content, m.content);
    else last.content = join(last.content, m.content);
  }
  return out;
}

/** Make sure the first thing after the system block comes from the user. */
function userFirst(messages: ChatMessage[]): ChatMessage[] {
  const at = messages.findIndex((m) => m.role !== 'system');
  if (at === -1 || messages[at].role === 'user') return messages;
  const out = [...messages];
  out.splice(at, 0, { role: 'user', content: CONVERSATION_START });
  return out;
}

export function postProcess(messages: ChatMessage[], format: PromptFormat): ChatMessage[] {
  switch (format) {
    case 'merge':
      return mergeAdjacent(messages);
    case 'semi':
      return mergeAdjacent(foldSystem(messages));
    case 'strict':
      return mergeAdjacent(userFirst(mergeAdjacent(foldSystem(messages))));
    case 'single': {
      // Everything becomes one turn. Speaker structure is lost, which is the
      // price of talking to a backend that will accept nothing else.
      const content = messages.map((m) => m.content.trim()).filter(Boolean).join('\n\n');
      return content ? [{ role: 'user', content }] : [];
    }
    case 'none':
    default:
      return messages;
  }
}
