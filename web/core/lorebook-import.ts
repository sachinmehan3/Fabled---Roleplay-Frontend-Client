// Reading a SillyTavern World Info / lorebook export.
//
// Their file is `{ entries: { "0": {...}, "1": {...} } }`, with numbers where we
// use names. Anything unrecognised falls back to our own defaults.
import type { EntryPosition, EntryRole, LoreEntry, Lorebook, SecondaryLogic } from '../types.ts';
import { EMPTY_ENTRY } from './lorebook.ts';

const LOGIC: Record<number, SecondaryLogic> = { 0: 'and_any', 1: 'not_all', 2: 'not_any', 3: 'and_all' };
// 0/1 are before and after the character; 2 and 3 are Author's Note, which we
// do not have, so they land after the character instead. 4 is a chat depth.
const POSITION: Record<number, EntryPosition> = {
  0: 'before_char',
  1: 'after_char',
  2: 'after_char',
  3: 'after_char',
  4: 'at_depth',
};
const ROLE: Record<number, EntryRole> = { 0: 'system', 1: 'user', 2: 'assistant' };

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback = false) => (typeof v === 'boolean' ? v : fallback);
/** SillyTavern writes null for "use the book's setting". */
const tri = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

/**
 * A Character Card V2 book entry, as Chub and the card spec write them. The
 * field names differ from SillyTavern's own export, and the extras SillyTavern
 * cares about ride along in `extensions` under either naming convention.
 */
function importV2Entry(raw: Record<string, unknown>, index: number): LoreEntry {
  const ext = (raw.extensions && typeof raw.extensions === 'object' ? raw.extensions : {}) as Record<string, unknown>;
  const pick = (...names: string[]) => names.map((n) => ext[n]).find((v) => v !== undefined);

  const position = pick('position');
  const fromNumber = typeof position === 'number' ? POSITION[position] : undefined;
  const fromString = raw.position === 'before_char' || raw.position === 'after_char' ? raw.position : undefined;

  const probability = num(pick('probability'), 100);
  const useProbability = pick('useProbability', 'use_probability');

  return {
    ...EMPTY_ENTRY,
    id: raw.id !== undefined ? `v2-${raw.id}` : `v2-${index}`,
    title: typeof raw.comment === 'string' ? raw.comment : typeof raw.name === 'string' ? raw.name : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    enabled: raw.enabled !== false,
    mode: bool(raw.constant) ? 'constant' : 'selective',
    keys: strings(raw.keys),
    secondaryKeys: strings(raw.secondary_keys),
    logic: LOGIC[num(pick('selectiveLogic', 'selective_logic'), 0)] ?? 'and_any',
    position: fromNumber ?? fromString ?? 'after_char',
    depth: num(pick('depth'), 4),
    role: ROLE[num(pick('role'), 0)] ?? 'system',
    // insertion_order is the V2 name; priority is a budget hint, not an order.
    order: num(raw.insertion_order, 100),
    caseSensitive: tri(raw.case_sensitive ?? pick('case_sensitive', 'caseSensitive')),
    matchWholeWords: tri(pick('match_whole_words', 'matchWholeWords')),
    scanDepth: typeof pick('scan_depth', 'scanDepth') === 'number' ? (pick('scan_depth', 'scanDepth') as number) : null,
    probability: useProbability === false ? 100 : probability,
    group: typeof pick('group') === 'string' ? (pick('group') as string) : '',
    groupWeight: num(pick('group_weight', 'groupWeight'), 100),
    prioritizeInclusion: bool(pick('group_override', 'groupOverride')),
    excludeRecursion: bool(pick('exclude_recursion', 'excludeRecursion')),
    preventRecursion: bool(pick('prevent_recursion', 'preventRecursion')),
    delayUntilRecursion: Boolean(pick('delay_until_recursion', 'delayUntilRecursion')),
    sticky: num(pick('sticky'), 0),
    cooldown: num(pick('cooldown'), 0),
    delay: num(pick('delay'), 0),
  };
}

function importEntry(raw: Record<string, unknown>, index: number): LoreEntry {
  const constant = bool(raw.constant);
  return {
    ...EMPTY_ENTRY,
    id: typeof raw.uid === 'number' || typeof raw.uid === 'string' ? `st-${raw.uid}` : `st-${index}`,
    title: typeof raw.comment === 'string' ? raw.comment : '',
    content: typeof raw.content === 'string' ? raw.content : '',
    enabled: !bool(raw.disable),
    mode: constant ? 'constant' : 'selective',
    keys: strings(raw.key),
    secondaryKeys: strings(raw.keysecondary),
    logic: LOGIC[num(raw.selectiveLogic, 0)] ?? 'and_any',
    position: POSITION[num(raw.position, 1)] ?? 'after_char',
    depth: num(raw.depth, 4),
    role: ROLE[num(raw.role, 0)] ?? 'system',
    order: num(raw.order, 100),
    caseSensitive: tri(raw.caseSensitive),
    matchWholeWords: tri(raw.matchWholeWords),
    scanDepth: typeof raw.scanDepth === 'number' ? raw.scanDepth : null,
    // A trigger percent only applies when the entry asked for one.
    probability: bool(raw.useProbability, true) ? num(raw.probability, 100) : 100,
    group: typeof raw.group === 'string' ? raw.group : '',
    groupWeight: num(raw.groupWeight, 100),
    prioritizeInclusion: bool(raw.groupOverride),
    excludeRecursion: bool(raw.excludeRecursion),
    preventRecursion: bool(raw.preventRecursion),
    delayUntilRecursion: Boolean(raw.delayUntilRecursion),
    sticky: num(raw.sticky, 0),
    cooldown: num(raw.cooldown, 0),
    delay: num(raw.delay, 0),
  };
}

/** Parse an exported book. Throws if the file is not one. */
export function importLorebook(raw: unknown, fallbackName: string): Omit<Lorebook, 'id' | 'created_at'> {
  if (!raw || typeof raw !== 'object') throw new Error('That file is not a lorebook');
  const obj = raw as Record<string, unknown>;

  // Ours round-trips as-is; theirs keeps entries in an object keyed by number.
  const rawEntries = obj.entries;
  let entries: LoreEntry[];
  if (Array.isArray(rawEntries)) {
    entries = rawEntries.map((e, i) => {
      const obj = (e ?? {}) as Record<string, unknown>;
      // One of our own exports already has the right shape.
      if ('mode' in obj) return { ...EMPTY_ENTRY, ...(obj as unknown as LoreEntry), id: String(obj.id ?? `e-${i}`) };
      // A Character Card V2 book says `keys`; SillyTavern says `key`.
      if (Array.isArray(obj.keys) || 'insertion_order' in obj) return importV2Entry(obj, i);
      return importEntry(obj, i);
    });
  } else if (rawEntries && typeof rawEntries === 'object') {
    entries = Object.values(rawEntries as Record<string, unknown>).map((e, i) =>
      importEntry((e ?? {}) as Record<string, unknown>, i),
    );
  } else {
    throw new Error('That file has no entries');
  }

  entries = entries.filter((e) => e.content.trim() || e.keys.length);
  if (!entries.length) throw new Error('That lorebook is empty');

  return {
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : fallbackName,
    enabled: true,
    characterIds: [],
    // Book-level settings under both our names and the V2 spec's.
    scanDepth: num(obj.scanDepth ?? obj.scan_depth, 4),
    caseSensitive: bool(obj.caseSensitive ?? obj.case_sensitive),
    matchWholeWords: bool(obj.matchWholeWords ?? obj.match_whole_words, true),
    maxRecursionSteps: num(obj.maxRecursionSteps, obj.recursive_scanning === false ? 1 : 2),
    budget: num(obj.budget ?? obj.token_budget, 1024),
    entries,
  };
}
