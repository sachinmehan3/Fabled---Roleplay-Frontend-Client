// Reading a SillyTavern World Info / lorebook export.
//
// Their file is `{ entries: { "0": {...}, "1": {...} } }`, with numbers where we
// use names. Anything unrecognised falls back to our own defaults.
import { EMPTY_ENTRY, type EntryPosition, type EntryRole, type LoreEntry, type Lorebook, type SecondaryLogic } from './lorebook.ts';

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
    entries = rawEntries.map((e, i) =>
      // One of our own exports already has the right shape.
      e && typeof e === 'object' && 'mode' in e
        ? { ...EMPTY_ENTRY, ...(e as LoreEntry), id: String((e as LoreEntry).id ?? `e-${i}`) }
        : importEntry(e as Record<string, unknown>, i),
    );
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
    scanDepth: num(obj.scanDepth, 4),
    caseSensitive: bool(obj.caseSensitive),
    matchWholeWords: bool(obj.matchWholeWords, true),
    maxRecursionSteps: num(obj.maxRecursionSteps, 2),
    budget: num(obj.budget, 1024),
    entries,
  };
}
