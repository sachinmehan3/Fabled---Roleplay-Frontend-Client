// Character card parsing: Tavern Card V1 / V2 / V3, from PNG or JSON.
// PNG cards store base64-encoded JSON in a tEXt chunk named "ccv3" (V3) or "chara" (V1/V2).

import type { CharacterCard } from '../types.ts';

export type { CharacterCard } from '../types.ts';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(buf: Uint8Array) {
  return buf.length > 8 && PNG_SIGNATURE.every((b, i) => buf[i] === b);
}

const latin1 = (bytes: Uint8Array) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};

/** Read all tEXt chunks from a PNG into a keyword -> text map. */
export function readPngText(buf: Uint8Array): Record<string, string> {
  if (!isPng(buf)) throw new Error('Not a PNG file');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= buf.length) {
    const length = view.getUint32(offset);
    const type = latin1(buf.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buf.length) break;
    if (type === 'tEXt') {
      const data = buf.subarray(dataStart, dataEnd);
      const sep = data.indexOf(0);
      if (sep > 0) out[latin1(data.subarray(0, sep)).toLowerCase()] = latin1(data.subarray(sep + 1));
    }
    if (type === 'IEND') break;
    offset = dataEnd + 4; // skip CRC
  }
  return out;
}

/** base64 -> UTF-8 text, without Node's Buffer. */
function decodeBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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
export function parseCardFile(buf: Uint8Array): { card: CharacterCard; png: boolean; book: unknown } {
  if (isPng(buf)) {
    const text = readPngText(buf);
    const encoded = text['ccv3'] ?? text['chara'];
    if (!encoded) throw new Error('PNG has no embedded character data (chara/ccv3 chunk)');
    const json = JSON.parse(decodeBase64(encoded));
    return { card: normalizeCard(json), png: true, book: extractBook(json) };
  }
  const json = JSON.parse(new TextDecoder().decode(buf));
  return { card: normalizeCard(json), png: false, book: extractBook(json) };
}
