#!/usr/bin/env tsx
/**
 * Create or reset default sysop user
 * Username: sysop
 * Password: sysop
 *
 * SECURITY WARNING: Change password immediately after first login!
 */

import Database from 'better-sqlite3';
import * as bcrypt from 'bcrypt';
import * as path from 'path';

const DB_PATH = process.env.DATABASE_DIR
  ? path.join(process.env.DATABASE_DIR, process.env.DATABASE_FILE || 'amiexpress.db')
  : path.join(__dirname, '../../data/amiexpress.db');

console.log(`[Setup] Using database: ${DB_PATH}`);

const db = new Database(DB_PATH);

// Ensure users table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email TEXT,
    realName TEXT,
    location TEXT,
    secLevel INTEGER DEFAULT 10,
    timebank INTEGER DEFAULT 0,
    uploads INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    posts INTEGER DEFAULT 0,
    lastCall INTEGER,
    totalCalls INTEGER DEFAULT 0,
    totalTime INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

console.log('[Setup] Database tables verified');

// Check if sysop exists
const existing = db.prepare('SELECT id, username, secLevel FROM users WHERE username = ?').get('sysop') as any;

// Hash the default password
const passwordHash = bcrypt.hashSync('sysop', 10);

if (existing) {
  console.log(`[Setup] Sysop user exists (ID: ${existing.id}, Level: ${existing.secLevel})`);
  console.log('[Setup] Resetting password to "sysop"...');

  // Update password and ensure high security level
  db.prepare(`
    UPDATE users
    SET password = ?,
        secLevel = CASE WHEN secLevel < 200 THEN 200 ELSE secLevel END,
        updated_at = strftime('%s', 'now')
    WHERE username = ?
  `).run(passwordHash, 'sysop');

  const updated = db.prepare('SELECT id, username, secLevel FROM users WHERE username = ?').get('sysop') as any;
  console.log(`[Setup] ✓ Sysop password reset (Level: ${updated.secLevel})`);
} else {
  console.log('[Setup] Creating new sysop user...');

  // Create new sysop user
  const result = db.prepare(`
    INSERT INTO users (
      username, password, email, realName, location,
      secLevel, timebank, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
  `).run(
    'sysop',
    passwordHash,
    'sysop@localhost',
    'System Operator',
    'The BBS',
    255,  // Maximum security level
    999999  // Unlimited time
  );

  console.log(`[Setup] ✓ Sysop user created (ID: ${result.lastInsertRowid})`);
}

// Verify
const sysop = db.prepare('SELECT id, username, secLevel, created_at FROM users WHERE username = ?').get('sysop') as any;

console.log('\n=== Sysop User ===');
console.log(`ID: ${sysop.id}`);
console.log(`Username: ${sysop.username}`);
console.log(`Password: sysop`);
console.log(`Security Level: ${sysop.secLevel}`);
console.log(`Created: ${new Date(sysop.created_at * 1000).toISOString()}`);
console.log('\n⚠️  CHANGE PASSWORD IMMEDIATELY AFTER FIRST LOGIN!\n');

db.close();

console.log('[Setup] Complete');
process.exit(0);
