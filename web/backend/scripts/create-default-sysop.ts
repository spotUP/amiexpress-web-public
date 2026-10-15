#!/usr/bin/env tsx
/**
 * Create or reset default sysop user
 * Username: sysop
 * Password: sysop
 *
 * SECURITY WARNING: Change password immediately after first login!
 */

import Database from 'better-sqlite3';
import * as bcrypt from 'bcryptjs';
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

// Check if sysop exists (use actual column names: passwordhash, seclevel)
const existing = db.prepare('SELECT id, username, seclevel FROM users WHERE username = ?').get('sysop') as any;

// Hash the default password
const passwordHash = bcrypt.hashSync('sysop', 10);

if (existing) {
  console.log(`[Setup] Sysop user exists (ID: ${existing.id}, Level: ${existing.seclevel})`);
  console.log('[Setup] Resetting password to "sysop"...');

  // Update password and ensure high security level (use actual column names)
  db.prepare(`
    UPDATE users
    SET passwordhash = ?,
        seclevel = CASE WHEN seclevel < 200 THEN 255 ELSE seclevel END,
        updated = strftime('%s', 'now')
    WHERE username = ?
  `).run(passwordHash, 'sysop');

  const updated = db.prepare('SELECT id, username, seclevel FROM users WHERE username = ?').get('sysop') as any;
  console.log(`[Setup] ✓ Sysop password reset (Level: ${updated.seclevel})`);
} else {
  console.log('[Setup] Creating new sysop user...');

  // Create new sysop user (use actual column names)
  const uuid = require('crypto').randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const result = db.prepare(`
    INSERT INTO users (
      id, username, passwordhash, email, realname, location,
      seclevel, timelimit, created, updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuid,
    'sysop',
    passwordHash,
    'sysop@localhost',
    'System Operator',
    'The BBS',
    255,  // Maximum security level
    -1,   // Unlimited time (-1 in AmiExpress schema)
    now,
    now
  );

  console.log(`[Setup] ✓ Sysop user created (ID: ${uuid})`);
}

// Verify
const sysop = db.prepare('SELECT id, username, seclevel, created FROM users WHERE username = ?').get('sysop') as any;

console.log('\n=== Sysop User ===');
console.log(`ID: ${sysop.id}`);
console.log(`Username: ${sysop.username}`);
console.log(`Password: sysop`);
console.log(`Security Level: ${sysop.seclevel}`);
console.log(`Created: ${new Date(sysop.created * 1000).toISOString()}`);
console.log('\n⚠️  CHANGE PASSWORD IMMEDIATELY AFTER FIRST LOGIN!\n');

db.close();

console.log('[Setup] Complete');
process.exit(0);
