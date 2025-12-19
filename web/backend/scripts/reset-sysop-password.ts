#!/usr/bin/env tsx
/**
 * Reset sysop password to "sysop"
 * Uses the actual database schema (lowercase column names, TEXT id, passwordhash)
 */

import Database from 'better-sqlite3';
import * as bcrypt from 'bcryptjs';
import * as path from 'path';

const DB_PATH = process.env.DATABASE_DIR
  ? path.join(process.env.DATABASE_DIR, process.env.DATABASE_FILE || 'amiexpress.db')
  : path.join(__dirname, '../../../data/amiexpress.db');

console.log(`[Reset] Using database: ${DB_PATH}`);

const db = new Database(DB_PATH);

// Check current sysop user
const sysop = db.prepare('SELECT id, username, seclevel, passwordhash FROM users WHERE username = ?').get('sysop') as any;

if (!sysop) {
  console.log('[Reset] No sysop user found in database!');
  process.exit(1);
}

console.log(`\n[Reset] Found sysop user:`);
console.log(`  ID: ${sysop.id}`);
console.log(`  Username: ${sysop.username}`);
console.log(`  Security Level: ${sysop.seclevel}`);
console.log(`  Current Password Hash: ${sysop.passwordhash.substring(0, 20)}...`);

// Hash the new password
const newPassword = 'sysop';
const newHash = bcrypt.hashSync(newPassword, 10);

console.log(`\n[Reset] Generating new password hash for "${newPassword}"...`);
console.log(`  New Hash: ${newHash.substring(0, 20)}...`);

// Update the password
db.prepare('UPDATE users SET passwordhash = ? WHERE username = ?').run(newHash, 'sysop');

console.log(`\n[Reset] ✓ Password updated successfully!`);

// Verify it works
const verified = bcrypt.compareSync(newPassword, newHash);
console.log(`[Reset] ✓ Password verification: ${verified ? 'PASS' : 'FAIL'}`);

console.log(`\n=== Login Credentials ===`);
console.log(`Username: sysop`);
console.log(`Password: sysop`);
console.log(`Security Level: ${sysop.seclevel}`);
console.log(`\nYou can now login at http://localhost:3001/admin/`);
console.log(`========================\n`);

db.close();
