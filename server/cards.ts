// Character card parsing: Tavern Card V1 / V2 / V3, from PNG or JSON.
// PNG cards store base64-encoded JSON in a tEXt chunk named "ccv3" (V3) or "chara" (V1/V2).

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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPng(buf: Buffer) {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

/** Read all tEXt chunks from a PNG into a keyword -> text map. */
export function readPngText(buf: Buffer): Record<string, string> {
  if (!isPng(buf)) throw new Error('Not a PNG file');
  const out: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buf.length) break;
    if (type === 'tEXt') {
      const data = buf.subarray(dataStart, dataEnd);
      const sep = data.indexOf(0);
      if (sep > 0) out[data.toString('latin1', 0, sep).toLowerCase()] = data.toString('latin1', sep + 1);
    }
    if (type === 'IEND') break;
    offset = dataEnd + 4; // skip CRC
  }
  return out;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Normalize any card spec version into a flat CharacterCard. */
export function normalizeCard(raw: unknown): CharacterCard {
  if (!raw || typeof raw !== 'object') throw new Error('Card JSON is not an object');
  const obj = raw as Record<string, unknown>;
  // V2/V3 keep fields under `data`; V1 keeps them at the top level.
  const d = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const name = str(d.name) || str(obj.name);
  if (!name) throw new Error('Card has no name');
  return {
    name,
    description: str(d.description),
    personality: str(d.personality),
    scenario: str(d.scenario),
    first_mes: str(d.first_mes),
    mes_example: str(d.mes_example),
    system_prompt: str(d.system_prompt),
    post_history_instructions: str(d.post_history_instructions),
    alternate_greetings: strArr(d.alternate_greetings),
    creator_notes: str(d.creator_notes),
    creator: str(d.creator),
    tags: strArr(d.tags),
  };
}

/**
 * V2 and V3 cards may carry a lorebook inside them - cards from Chub usually do.
 * Returned raw, for the lorebook importer to make sense of.
 */
export function extractBook(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const data = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<string, unknown>;
  const book = data.character_book ?? obj.character_book;
  return book && typeof book === 'object' ? book : undefined;
}

/** Parse an uploaded file (PNG card or JSON card). */
export function parseCardFile(buf: Buffer): { card: CharacterCard; png: boolean; book: unknown } {
  if (isPng(buf)) {
    const text = readPngText(buf);
    const encoded = text['ccv3'] ?? text['chara'];
    if (!encoded) throw new Error('PNG has no embedded character data (chara/ccv3 chunk)');
    const json = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    return { card: normalizeCard(json), png: true, book: extractBook(json) };
  }
  const json = JSON.parse(buf.toString('utf8'));
  return { card: normalizeCard(json), png: false, book: extractBook(json) };
}
