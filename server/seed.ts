// A starter character, so a fresh install has someone to talk to.
//
// It is added once, on the very first run, and only when no character file
// exists yet - deleting her is permanent, and an empty shop stays empty.
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, insertCharacter } from './store.ts';
import { normalizeCard } from './cards.ts';

const STARTER_CARD = path.resolve('samples', 'sable.card.json');

export function seedStarterCharacter() {
  if (fs.existsSync(path.join(DATA_DIR, 'characters.json'))) return;
  try {
    if (!fs.existsSync(STARTER_CARD)) return; // fine: the samples folder is optional
    const card = normalizeCard(JSON.parse(fs.readFileSync(STARTER_CARD, 'utf8')));
    insertCharacter(card.name, card);
    console.log(`Added ${card.name} to get you started. Delete her whenever you like.`);
  } catch (e) {
    console.error('Could not add the starter character:', (e as Error).message);
  }
}
