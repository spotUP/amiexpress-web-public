#!/usr/bin/env node

/**
 * Database Migration: Add 6 New Configuration Categories
 *
 * Phase 1 - Add missing configuration categories from Amiga config app:
 * 1. Security (TOOLTYPE_ACCESS) - Per-level ACS flags
 * 2. Server (Extend system_config) - Network services + password security
 * 3. Drives (TOOLTYPE_DRIVES) - Drive list
 * 4. Computers (TOOLTYPE_COMPUTERLIST) - Computer types
 * 5. Screen Types (TOOLTYPE_SCREENTYPES) - Terminal formats
 * 6. File Checkers (TOOLTYPE_FCHECK) - File validation tools
 *
 * References: express.e, reference-boardBBS production config
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../web/backend/data/amiexpress.db');

console.log('🔄 Migrating configuration categories...\\n');

const db = new Database(DB_PATH);

// Get existing tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
const existingTables = new Set(tables.map(t => t.name));

console.log(`→ Found ${existingTables.size} existing tables\\n`);

// ===== 1. EXTEND SYSTEM_CONFIG TABLE =====
console.log('→ Extending system_config table with server settings...');

const systemConfigFields = [
  // SMTP Extended
  { name: 'smtp_username', type: 'TEXT', default: "''", desc: 'SMTP username' },
  { name: 'smtp_password', type: 'TEXT', default: "''", desc: 'SMTP password (encrypted)' },
  { name: 'smtp_ssl', type: 'INTEGER', default: '0', desc: 'Use SSL for SMTP' },
  { name: 'smtp_from_email', type: 'TEXT', default: "''", desc: 'From email address' },
  { name: 'sysop_email', type: 'TEXT', default: "''", desc: 'Sysop email address' },
  { name: 'bbs_email', type: 'TEXT', default: "''", desc: 'BBS email address' },

  // FTP Server
  { name: 'ftp_enabled', type: 'INTEGER', default: '0', desc: 'Enable FTP server' },
  { name: 'ftp_host', type: 'TEXT', default: "'127.0.0.1'", desc: 'FTP host' },
  { name: 'ftp_port', type: 'INTEGER', default: '21', desc: 'FTP port' },
  { name: 'ftp_data_ports', type: 'TEXT', default: "''", desc: 'FTP data ports (comma-separated)' },

  // HTTP Server
  { name: 'http_enabled', type: 'INTEGER', default: '0', desc: 'Enable HTTP server' },
  { name: 'http_host', type: 'TEXT', default: "'localhost'", desc: 'HTTP host' },
  { name: 'http_port', type: 'INTEGER', default: '8080', desc: 'HTTP port' },

  // System Behavior
  { name: 'quiet_join', type: 'INTEGER', default: '0', desc: 'Suppress conference join messages' },
  { name: 'convert_to_mb', type: 'INTEGER', default: '0', desc: 'Convert bytes to MB' },
  { name: 'reg_key', type: 'TEXT', default: "''", desc: 'BBS registration key' }
];

if (existingTables.has('system_config')) {
  const columns = db.prepare("PRAGMA table_info(system_config)").all();
  const existingColumns = new Set(columns.map(c => c.name));

  let added = 0, skipped = 0;

  for (const field of systemConfigFields) {
    if (existingColumns.has(field.name)) {
      console.log(`   ⏭️  ${field.name} - already exists`);
      skipped++;
    } else {
      try {
        const sql = `ALTER TABLE system_config ADD COLUMN ${field.name} ${field.type} DEFAULT ${field.default}`;
        db.exec(sql);
        console.log(`   [OK] ${field.name} - added (${field.desc})`);
        added++;
      } catch (error) {
        console.error(`   [ERROR] ${field.name} - ERROR: ${error.message}`);
      }
    }
  }

  console.log(`   Summary: Added ${added}, Skipped ${skipped}\\n`);
} else {
  console.log('   [WARNING]  system_config table does not exist, skipping\\n');
}

// ===== 2. CREATE SECURITY_LEVEL_ACCESS TABLE =====
console.log('→ Creating security_level_access table (TOOLTYPE_ACCESS)...');

if (existingTables.has('security_level_access')) {
  console.log('   ⏭️  Table already exists\\n');
} else {
  db.exec(`
    CREATE TABLE security_level_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      security_level INTEGER NOT NULL,
      acs_flag TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(security_level, acs_flag)
    )
  `);

  db.exec(`CREATE INDEX idx_security_level_access_level ON security_level_access(security_level)`);
  db.exec(`CREATE INDEX idx_security_level_access_flag ON security_level_access(acs_flag)`);

  console.log('   [OK] Table created with indexes\\n');
}

// ===== 3. CREATE DRIVES TABLE =====
console.log('→ Creating drives table (TOOLTYPE_DRIVES)...');

if (existingTables.has('drives')) {
  console.log('   ⏭️  Table already exists\\n');
} else {
  db.exec(`
    CREATE TABLE drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_number INTEGER NOT NULL UNIQUE,
      drive_path TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`CREATE INDEX idx_drives_number ON drives(drive_number)`);

  console.log('   [OK] Table created with indexes\\n');
}

// ===== 4. CREATE COMPUTER_TYPES TABLE =====
console.log('→ Creating computer_types table (TOOLTYPE_COMPUTERLIST)...');

if (existingTables.has('computer_types')) {
  console.log('   ⏭️  Table already exists\\n');
} else {
  db.exec(`
    CREATE TABLE computer_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      computer_number INTEGER NOT NULL UNIQUE,
      computer_name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`CREATE INDEX idx_computer_types_number ON computer_types(computer_number)`);

  console.log('   [OK] Table created with indexes\\n');
}

// ===== 5. CREATE SCREEN_TYPES TABLE =====
console.log('→ Creating screen_types table (TOOLTYPE_SCREENTYPES)...');

if (existingTables.has('screen_types')) {
  console.log('   ⏭️  Table already exists\\n');
} else {
  db.exec(`
    CREATE TABLE screen_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screen_number INTEGER NOT NULL UNIQUE,
      screen_type TEXT NOT NULL,
      screen_title TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  db.exec(`CREATE INDEX idx_screen_types_number ON screen_types(screen_number)`);

  console.log('   [OK] Table created with indexes\\n');
}

// ===== 6. CREATE FILE_CHECKERS TABLE =====
console.log('→ Creating file_checkers table (TOOLTYPE_FCHECK)...');

if (existingTables.has('file_checkers')) {
  console.log('   ⏭️  Table already exists\\n');
} else {
  db.exec(`
    CREATE TABLE file_checkers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checker_name TEXT NOT NULL,
      checker_path TEXT NOT NULL,
      options TEXT DEFAULT '',
      stack_size INTEGER DEFAULT 4096,
      priority INTEGER DEFAULT 0,
      script_path TEXT,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  console.log('   [OK] Table created\\n');
}

// ===== 7. CREATE FILE_CHECKER_ERRORS TABLE =====
console.log('→ Creating file_checker_errors table...');

if (existingTables.has('file_checker_errors')) {
  console.log('   ⏭️  Table already exists\\n');
} else {
  db.exec(`
    CREATE TABLE file_checker_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_checker_id INTEGER NOT NULL,
      error_number INTEGER NOT NULL,
      error_pattern TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (file_checker_id) REFERENCES file_checkers(id) ON DELETE CASCADE,
      UNIQUE(file_checker_id, error_number)
    )
  `);

  db.exec(`CREATE INDEX idx_file_checker_errors_checker ON file_checker_errors(file_checker_id)`);

  console.log('   [OK] Table created with foreign key and indexes\\n');
}

db.close();

console.log('[OK] Migration complete!\\n');
console.log('📊 Summary:');
console.log('   - Extended system_config with 16 server fields');
console.log('   - Created security_level_access table');
console.log('   - Created drives table');
console.log('   - Created computer_types table');
console.log('   - Created screen_types table');
console.log('   - Created file_checkers table');
console.log('   - Created file_checker_errors table');
console.log('');
console.log('Next steps:');
console.log('   1. Run seed script to populate initial data');
console.log('   2. Update repository layer');
console.log('   3. Update service layer with Zod schemas');
console.log('   4. Create API routes');
console.log('   5. Create React components');
