// Lorebooks (World Info): entries that are pulled into the prompt when the
// conversation mentions them.
//
// The engine here is pure - it takes books, a conversation and the per-chat
// timed state, and returns what to insert plus the state to save. That keeps
// every rule below testable without a model or a server.
export type EntryMode = 'constant' | 'selective';
export type SecondaryLogic = 'and_any' | 'and_all' | 'not_any' | 'not_all';
export type EntryPosition = 'before_char' | 'after_char' | 'at_depth';
export type EntryRole = 'system' | 'user' | 'assistant';

export interface LoreEntry {
  id: string;
  /** A label for you, never sent to the model. */
  title: string;
  content: string;
  enabled: boolean;
  /** Constant entries are always in; selective ones wait to be mentioned. */
  mode: EntryMode;
  keys: string[];
  secondaryKeys: string[];
  logic: SecondaryLogic;

  // Placement
  position: EntryPosition;
  /** Messages from the end, for position 'at_depth'. */
  depth: number;
  role: EntryRole;
  /** Higher order is inserted later, nearer the model's attention. */
  order: number;

  // Matching overrides; null means "use the book's setting"
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  scanDepth: number | null;

  // Chance and grouping
  probability: number;
  group: string;
  groupWeight: number;
  prioritizeInclusion: boolean;

  // Recursion
  /** Cannot be activated by another entry's content. */
  excludeRecursion: boolean;
  /** Once in, does not go on to activate anything else. */
  preventRecursion: boolean;
  /** Never matches the chat itself, only other entries' content. */
  delayUntilRecursion: boolean;

  // Timed effects, counted in messages
  sticky: number;
  cooldown: number;
  delay: number;
}

export interface Lorebook {
  id: number;
  name: string;
  enabled: boolean;
  /** Empty means every character; otherwise only these. */
  characterIds: number[];
  scanDepth: number;
  caseSensitive: boolean;
  matchWholeWords: boolean;
  /** 1 disables recursion, 2 allows entries to activate entries, and so on. */
  maxRecursionSteps: number;
  /** Hard ceiling on the tokens all of a chat's entries may take. */
  budget: number;
  entries: LoreEntry[];
  created_at: number;
}

/** Per-chat timed state, keyed `<bookId>:<entryId>`. Values are message counts. */
export interface LoreState {
  [key: string]: { sticky?: number; cooldown?: number };
}

export interface ActivatedEntry {
  bookId: number;
  entry: LoreEntry;
  /** Which pass found it: 0 is the chat itself, 1+ came from another entry. */
  pass: number;
}

export const EMPTY_ENTRY: Omit<LoreEntry, 'id'> = {
  title: '',
  content: '',
  enabled: true,
  mode: 'selective',
  keys: [],
  secondaryKeys: [],
  logic: 'and_any',
  position: 'after_char',
  depth: 4,
  role: 'system',
  order: 100,
  caseSensitive: null,
  matchWholeWords: null,
  scanDepth: null,
  probability: 100,
  group: '',
  groupWeight: 100,
  prioritizeInclusion: false,
  excludeRecursion: false,
  preventRecursion: false,
  delayUntilRecursion: false,
  sticky: 0,
  cooldown: 0,
  delay: 0,
};

// ---------- key matching ----------

const REGEX_KEY = /^\/(.+)\/([gimsuy]*)$/;

/** A key written as /pattern/flags is a regular expression; anything else is text. */
export function matchesKey(haystack: string, key: string, caseSensitive: boolean, wholeWords: boolean): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;

  const asRegex = REGEX_KEY.exec(trimmed);
  if (asRegex) {
    try {
      const flags = asRegex[2].includes('i') || caseSensitive ? asRegex[2] : `${asRegex[2]}i`;
      return new RegExp(asRegex[1], flags).test(haystack);
    } catch {
      return false; // a broken pattern simply never matches
    }
  }

  const text = caseSensitive ? haystack : haystack.toLowerCase();
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();

  // Whole-word matching only makes sense for keys without their own spaces.
  if (wholeWords && !/\s/.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escaped}(?:[^\\p{L}\\p{N}_]|$)`, caseSensitive ? 'u' : 'iu').test(
      haystack,
    );
  }
  return text.includes(needle);
}

const anyKey = (haystack: string, keys: string[], cs: boolean, ww: boolean) =>
  keys.some((k) => matchesKey(haystack, k, cs, ww));
const allKeys = (haystack: string, keys: string[], cs: boolean, ww: boolean) =>
  keys.every((k) => matchesKey(haystack, k, cs, ww));

/** Primary keys are OR'd; the optional filter then narrows by its own logic. */
export function entryMatches(entry: LoreEntry, haystack: string, cs: boolean, ww: boolean): boolean {
  if (!anyKey(haystack, entry.keys, cs, ww)) return false;

  const secondary = entry.secondaryKeys.filter((k) => k.trim());
  if (!secondary.length) return true;

  switch (entry.logic) {
    case 'and_any':
      return anyKey(haystack, secondary, cs, ww);
    case 'and_all':
      return allKeys(haystack, secondary, cs, ww);
    case 'not_any':
      return !anyKey(haystack, secondary, cs, ww);
    case 'not_all':
      return !allKeys(haystack, secondary, cs, ww);
  }
}

// ---------- activation ----------

export interface ActivateOptions {
  books: Lorebook[];
  /** Oldest first, as `name: text` lines so keys can match on who spoke. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  characterId: number;
  state: LoreState;
  /** Tokens an entry's content costs; injected so the engine stays pure. */
  estimateTokens: (text: string) => number;
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
}

export interface ActivateResult {
  entries: ActivatedEntry[];
  state: LoreState;
  /** Everything that matched, before the budget and groups had their say. */
  considered: number;
  tokens: number;
}

const stateKey = (bookId: number, entryId: string) => `${bookId}:${entryId}`;

/** The last `depth` messages, newest last, as one block of text to scan. */
function scanBuffer(messages: ActivateOptions['messages'], depth: number): string {
  if (depth <= 0) return '';
  return messages.slice(-depth).map((m) => m.content).join('\n');
}

export function activateLore(opts: ActivateOptions): ActivateResult {
  const random = opts.random ?? Math.random;
  const messageCount = opts.messages.length;
  const state: LoreState = { ...opts.state };

  const books = opts.books.filter(
    (b) => b.enabled && (b.characterIds.length === 0 || b.characterIds.includes(opts.characterId)),
  );

  type Candidate = { bookId: number; book: Lorebook; entry: LoreEntry };
  const candidates: Candidate[] = [];
  for (const book of books) {
    for (const entry of book.entries) {
      if (!entry.enabled) continue;
      if (!entry.content.trim()) continue;
      candidates.push({ bookId: book.id, book, entry });
    }
  }

  const activated: ActivatedEntry[] = [];
  const taken = new Set<string>();
  let recursionBuffer = '';

  const settingsFor = (c: Candidate) => ({
    cs: c.entry.caseSensitive ?? c.book.caseSensitive,
    ww: c.entry.matchWholeWords ?? c.book.matchWholeWords,
    depth: c.entry.scanDepth ?? c.book.scanDepth,
  });

  const maxSteps = Math.max(1, Math.max(...books.map((b) => b.maxRecursionSteps), 1));

  for (let pass = 0; pass < maxSteps; pass++) {
    const found: Candidate[] = [];

    for (const c of candidates) {
      const key = stateKey(c.bookId, c.entry.id);
      if (taken.has(key)) continue;

      const timed = state[key] ?? {};
      const isSticky = (timed.sticky ?? 0) > messageCount;

      // A sticky entry stays in regardless of keys, chance or cooldown.
      if (!isSticky) {
        if (messageCount < c.entry.delay) continue;
        if ((timed.cooldown ?? 0) > messageCount) continue;
        if (pass > 0 && c.entry.excludeRecursion) continue;
        if (pass === 0 && c.entry.delayUntilRecursion) continue;

        if (c.entry.mode !== 'constant') {
          const { cs, ww, depth } = settingsFor(c);
          const haystack = pass === 0 ? scanBuffer(opts.messages, depth) : recursionBuffer;
          if (!haystack || !entryMatches(c.entry, haystack, cs, ww)) continue;
        }
        if (c.entry.probability < 100 && random() * 100 >= c.entry.probability) continue;
      }

      taken.add(key);
      found.push(c);
      activated.push({ bookId: c.bookId, entry: c.entry, pass });
    }

    if (!found.length) break;
    // What was just added becomes the text the next pass scans.
    recursionBuffer = found
      .filter((c) => !c.entry.preventRecursion)
      .map((c) => c.entry.content)
      .join('\n');
    if (!recursionBuffer.trim()) break;
  }

  const considered = activated.length;
  const chosen = applyGroups(activated, random);
  const { kept, tokens } = applyBudget(chosen, books, opts.estimateTokens);

  // Remember when each one fired, so sticky and cooldown can be honoured later.
  for (const a of kept) {
    const key = stateKey(a.bookId, a.entry.id);
    const next = { ...(state[key] ?? {}) };
    if (a.entry.sticky > 0) next.sticky = messageCount + a.entry.sticky;
    if (a.entry.cooldown > 0) next.cooldown = messageCount + a.entry.cooldown + a.entry.sticky;
    if (next.sticky || next.cooldown) state[key] = next;
  }

  // Lower order first, so the highest order ends up nearest the model.
  kept.sort((a, b) => a.entry.order - b.entry.order);
  return { entries: kept, state, considered, tokens };
}

/** Only one entry from each inclusion group survives. */
function applyGroups(activated: ActivatedEntry[], random: () => number): ActivatedEntry[] {
  const groups = new Map<string, ActivatedEntry[]>();
  const ungrouped: ActivatedEntry[] = [];

  for (const a of activated) {
    const name = a.entry.group.trim();
    if (!name) ungrouped.push(a);
    else groups.set(name, [...(groups.get(name) ?? []), a]);
  }

  const winners: ActivatedEntry[] = [];
  for (const members of groups.values()) {
    if (members.length === 1) {
      winners.push(members[0]);
      continue;
    }
    // A member asking to be prioritised turns the draw into highest-order-wins.
    const prioritised = members.filter((m) => m.entry.prioritizeInclusion);
    if (prioritised.length) {
      winners.push(prioritised.reduce((best, m) => (m.entry.order > best.entry.order ? m : best)));
      continue;
    }
    const total = members.reduce((n, m) => n + Math.max(0, m.entry.groupWeight), 0);
    let roll = random() * (total || members.length);
    let winner = members[0];
    for (const m of members) {
      roll -= Math.max(0, m.entry.groupWeight) || 1;
      if (roll < 0) {
        winner = m;
        break;
      }
    }
    winners.push(winner);
  }
  return [...ungrouped, ...winners];
}

/**
 * Fill the token budget in priority order: constants first, then entries the
 * conversation named itself, then by insertion order.
 */
function applyBudget(
  activated: ActivatedEntry[],
  books: Lorebook[],
  estimateTokens: (text: string) => number,
): { kept: ActivatedEntry[]; tokens: number } {
  const budget = Math.min(...books.map((b) => b.budget).filter((b) => b > 0), Number.MAX_SAFE_INTEGER);
  const ranked = [...activated].sort((a, b) => {
    const constant = Number(b.entry.mode === 'constant') - Number(a.entry.mode === 'constant');
    if (constant) return constant;
    if (a.pass !== b.pass) return a.pass - b.pass; // named in the chat beats named by another entry
    return b.entry.order - a.entry.order;
  });

  const kept: ActivatedEntry[] = [];
  let tokens = 0;
  for (const a of ranked) {
    const cost = estimateTokens(a.entry.content);
    if (budget && tokens + cost > budget) continue; // skip it, but a smaller one may still fit
    tokens += cost;
    kept.push(a);
  }
  return { kept, tokens };
}
