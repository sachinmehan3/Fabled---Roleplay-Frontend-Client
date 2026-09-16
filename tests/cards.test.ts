import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isPng, normalizeCard, parseCardFile, readPngText } from '../web/core/cards.ts';

test('a flat V1 card is read from the top level', () => {
  const card = normalizeCard({ name: 'Lyra', description: 'A mapmaker.', first_mes: 'Hello.' });
  assert.equal(card.name, 'Lyra');
  assert.equal(card.description, 'A mapmaker.');
  assert.equal(card.first_mes, 'Hello.');
});

test('a V2/V3 card is read from the data object', () => {
  const card = normalizeCard({
    spec: 'chara_card_v2',
    data: { name: 'Lyra', description: 'A mapmaker.', tags: ['fantasy'], alternate_greetings: ['Hi.'] },
  });
  assert.equal(card.name, 'Lyra');
  assert.deepEqual(card.tags, ['fantasy']);
  assert.deepEqual(card.alternate_greetings, ['Hi.']);
});

test('every field is present even when the card omits it', () => {
  const card = normalizeCard({ name: 'Lyra' });
  assert.deepEqual(card, {
    name: 'Lyra',
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    creator_notes: '',
    creator: '',
    tags: [],
  });
});

test('wrongly typed fields are ignored rather than trusted', () => {
  const card = normalizeCard({
    name: 'Lyra',
    description: 42,
    tags: ['ok', 7, null, 'fine'],
    alternate_greetings: 'not an array',
  });
  assert.equal(card.description, '');
  assert.deepEqual(card.tags, ['ok', 'fine']);
  assert.deepEqual(card.alternate_greetings, []);
});

test('a card without a name is rejected', () => {
  assert.throws(() => normalizeCard({ description: 'no name here' }), /no name/i);
  assert.throws(() => normalizeCard(null), /not an object/i);
  assert.throws(() => normalizeCard('a string'), /not an object/i);
});

test('a JSON card file is parsed', () => {
  const buf = Buffer.from(JSON.stringify({ name: 'Lyra', description: 'From JSON.' }), 'utf8');
  const { card, png } = parseCardFile(buf);
  assert.equal(png, false);
  assert.equal(card.description, 'From JSON.');
});

test('isPng only accepts a real PNG signature', () => {
  assert.equal(isPng(Buffer.from('{"name":"x"}', 'utf8')), false);
  assert.equal(isPng(Buffer.alloc(4)), false);
  assert.equal(isPng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), true);
});

/** Build a PNG carrying tEXt chunks, the way character cards are shipped. */
function pngWithText(entries: Record<string, string>) {
  const chunks: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [key, value] of Object.entries(entries)) {
    const data = Buffer.concat([Buffer.from(key, 'latin1'), Buffer.alloc(1), Buffer.from(value, 'latin1')]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    chunks.push(length, Buffer.from('tEXt', 'ascii'), data, Buffer.alloc(4)); // CRC is never checked
  }
  const end = Buffer.alloc(4);
  chunks.push(end, Buffer.from('IEND', 'ascii'), Buffer.alloc(4));
  return Buffer.concat(chunks);
}

const encode = (card: unknown) => Buffer.from(JSON.stringify(card), 'utf8').toString('base64');

test('tEXt chunks are read back, with keywords lower-cased', () => {
  const text = readPngText(pngWithText({ Chara: 'abc', ccv3: 'def' }));
  assert.equal(text['chara'], 'abc');
  assert.equal(text['ccv3'], 'def');
});

test('a PNG card is decoded from its chara chunk', () => {
  const buf = pngWithText({ chara: encode({ name: 'Lyra', description: 'From PNG.' }) });
  const { card, png } = parseCardFile(buf);
  assert.equal(png, true);
  assert.equal(card.description, 'From PNG.');
});

test('the V3 chunk wins when a card carries both', () => {
  const buf = pngWithText({
    chara: encode({ name: 'Old', description: 'v2' }),
    ccv3: encode({ data: { name: 'New', description: 'v3' } }),
  });
  assert.equal(parseCardFile(buf).card.description, 'v3');
});

test('a PNG with no character data says so', () => {
  assert.throws(() => parseCardFile(pngWithText({ comment: 'just a picture' })), /no embedded character data/i);
});

test('a truncated PNG stops cleanly instead of running off the end', () => {
  const full = pngWithText({ chara: encode({ name: 'Lyra' }) });
  const cut = full.subarray(0, full.length - 12);
  assert.doesNotThrow(() => readPngText(cut));
});

test('the starter character card is valid', (t) => {
  const starter = path.join(process.cwd(), 'samples', 'sable.card.json');
  if (!fs.existsSync(starter)) return t.skip('samples/sable.card.json is not present');
  const { card, png } = parseCardFile(fs.readFileSync(starter));

  assert.equal(png, false);
  assert.equal(card.name, 'Sable Emberwright');
  assert.ok(card.first_mes.length > 0, 'she needs something to open with');
  assert.equal(card.alternate_greetings.length, 2);
  assert.ok(card.mes_example.includes('<START>'));
  assert.ok(card.tags.length > 0);
});

test('the bundled sample card still parses', (t) => {
  const sample = path.join(process.cwd(), 'samples', 'lyra.card.png');
  if (!fs.existsSync(sample)) return t.skip('samples/lyra.card.png is not present');
  const { card, png } = parseCardFile(fs.readFileSync(sample));
  assert.equal(png, true);
  assert.ok(card.name.length > 0);
});

test('a V2 card carrying a lorebook hands it over', () => {
  const buf = Buffer.from(
    JSON.stringify({
      spec: 'chara_card_v2',
      data: {
        name: 'Lyra',
        description: 'A cartographer.',
        character_book: { name: 'The Vale', entries: [{ keys: ['vale'], content: 'A green basin.', enabled: true, insertion_order: 10 }] },
      },
    }),
    'utf8',
  );
  const { card, book } = parseCardFile(buf);
  assert.equal(card.name, 'Lyra');
  assert.ok(book, 'the book should come back with the card');
  assert.equal((book as { name: string }).name, 'The Vale');
});

test('a card without a book hands back nothing', () => {
  const buf = Buffer.from(JSON.stringify({ name: 'Lyra' }), 'utf8');
  assert.equal(parseCardFile(buf).book, undefined);
});
