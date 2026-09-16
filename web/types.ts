export interface CharacterCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  creator_notes: string;
  creator: string;
  tags: string[];
}

export interface Character {
  id: number;
  name: string;
  avatar: string | null;
  card: CharacterCard;
}

export interface Chat {
  id: number;
  character_id: number;
  title: string;
  created_at: number;
  message_count?: number;
}

export interface ConnectionTest {
  model?: string;
  reply: string;
  usage?: TokenUsage;
  finishReason?: string;
  ms: number;
}

export interface MemoryFact {
  id: string;
  text: string;
  pinned?: boolean;
  createdAt: number;
}

export interface ChatMemory {
  version: 1;
  summary: string;
  facts: MemoryFact[];
  coveredThrough: number;
  folds: number;
  updatedAt: number;
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * What happened when one reply was generated, kept per swipe.
 * `prompt` is only present on records fetched with api.getMessageMeta().
 */
export interface GenerationMeta {
  status: 'ok' | 'stopped' | 'error';
  error?: string;
  createdAt: number;
  edited?: boolean;

  provider: string;
  modelRequested: string;
  modelReported?: string;
  temperature: number;
  maxTokens: number;
  contextSize: number;
  thinkingLevel: ThinkingLevel;
  extrasDropped?: boolean;
  memoryTokens?: number;
  memoryFacts?: number;

  prompt?: PromptMessage[];
  systemSource: 'card' | 'default';
  usedOriginalMacro: boolean;
  hasPostHistory: boolean;
  historyTotal: number;
  historySent: number;
  historyBudget: number;
  estimatedPromptTokens: number;

  finishReason?: string;
  usage?: TokenUsage;
  outputChars: number;
  estimatedCompletionTokens: number;
  msToFirstToken?: number;
  msTotal: number;
}

export interface Message {
  id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  swipes: string[];
  /** Parallel to swipes; null for greetings and anything not generated here. */
  meta: (GenerationMeta | null)[];
  swipe_index: number;
  created_at: number;
}

export type ThinkingLevel = 'default' | 'low' | 'medium' | 'high';

export interface Settings {
  apiBase: string;
  model: string;
  userName: string;
  userDescription: string;
  userAvatar: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  contextSize: number;
  thinkingLevel: ThinkingLevel;
  memoryTokens: number;
  chatBackground: string;
  chatBackgroundDim: number;
  hasApiKey: boolean;
}
