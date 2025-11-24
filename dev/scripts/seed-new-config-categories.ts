#!/usr/bin/env node

/**
 * Seed New Configuration Categories
 *
 * Populates the 6 new configuration tables with express.e defaults and
 * reference-boardBBS production data:
 * 1. Security (security_level_access) - Common ACS flags
 * 2. Server (system_config) - Network service defaults
 * 3. Drives (drives) - Default drive list
 * 4. Computers (computer_types) - Standard computer types
 * 5. Screen Types (screen_types) - Standard terminal formats
 * 6. File Checkers (file_checkers) - Example file checker
 *
 * References: express.e, reference-boardBBS bbsConfig.info, ComputerList.info, ScreenTypes.info
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../web/backend/data/amiexpress.db');
const db = new Database(DB_PATH);

console.log('🌱 Seeding new configuration categories...\\n');

// ===== 1. SEED SECURITY ACCESS FLAGS (TOOLTYPE_ACCESS) =====
console.log('→ Seeding security_level_access table...');

// Common ACS flags from express.e (182 total flags found)
// Seeding essential flags that are most commonly used
const commonACSFlags = [
  // Message System
  { flag: 'READ_MESSAGE', desc: 'Read messages in conference' },
  { flag: 'ENTER_MESSAGE', desc: 'Post messages in conference' },
  { flag: 'READ_BULLETINS', desc: 'Read bulletin files' },
  { flag: 'COMMENT_TO_SYSOP', desc: 'Send comment to sysop' },

  // File System
  { flag: 'DOWNLOAD', desc: 'Download files' },
  { flag: 'UPLOAD', desc: 'Upload files' },
  { flag: 'FILE_LISTINGS', desc: 'View file listings' },
  { flag: 'NEW_FILES_SINCE', desc: 'View new files since date' },
  { flag: 'VIEW_A_FILE', desc: 'View/read text files' },

  // User Management
  { flag: 'EDIT_USER_INFO', desc: 'Edit user information' },
  { flag: 'EDIT_USER_NAME', desc: 'Edit username' },
  { flag: 'EDIT_USER_LOCATION', desc: 'Edit location' },
  { flag: 'EDIT_PHONE_NUMBER', desc: 'Edit phone number' },
  { flag: 'EDIT_PASSWORD', desc: 'Change password' },
  { flag: 'DISPLAY_USER_STATS', desc: 'Display user statistics' },

  // System Access
  { flag: 'PAGE_SYSOP', desc: 'Page sysop for chat' },
  { flag: 'WHO_IS_ONLINE', desc: 'See who is online' },
  { flag: 'JOIN_CONFERENCE', desc: 'Join other conferences' },
  { flag: 'ZIPPY_TEXT_SEARCH', desc: 'Use Zippy text search' },

  // Mail/QWK
  { flag: 'ZOOM_MAIL', desc: 'Use Zoom mail (QWK packets)' },

  // Advanced Features
  { flag: 'TRANSLATION', desc: 'Use translation features' },
  { flag: 'XPR_SEND', desc: 'Use external transfer protocols (send)' },
  { flag: 'XPR_RECEIVE', desc: 'Use external transfer protocols (receive)' },
  { flag: 'MCI_MSG', desc: 'View MCI codes in messages' },

  // System Overrides (express.e:8466-8497)
  { flag: 'OVERRIDE_DEFAULTS', desc: 'Override default access settings' },
  { flag: 'OVERRIDE_TIMELIMIT', desc: 'Override time limit' },
  { flag: 'OVERRIDE_CHATLIMIT', desc: 'Override chat time limit' },
  { flag: 'NO_TIMEOUT', desc: 'No idle timeout' },
  { flag: 'BREAK_CHAT', desc: 'Break out of chat mode' },

  // Conference Accounting
  { flag: 'CONFERENCE_ACCOUNTING', desc: 'Track per-conference statistics' },

  // File Transfer
  { flag: 'SENTBY_FILES', desc: 'Include SENTBY in file descriptions' },
  { flag: 'KEEP_UPLOAD_CREDIT', desc: 'Keep upload credit' },

  // Logging
  { flag: 'DO_CALLERSLOG', desc: 'Write to callers log' },
  { flag: 'DO_UD_LOG', desc: 'Write to upload/download log' },

  // Chat
  { flag: 'DEFAULT_CHAT_ON', desc: 'Chat availability on by default' },

  // Display
  { flag: 'CLEAR_SCREEN_MSG', desc: 'Clear screen before messages' },

  // Censorship
  { flag: 'CENSORED', desc: 'User is censored (private messages only)' }
];

const insertACS = db.prepare(`
  INSERT OR IGNORE INTO security_level_access (
    security_level, acs_flag, enabled, description, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const now = Math.floor(Date.now() / 1000);
let acsCount = 0;

// Seed flags for common security levels (10, 20, 50, 100, 200, 255)
const securityLevels = [10, 20, 50, 100, 200, 255];

for (const level of securityLevels) {
  for (const acs of commonACSFlags) {
    // Level 10 (new users) - restricted access
    let enabled = 1;
    if (level === 10) {
      // New users can't: override settings, page sysop, edit everything
      if (acs.flag.includes('OVERRIDE') || acs.flag === 'PAGE_SYSOP' ||
          acs.flag.includes('EDIT') || acs.flag === 'CENSORED') {
        enabled = 0;
      }
    }

    insertACS.run(level, acs.flag, enabled, acs.desc, now, now);
    acsCount++;
  }
}

console.log(`   ✓ Inserted ${acsCount} ACS flag entries across ${securityLevels.length} security levels\\n`);

// ===== 2. SEED DRIVES (TOOLTYPE_DRIVES) =====
console.log('→ Seeding drives table...');

const insertDrive = db.prepare(`
  INSERT OR IGNORE INTO drives (
    drive_number, drive_path, enabled, description, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

const drives = [
  [1, '/data/drive1', 1, 'Primary data drive'],
  [2, '/data/drive2', 1, 'Secondary data drive'],
];

for (const drive of drives) {
  insertDrive.run(...drive, now, now);
}

console.log(`   ✓ Inserted ${drives.length} drives\\n`);

// ===== 3. SEED COMPUTER TYPES (TOOLTYPE_COMPUTERLIST) =====
console.log('→ Seeding computer_types table...');

const insertComputer = db.prepare(`
  INSERT OR IGNORE INTO computer_types (
    computer_number, computer_name, enabled, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?)
`);

// From reference-boardBBS ComputerList.info
const computers = [
  [1, 'Amiga 500'],
  [2, 'Amiga 2000'],
  [3, 'Amiga 3000'],
  [4, 'Amiga 4000'],
  [5, 'Amiga 1200'],
  [6, 'PC'],
  [7, 'Mac'],
  [8, 'Other'],
];

for (const computer of computers) {
  insertComputer.run(...computer, 1, now, now);
}

console.log(`   ✓ Inserted ${computers.length} computer types\\n`);

// ===== 4. SEED SCREEN TYPES (TOOLTYPE_SCREENTYPES) =====
console.log('→ Seeding screen_types table...');

const insertScreen = db.prepare(`
  INSERT OR IGNORE INTO screen_types (
    screen_number, screen_type, screen_title, enabled, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

// From reference-boardBBS ScreenTypes.info and express.e:31905-31915
const screenTypes = [
  [1, 'AMIGA', 'Amiga ANSI'],
  [2, 'IBM', 'IBM ANSI'],
  [3, 'ASCII', 'ASCII Text'],
  [4, 'PETSCII', 'Commodore PETSCII'],
];

for (const screen of screenTypes) {
  insertScreen.run(...screen, 1, now, now);
}

console.log(`   ✓ Inserted ${screenTypes.length} screen types\\n`);

// ===== 5. SEED FILE CHECKERS (TOOLTYPE_FCHECK) =====
console.log('→ Seeding file_checkers table...');

const insertChecker = db.prepare(`
  INSERT OR IGNORE INTO file_checkers (
    checker_name, checker_path, options, stack_size, priority, script_path, enabled, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const fileCheckers = [
  [
    'Virus Scanner',
    '/usr/bin/clamscan',
    '--no-summary --infected',
    8192,
    0,
    null,
    0  // Disabled by default
  ],
  [
    'Archive Validator',
    '/usr/bin/unzip',
    '-t',
    4096,
    0,
    null,
    0  // Disabled by default
  ],
];

for (const checker of fileCheckers) {
  insertChecker.run(...checker, now, now);
}

console.log(`   ✓ Inserted ${fileCheckers.length} file checkers\\n`);

// ===== 6. EXTEND SYSTEM_CONFIG WITH SERVER DEFAULTS =====
console.log('→ Updating system_config with server defaults...');

const systemConfig = db.prepare('SELECT id FROM system_config WHERE id = 1').get();

if (systemConfig) {
  db.prepare(`
    UPDATE system_config
    SET
      smtp_username = '',
      smtp_password = '',
      smtp_ssl = 0,
      smtp_from_email = '',
      sysop_email = '',
      bbs_email = '',
      ftp_enabled = 0,
      ftp_host = '127.0.0.1',
      ftp_port = 21,
      ftp_data_ports = '',
      http_enabled = 0,
      http_host = 'localhost',
      http_port = 8080,
      quiet_join = 0,
      convert_to_mb = 0,
      reg_key = ''
    WHERE id = 1
  `).run();

  console.log('   ✓ Updated system_config with server defaults\\n');
} else {
  console.log('   [WARNING]  No system_config record found (id=1)\\n');
}

db.close();

console.log('[OK] Seeding complete!\\n');
console.log('📊 Summary:');
console.log(`   - Security access flags: ${acsCount} entries`);
console.log(`   - Drives: ${drives.length} entries`);
console.log(`   - Computer types: ${computers.length} entries`);
console.log(`   - Screen types: ${screenTypes.length} entries`);
console.log(`   - File checkers: ${fileCheckers.length} entries`);
console.log('   - System config: Updated with server defaults');
console.log('');
console.log('Next steps:');
console.log('   1. Update database.ts with CREATE TABLE statements');
console.log('   2. Implement repository layer');
console.log('   3. Implement service layer with Zod schemas');
console.log('   4. Create API routes');
console.log('   5. Create React components');
