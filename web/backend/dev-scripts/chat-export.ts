/**
 * Export the BBS in-process chat history to chat-export.json, for import
 * into the door server's /chat/v1 store (federation phase P2).
 *
 * READ-ONLY: the database is opened readonly. Nothing is deleted or changed.
 * Users are mapped from the local user id to "<username>@<BOARD>", the
 * federated handle form. Tables that do not exist on a board are skipped
 * and listed under "missingTables".
 *
 * Usage, from web/backend:
 *   npx tsx dev-scripts/chat-export.ts [out-file] [board-tag]
 * Defaults: out-file chat-export.json, board-tag UPROUGH.
 * Database path: DATABASE_DIR/DATABASE_FILE as dev-scripts/reset-database.ts.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const TABLES = [
  'chat_rooms',
  'chat_room_members',
  'chat_room_messages',
  'chat_message_reactions',
  'chat_room_ops',
  'pinned_messages',
  'chat_dm_threads',
  'chat_dm_participants',
  'chat_dm_messages',
  'room_bans',
  'chat_room_invites',
] as const;

type Row = Record<string, unknown>;

const outFile = process.argv[2] || 'chat-export.json';
const board = process.argv[3] || 'UPROUGH';
const dbPath = process.env.DATABASE_DIR
  ? path.join(process.env.DATABASE_DIR, process.env.DATABASE_FILE || 'amiexpress.db')
  : path.join(__dirname, '..', 'data', 'amiexpress.db');

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const handles = new Map<string, string>();
for (const u of db.prepare('SELECT id, username FROM users').all() as Row[]) {
  handles.set(String(u.id), `${String(u.username)}@${board}`);
}

const out: { board: string; exportedAt: string; users: Record<string, string>; tables: Record<string, Row[]>; missingTables: string[] } = {
  board,
  exportedAt: new Date().toISOString(),
  users: Object.fromEntries(handles),
  tables: {},
  missingTables: [],
};

for (const table of TABLES) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) { out.missingTables.push(table); continue; }
  out.tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as Row[];
}

fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
for (const [t, rows] of Object.entries(out.tables)) console.log(`[OK] ${t}: ${rows.length} rows`);
if (out.missingTables.length) console.log(`[SKIP] missing: ${out.missingTables.join(', ')}`);
console.log(`[OK] wrote ${outFile}`);
