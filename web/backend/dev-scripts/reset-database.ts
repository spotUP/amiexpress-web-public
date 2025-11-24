#!/usr/bin/env node
/**
 * Database Reset Script
 * Clears all data from the database to allow re-initialization with correct IDs
 */

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

async function resetDatabase() {
  const dbPath = process.env.DATABASE_DIR 
    ? path.join(process.env.DATABASE_DIR, process.env.DATABASE_FILE || 'amiexpress.db')
    : path.join(__dirname, '..', 'data', 'amiexpress.db');

  const db = new Database(dbPath);

  try {
    console.log('🔄 Resetting database...');

    // Delete data in correct order (respecting foreign keys)
    db.prepare('DELETE FROM file_entries').run();
    console.log('  ✓ Cleared file_entries');

    db.prepare('DELETE FROM messages').run();
    console.log('  ✓ Cleared messages');

    db.prepare('DELETE FROM sessions').run();
    console.log('  ✓ Cleared sessions');

    db.prepare('DELETE FROM node_sessions').run();
    console.log('  ✓ Cleared node_sessions');

    db.prepare('DELETE FROM file_areas').run();
    console.log('  ✓ Cleared file_areas');

    db.prepare('DELETE FROM message_bases').run();
    console.log('  ✓ Cleared message_bases');

    db.prepare('DELETE FROM conferences').run();
    console.log('  ✓ Cleared conferences');

    db.prepare('DELETE FROM users WHERE username != ?').run('sysop');
    console.log('  ✓ Cleared non-sysop users');

    console.log('[OK] Database reset complete!');
    console.log('   Restart the backend to re-initialize with correct IDs');

  } catch (error) {
    console.error('[ERROR] Error resetting database:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

resetDatabase();
