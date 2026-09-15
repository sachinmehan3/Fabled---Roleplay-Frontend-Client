// One-time import of a data/rp.db left over from the SQLite version of this app.
//
// It runs when rp.db exists and characters.json does not, and only ever reads from
// rp.db - the old file is left in place as a backup and can be deleted by hand.
// Delete this module once your data has moved.
import fs from 'node:fs';
import path from 'node:path';
import {
  DATA_DIR,
  insertChat,
  insertCharacter,
  insertMessage,
  saveSettings,
  saveSwipes,
  updateCharacter,
} from './store.ts';
import type { GenerationMeta } from './store.ts';
import type { CharacterCard } from './cards.ts';

const OLD_DB = path.join(DATA_DIR, 'rp.db');
const CHARACTERS_JSON = path.join(DATA_DIR, 'characters.json');

interface OldCharacter {
  id: number;
  name: string;
  card: string;
  avatar: string | null;
  created_at: number;
}
interface OldChat {
  id: number;
  character_id: number;
  title: string;
  created_at: number;
}
interface OldMessage {
  id: number;
  chat_id: number;
  role: 'user' | 'assistant';
  swipes: string;
  meta: string | null;
  swipe_index: number;
  created_at: number;
}

if (fs.existsSync(OLD_DB) && !fs.existsSync(CHARACTERS_JSON)) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(OLD_DB);

    for (const row of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) {
      try {
        saveSettings({ [row.key]: JSON.parse(row.value) });
      } catch {
        // skip a setting we can't read
      }
    }

    // Old ids are not reused; remember how they map onto the new ones.
    const chatIds = new Map<number, number>();
    for (const c of db.prepare('SELECT * FROM characters ORDER BY id').all() as unknown as OldCharacter[]) {
      const created = insertCharacter(c.name, JSON.parse(c.card) as CharacterCard, c.created_at);
      if (c.avatar) updateCharacter(created.id, { avatar: c.avatar });

      const chats = db
        .prepare('SELECT * FROM chats WHERE character_id = ? ORDER BY id')
        .all(c.id) as unknown as OldChat[];
      for (const chat of chats) {
        const newChat = insertChat(created.id, chat.title, chat.created_at);
        chatIds.set(chat.id, newChat.id);
        const messages = db
          .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id')
          .all(chat.id) as unknown as OldMessage[];
        for (const m of messages) {
          const swipes = JSON.parse(m.swipes) as string[];
          const meta = m.meta ? (JSON.parse(m.meta) as (GenerationMeta | null)[]) : [];
          const saved = insertMessage(newChat.id, m.role, swipes, meta, m.created_at);
          // insertMessage always starts at swipe 0; restore the one that was showing.
          if (m.swipe_index) saveSwipes(saved.id, swipes, meta, Math.min(m.swipe_index, swipes.length - 1));
        }
      }
    }

    db.close();
    console.log(`Imported ${OLD_DB} into JSON files. The old database was left untouched.`);
  } catch (e) {
    console.error(`Could not import ${OLD_DB}:`, (e as Error).message);
  }
}
