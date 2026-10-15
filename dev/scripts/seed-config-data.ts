#!/usr/bin/env node

/**
 * Seed Configuration Data
 *
 * Populates the configuration tables with initial data based on existing
 * BBS data and scanned door directories.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../web/backend/data/amiexpress.db');
const DOORS_PATH = path.join(__dirname, '../../web/backend/src/doors');

const db = new Database(DB_PATH);

console.log('🌱 Seeding configuration data...\n');

// ===== SEED CONFERENCES =====
console.log('→ Seeding conference configurations...');

// Get existing conferences from conferences table
const existingConferences = db.prepare('SELECT * FROM conferences').all();

if (existingConferences.length > 0) {
  const insertConf = db.prepare(`
    INSERT OR IGNORE INTO conference_config (
      conference_id, ndirs, dlpath_1, ulpath_1,
      min_access_level, max_access_level,
      force_newscan, no_newscan, show_new_files, no_new_files,
      free_downloads, exclude_ftp, private_conf, read_only,
      menu_prompt, confdb_shared,
      use_username, use_realname, use_internetname
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const conf of existingConferences) {
    insertConf.run(
      conf.id,
      1, // ndirs
      `/data/conferences/conf${String(conf.id).padStart(2, '0')}/files`,
      `/data/conferences/conf${String(conf.id).padStart(2, '0')}/uploads`,
      10, // min_access_level
      255, // max_access_level
      0, // force_newscan
      0, // no_newscan
      0, // show_new_files
      0, // no_new_files
      0, // free_downloads
      0, // exclude_ftp
      0, // private_conf
      0, // read_only
      '', // menu_prompt
      0, // confdb_shared
      1, // use_username (default to true)
      0, // use_realname
      0  // use_internetname
    );
    console.log(`   ✓ Conference ${conf.id}: ${conf.name}`);
  }
}

const confCount = db.prepare('SELECT COUNT(*) as count FROM conference_config').get();
console.log(`   Total conferences: ${confCount.count}\n`);

// ===== SEED DOORS =====
console.log('→ Seeding door configurations...');

// Scan doors directory
const doorDirs = fs.existsSync(DOORS_PATH)
  ? fs.readdirSync(DOORS_PATH, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
  : [];

console.log(`   Found ${doorDirs.length} door directories`);

const insertDoor = db.prepare(`
  INSERT OR IGNORE INTO doors (
    door_name, door_command, door_path, door_type,
    min_security_level, time_limit, enabled, description
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let doorsAdded = 0;

// Add discovered doors
const doorDefinitions = {
  'bbslink': ['BBSLink', 'BBSLINK', 'BBSCMD', 'Play InterBBS games via BBSLink.net'],
  'bbslink-wall': ['BBSLink Wall', 'BBSLINKWALL', 'BBSCMD', 'View BBSLink graffiti wall'],
  'discord-announce': ['Discord Announce', 'DANNOUNCE', 'BBSCMD', 'Announce logins to Discord'],
  'gwall': ['Global Wall', 'GWALL', 'BBSCMD', 'Write on the global graffiti wall'],
  'telnet-connect': ['Telnet Door', 'TELNET', 'BBSCMD', 'Connect to other BBSes via telnet'],
  'telnet-front': ['Telnet Front', 'TFRONT', 'BBSCMD', 'Telnet frontend door'],
  'mrc': ['MRC Chat', 'MRC', 'BBSCMD', 'Multi-Relay Chat network'],
  'glc-viewer': ['GLC Viewer', 'GLC', 'BBSCMD', 'View GLC (Graffiti Lounge Chat) messages'],
  'whosonline': ['Who\'s Online', 'WHO', 'BBSCMD', 'See who is currently online'],
  'tetris': ['Tetris', 'TETRIS', 'BBSCMD', 'Classic Tetris game'],
  'hello-world': ['Hello World', 'HELLO', 'BBSCMD', 'Simple test door'],
};

for (const doorDir of doorDirs) {
  const def = doorDefinitions[doorDir];
  if (def) {
    const [name, command, type, description] = def;
    insertDoor.run(
      name,
      command,
      `/doors/${doorDir}`,
      type,
      10, // min_security_level
      60, // time_limit
      1, // enabled
      description
    );
    console.log(`   ✓ Door: ${name} (/${command})`);
    doorsAdded++;
  }
}

// Add some example doors
const exampleDoors = [
  ['RTW - Rise to the World', 'RTW', '/doors/rtw/rtw', 'BBSCMD', 10, 120, 1, 'Classic BBS strategy game'],
  ['Top Ten List', 'TOPTEN', '/doors/topten/topten', 'BBSCMD', 10, 30, 1, 'View top 10 users'],
  ['User Statistics', 'USTATS', '/doors/ustats/ustats', 'BBSCMD', 10, 30, 1, 'View detailed user statistics'],
];

for (const door of exampleDoors) {
  insertDoor.run(...door);
  console.log(`   ✓ Door: ${door[0]} (/${door[1]})`);
  doorsAdded++;
}

const doorCount = db.prepare('SELECT COUNT(*) as count FROM doors').get();
console.log(`   Total doors: ${doorCount.count}\n`);

// ===== SEED LANGUAGES =====
console.log('→ Seeding language configurations...');

const insertLang = db.prepare(`
  INSERT OR IGNORE INTO languages (
    language_number, title, language_code, file_path, enabled
  ) VALUES (?, ?, ?, ?, ?)
`);

const languages = [
  [1, 'English', 'en', '/data/languages/english.txt', 1],
  [2, 'Español', 'es', '/data/languages/spanish.txt', 0],
  [3, 'Français', 'fr', '/data/languages/french.txt', 0],
  [4, 'Deutsch', 'de', '/data/languages/german.txt', 0],
];

for (const lang of languages) {
  insertLang.run(...lang);
  console.log(`   ✓ Language ${lang[0]}: ${lang[1]} (${lang[2]})`);
}

const langCount = db.prepare('SELECT COUNT(*) as count FROM languages').get();
console.log(`   Total languages: ${langCount.count}\n`);

// ===== SEED PROTOCOLS =====
console.log('→ Seeding transfer protocol configurations...');

const insertProto = db.prepare(`
  INSERT OR IGNORE INTO protocols (
    protocol_name, protocol_code, command, upload_command, download_command,
    batch_upload, batch_download, enabled
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const protocols = [
  ['ASCII', 'A', 'ascii', '', '', 0, 0, 1],
  ['XMODEM', 'X', 'xmodem', 'sx {file}', 'rx {file}', 0, 0, 1],
  ['YMODEM', 'Y', 'ymodem', 'sb {file}', 'rb {file}', 1, 1, 1],
  ['ZMODEM', 'Z', 'zmodem', 'sz {file}', 'rz {file}', 1, 1, 1],
];

for (const proto of protocols) {
  insertProto.run(...proto);
  console.log(`   ✓ Protocol: ${proto[0]} (${proto[1]})${proto[4] || proto[5] ? ' [BATCH]' : ''}`);
}

const protoCount = db.prepare('SELECT COUNT(*) as count FROM protocols').get();
console.log(`   Total protocols: ${protoCount.count}\n`);

// ===== SUMMARY =====
console.log('[OK] Configuration seeding complete!');
console.log(`   Conferences: ${confCount.count}`);
console.log(`   Doors: ${doorCount.count}`);
console.log(`   Languages: ${langCount.count}`);
console.log(`   Protocols: ${protoCount.count}`);

db.close();
