import * as schema from './schema';
import * as schema2 from './schema2';
import { createIndexes } from './indexes';
import { EMOJIS_TABLE, DEFAULT_EMOJIS } from './emojis';

/** Default channels */
const DEFAULTS = [
  { id: 'general', name: 'general', display: 'General', topic: 'Welcome!' },
  { id: 'random', name: 'random', display: 'Random', topic: 'Off-topic' },
  { id: 'help', name: 'help', display: 'Help', topic: 'Get help' },
  { id: 'system', name: 'system', display: 'System', topic: 'Events' }
];

/** Run all migrations */
export async function migrate(db: any): Promise<void> {
  await db.exec(schema.CHANNELS_TABLE);
  await db.exec(schema.MEMBERS_TABLE);
  await db.exec(schema.MESSAGES_TABLE);
  await db.exec(schema.REACTIONS_TABLE);
  await db.exec(schema2.PINNED_TABLE);
  await db.exec(schema2.PRESENCE_TABLE);
  await db.exec(schema2.PREFS_TABLE);
  await db.exec(schema2.EVENTS_TABLE);
  await db.exec(schema2.INVITES_TABLE);
  await db.exec(EMOJIS_TABLE);
  await createIndexes(db);
  for (const ch of DEFAULTS) {
    await db.run(
      `INSERT OR IGNORE INTO chat_channels (id, name, display_name, topic, type, category)
       VALUES (?, ?, ?, ?, 'public', 'Public')`,
      [ch.id, ch.name, ch.display, ch.topic]
    );
  }
  for (const e of DEFAULT_EMOJIS) {
    await db.run(
      `INSERT OR IGNORE INTO chat_custom_emojis (code, name, ascii_art) VALUES (?, ?, ?)`,
      [e.code, e.name, e.ascii]
    );
  }
}
