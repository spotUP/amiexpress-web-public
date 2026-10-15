#!/usr/bin/env node
/**
 * Verify Config Tables
 *
 * Ensures the SQLite schema contains all tables that the configuration
 * stack relies on before running the API test suite or migrations.
 * Usage: npx ts-node -P dev/scripts/tsconfig.json dev/scripts/verify-config-tables.ts
 */

const fs = require('fs');
const path = require('path');

const betterSqlite3Path = path.join(__dirname, '..', '..', 'web', 'backend', 'node_modules', 'better-sqlite3');
const Database = require(betterSqlite3Path);

const tables = [
  'users',
  'conferences',
  'message_bases',
  'messages',
  'file_areas',
  'file_entries',
  'sessions',
  'bulletins',
  'online_messages',
  'chat_sessions',
  'chat_messages',
  'chat_rooms',
  'chat_room_members',
  'chat_room_messages',
  'node_sessions',
  'flagged_files',
  'command_history',
  'caller_activity',
  'user_stats',
  'mail_stats',
  'conf_base',
  'vote_topics',
  'vote_questions',
  'vote_answers',
  'vote_results',
  'vote_status',
  'daily_stats',
  'user_sessions',
  'webhooks',
  'system_config',
  'node_config',
  'conference_config',
  'doors',
  'system_languages',
  'languages',
  'protocols',
  'security_level_access',
  'drives',
  'computer_types',
  'screen_types',
  'file_checkers',
  'file_checker_errors',
  'config_audit_log'
];

function resolveDatabasePath(): string {
  const dbDir = process.env.DATABASE_DIR || path.join(process.cwd(), 'web/backend/data');
  const dbFile = process.env.DATABASE_FILE || 'amiexpress.db';
  return path.join(dbDir, dbFile);
}

function log(message: string, icon = '[INFO]'): void {
  console.log(`${icon} ${message}`);
}

function main(): void {
  const dbPath = resolveDatabasePath();

  if (!fs.existsSync(dbPath)) {
    log(`Database not found at ${dbPath}`, '[ERROR]');
    log('Please start the backend once to create the database before running this script.', '[ERROR]');
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const missingTables: string[] = [];

  for (const table of tables) {
    const row = db.prepare(
      'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?'
    ).get(table);

    if (!row) {
      missingTables.push(table);
      log(`Missing table: ${table}`, '[ERROR]');
    }
  }

  if (missingTables.length) {
    log(`Schema check failed (${missingTables.length} missing tables).`, '[ERROR]');
    process.exit(1);
  }

  log('All configuration tables exist.', '[OK]');
  process.exit(0);
}

main();
