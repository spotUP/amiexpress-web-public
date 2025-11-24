#!/usr/bin/env node

/**
 * Database Migration: Add Phase 1 Conference Fields
 *
 * Adds critical conference configuration fields from express.e TOOLTYPE_CONF:
 * - no_newscan, show_new_files, no_new_files
 * - free_downloads, menu_prompt, confdb_shared
 * - use_username, use_realname, use_internetname
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../web/backend/data/amiexpress.db');

console.log('🔄 Migrating conference_config table...\n');

const db = new Database(DB_PATH);

// Get existing columns
const columns = db.prepare("PRAGMA table_info(conference_config)").all();
const existingColumns = new Set(columns.map(c => c.name));

console.log('→ Existing columns:', existingColumns.size);

// Fields to add
const newFields = [
  { name: 'no_newscan', type: 'INTEGER', default: '0', description: 'Disable news scan on join' },
  { name: 'show_new_files', type: 'INTEGER', default: '0', description: 'Show new files on join' },
  { name: 'no_new_files', type: 'INTEGER', default: '0', description: 'Disable new files display' },
  { name: 'free_downloads', type: 'INTEGER', default: '0', description: 'Allow free downloads (no ratio)' },
  { name: 'menu_prompt', type: 'TEXT', default: "''", description: 'Custom menu prompt' },
  { name: 'confdb_shared', type: 'INTEGER', default: '0', description: 'Share database with conf (0=none)' },
  { name: 'use_username', type: 'INTEGER', default: '1', description: 'Use username for posts' },
  { name: 'use_realname', type: 'INTEGER', default: '0', description: 'Use real name for posts' },
  { name: 'use_internetname', type: 'INTEGER', default: '0', description: 'Use internet name for posts' }
];

let added = 0;
let skipped = 0;

for (const field of newFields) {
  if (existingColumns.has(field.name)) {
    console.log(`   ⏭️  ${field.name} - already exists`);
    skipped++;
  } else {
    try {
      const sql = `ALTER TABLE conference_config ADD COLUMN ${field.name} ${field.type} DEFAULT ${field.default}`;
      db.exec(sql);
      console.log(`   [OK] ${field.name} - added (${field.description})`);
      added++;
    } catch (error) {
      console.error(`   [ERROR] ${field.name} - ERROR: ${error.message}`);
    }
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Added: ${added}`);
console.log(`   Skipped: ${skipped}`);
console.log(`   Total: ${newFields.length}`);

db.close();

console.log('\n[OK] Migration complete!');
