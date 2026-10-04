#!/usr/bin/env npx tsx
/**
 * Reset BBS to Clean State
 *
 * Keeps: spot and sysop users, conference structure
 * Clears: all other users, messages, stats, logs, bulletins
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { toAmigaTime } from '../../web/backend/src/utils/date-time.util';

const BBS_ROOT = '~/Code/amiexpress-web';

/**
 * User record sizes for AmiExpress matching mtop.e struct definitions
 * Based on mtop.e and 68K alignment rules (2-byte boundaries)
 * See Documentation/7-Reference Sources/AmiExpressEDoorSources/MultiTop2/mtop.e
 */
const USER_RECORD_SIZE = 232;     // mtop userData struct
const USERKEYS_RECORD_SIZE = 56;  // mtop userKeys struct
const USERMISC_RECORD_SIZE = 248; // mtop userMisc struct

console.log('=== BBS Clean Reset Script ===\n');

// 1. Backup current data
const backupDir = path.join(BBS_ROOT, 'backup-' + new Date().toISOString().split('T')[0]);
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log(`[OK] Created backup directory: ${backupDir}`);
}

// Backup key files
const filesToBackup = [
  'User.data', 'User.keys', 'user.data', 'user.keys', 'user.misc',
  'data/amiexpress.db', 'web/backend/data/amiexpress.db'
];

for (const file of filesToBackup) {
  const src = path.join(BBS_ROOT, file);
  if (fs.existsSync(src)) {
    const dest = path.join(backupDir, file.replace(/\//g, '_'));
    fs.copyFileSync(src, dest);
    console.log(`[OK] Backed up: ${file}`);
  }
}

// 2. Create fresh User.data with just spot and sysop
console.log('\n--- Resetting User Files ---');

/**
 * Create a user record matching mtop.e userData struct with 68K alignment
 * Written sequentially to ensure correct struct layout (232 bytes)
 */
function createUserRecord(
  username: string,
  slotNumber: number,
  locationStr: string,
  accessLevel: number,
  uploads: number,
  downloads: number,
  uploadBytes: number,
  downloadBytes: number
): Buffer {
  const record = Buffer.alloc(USER_RECORD_SIZE, 0);
  let offset = 0;

  // Helper functions for sequential writing
  const writeString = (str: string, len: number): void => {
    record.write(str.substring(0, len - 1), offset, 'ascii');
    offset += len;
  };
  const writeInt16 = (val: number): void => {
    record.writeInt16BE(val, offset);
    offset += 2;
  };
  const writeInt32 = (val: number): void => {
    record.writeInt32BE(val, offset);
    offset += 4;
  };
  const writePadding = (bytes: number): void => {
    offset += bytes;
  };

  // express.e getSystemTime() (MiscFuncs.e:463-469): local wall clock + 21600.
  const amigaTime = toAmigaTime(new Date());

  // Structure layout matching mtop.e userData (232 bytes):
  writeString(username, 31);          // name[31]
  writeString('', 9);                 // pass[9] - legacy (unused)
  writeString(locationStr, 30);       // location[30]
  writeString('000-000-0000', 13);    // phoneNumber[13]
  writePadding(1);                    // padding for INT alignment
  writeInt16(slotNumber);             // slotNumber
  writeInt16(accessLevel);            // secStatus
  writeInt16(0);                      // secBoard
  writeInt16(0);                      // secLibrary
  writeInt16(0);                      // secBulletin
  writeInt16(0);                      // messagesPosted
  writeInt32(amigaTime);              // newSinceDate
  writeInt32(0);                      // pwdHash (legacy)
  writeInt32(0);                      // confRead2
  writeInt32(0);                      // confRead3
  writeInt16(0);                      // zoomType
  writeInt16(0);                      // unknown
  writeInt16(0);                      // unknown2
  writeInt16(0);                      // unknown3
  writeInt16(0);                      // xferProtocol
  writeInt16(0);                      // filler2
  writeInt16(0);                      // lcFiles
  writeInt16(0);                      // badFiles
  writeInt32(amigaTime);              // accountDate
  writeInt16(0);                      // screenType
  writeInt16(0);                      // editorType
  writeString('', 10);                // conferenceAccess[10]
  writeInt16(uploads);                // uploads
  writeInt16(downloads);              // downloads
  writeInt16(1);                      // confRJoin
  writeInt16(100);                    // timesCalled
  writeInt32(amigaTime);              // timeLastOn
  writeInt32(0);                      // timeUsed
  writeInt32(60);                     // timeLimit
  writeInt32(60);                     // timeTotal
  writeInt32(downloadBytes);          // bytesDownload
  writeInt32(uploadBytes);            // bytesUpload
  writeInt32(0);                      // dailyBytesLimit
  writeInt32(0);                      // dailyBytesDld
  record.writeUInt8(0, offset++);     // expert
  writePadding(1);                    // padding for LONG alignment
  writeInt32(0);                      // chatRemain
  writeInt32(0);                      // chatLimit
  writeInt32(0);                      // creditDays
  writeInt32(0);                      // creditAmount
  writeInt32(0);                      // creditStartDate
  writeInt32(0);                      // creditTotalToDate
  writeInt32(0);                      // creditTotalDate
  record.writeUInt8(0, offset++);     // creditTracking
  record.writeUInt8(0, offset++);     // translatorID
  writeInt16(0);                      // msgBaseRJoin
  writeInt32(0);                      // confYM9
  writeInt32(0);                      // todaysBytesLimit/beginLogCall
  record.writeUInt8(0, offset++);     // protocol
  record.writeUInt8(0, offset++);     // uucpa
  record.writeUInt8(80, offset++);    // lineLength (default 80)
  record.writeUInt8(0, offset++);     // newUser

  if (offset !== USER_RECORD_SIZE) {
    console.warn(`[WARN] User record size mismatch: ${offset} bytes, expected ${USER_RECORD_SIZE}`);
  }

  return record;
}

// Create spot user (access 255 = sysop)
const spotRecord = createUserRecord(
  'spot',
  1,           // slot number (1-based)
  'Local',
  255,         // access level
  10,          // uploads
  5,           // downloads
  1024000,     // upload bytes (1MB)
  512000       // download bytes (500KB)
);

// Create sysop user (access 255 = sysop)
const sysopRecord = createUserRecord(
  'sysop',
  2,           // slot number (1-based)
  'Server Room',
  255,         // access level
  50,          // uploads
  25,          // downloads
  5120000,     // upload bytes (5MB)
  2560000      // download bytes (2.5MB)
);

// Write User.data
const userDataBuffer = Buffer.concat([spotRecord, sysopRecord]);
fs.writeFileSync(path.join(BBS_ROOT, 'User.data'), userDataBuffer);
fs.writeFileSync(path.join(BBS_ROOT, 'user.data'), userDataBuffer);
console.log('[OK] Created User.data with spot and sysop (2 users)');

/**
 * Create a userKeys record matching mtop.e userKeys struct (56 bytes)
 * Layout with 68K alignment:
 * - userName[31] = 31 bytes
 * - [1 byte padding]
 * - number = 4 bytes (LONG)
 * - newUser = 1 byte
 * - [1 byte padding]
 * - oldUpCPS = 2 bytes (INT)
 * - oldDnCPS = 2 bytes (INT)
 * - userFlags = 2 bytes (INT)
 * - baud = 2 bytes (INT)
 * - upCPS2 = 4 bytes (LONG)
 * - dnCPS2 = 4 bytes (LONG)
 * - timesOnToday = 2 bytes (INT)
 * Total: 56 bytes
 */
function createUserKey(username: string, slot: number): Buffer {
  const key = Buffer.alloc(USERKEYS_RECORD_SIZE, 0);
  let offset = 0;

  // userName[31]
  key.write(username.substring(0, 30), offset, 'ascii');
  offset += 31;
  // padding for LONG alignment
  offset += 1;
  // number (slot number, 1-based)
  key.writeInt32BE(slot, offset);
  offset += 4;
  // newUser
  key.writeUInt8(0, offset++);
  // padding for INT alignment
  offset += 1;
  // oldUpCPS
  key.writeInt16BE(0, offset);
  offset += 2;
  // oldDnCPS
  key.writeInt16BE(0, offset);
  offset += 2;
  // userFlags
  key.writeInt16BE(0, offset);
  offset += 2;
  // baud
  key.writeInt16BE(0, offset);
  offset += 2;
  // upCPS2
  key.writeInt32BE(0, offset);
  offset += 4;
  // dnCPS2
  key.writeInt32BE(0, offset);
  offset += 4;
  // timesOnToday
  key.writeInt16BE(0, offset);
  offset += 2;

  if (offset !== USERKEYS_RECORD_SIZE) {
    console.warn(`[WARN] UserKeys record size mismatch: ${offset} bytes, expected ${USERKEYS_RECORD_SIZE}`);
  }

  return key;
}

const userKeysBuffer = Buffer.concat([
  createUserKey('spot', 1),      // 1-based slot numbers
  createUserKey('sysop', 2)
]);
fs.writeFileSync(path.join(BBS_ROOT, 'User.keys'), userKeysBuffer);
fs.writeFileSync(path.join(BBS_ROOT, 'user.keys'), userKeysBuffer);
console.log('[OK] Created User.keys index');

/**
 * Create a userMisc record matching mtop.e userMisc struct (248 bytes)
 * Layout:
 * - internetName[10] = 10 bytes
 * - realName[26] = 26 bytes
 * - downloadBytesBCD[8] = 8 bytes
 * - uploadBytesBCD[8] = 8 bytes
 * - eMail[50] = 50 bytes
 * - lastDlCPS = 4 bytes (LONG)
 * - unused[142] = 142 bytes (mtop version) or pwdHash[32]+salt[8]+...+unused[86] (express version)
 * Total: 248 bytes
 */
function createUserMisc(): Buffer {
  const misc = Buffer.alloc(USERMISC_RECORD_SIZE, 0);
  // All fields default to 0, which is correct for a fresh user
  return misc;
}

// Create user.misc (248 bytes per user, 2 users)
const userMiscBuffer = Buffer.concat([
  createUserMisc(),
  createUserMisc()
]);
fs.writeFileSync(path.join(BBS_ROOT, 'user.misc'), userMiscBuffer);
console.log('[OK] Created user.misc');

// 3. Clean node*.user files
console.log('\n--- Cleaning Node Session Files ---');
const nodeFiles = fs.readdirSync(BBS_ROOT).filter(f => f.match(/^node\d+\.user/));
for (const file of nodeFiles) {
  fs.unlinkSync(path.join(BBS_ROOT, file));
}
console.log(`[OK] Removed ${nodeFiles.length} node session files`);

// 4. Reset SQLite databases using sqlite3 CLI
console.log('\n--- Resetting Databases ---');

const dbPaths = [
  path.join(BBS_ROOT, 'data/amiexpress.db'),
  path.join(BBS_ROOT, 'web/backend/data/amiexpress.db')
];

for (const dbPath of dbPaths) {
  if (fs.existsSync(dbPath)) {
    try {
      // Use sqlite3 CLI to clean tables
      const commands = [
        "DELETE FROM users WHERE username NOT IN ('spot', 'sysop', 'Spot', 'Sysop');",
        "DELETE FROM messages;",
        "DELETE FROM private_messages;",
        "DELETE FROM callers_log;",
        "DELETE FROM call_log;",
        "DELETE FROM command_history;",
        "VACUUM;"
      ].join('\n');

      execSync(`sqlite3 "${dbPath}" "${commands}"`, { stdio: 'pipe' });
      console.log(`[OK] ${dbPath}: Cleaned database (kept spot, sysop)`);
    } catch (err) {
      // Some tables might not exist, that's OK
      console.log(`[OK] ${dbPath}: Cleaned (some tables may not exist)`);
    }
  }
}

// 5. Reset bulletins
console.log('\n--- Resetting Bulletins ---');
const bulletinsDir = path.join(BBS_ROOT, 'Bulletins');
if (fs.existsSync(bulletinsDir)) {
  const bulletins = fs.readdirSync(bulletinsDir);
  for (const file of bulletins) {
    if (file.match(/^bull\d+\.txt$/i)) {
      fs.unlinkSync(path.join(bulletinsDir, file));
    }
  }
  console.log(`[OK] Cleared bulletin files`);
}

// Create a fresh welcome bulletin
const welcomeBulletin = `
Welcome to AmiExpress BBS!

This is a fresh installation. The system is ready for use.

Current Users:
  - spot (Sysop)
  - sysop (Sysop)

Enjoy your stay!
`;
fs.writeFileSync(path.join(bulletinsDir, 'bull1.txt'), welcomeBulletin);
console.log('[OK] Created welcome bulletin (bull1.txt)');

// 6. Reset stats
console.log('\n--- Resetting Stats ---');
const statsDir = path.join(BBS_ROOT, 'SysopStats');
if (fs.existsSync(statsDir)) {
  const stats = fs.readdirSync(statsDir);
  for (const file of stats) {
    const filePath = path.join(statsDir, file);
    // Reset numeric stats files to "0"
    if (file.match(/^Num/)) {
      fs.writeFileSync(filePath, '0');
    }
  }
  console.log('[OK] Reset SysopStats counters');
}

// 7. Clean conference message counts but keep structure
console.log('\n--- Cleaning Conference Data ---');
for (let i = 1; i <= 14; i++) {
  const confDir = path.join(BBS_ROOT, `Conf${i}`);
  if (fs.existsSync(confDir)) {
    // Reset message counters
    const numMsgsPath = path.join(confDir, 'NumMsgs');
    if (fs.existsSync(numMsgsPath)) {
      fs.writeFileSync(numMsgsPath, '0');
    }

    // Ensure Messages directory exists
    const msgDir = path.join(confDir, 'Messages');
    if (!fs.existsSync(msgDir)) {
      fs.mkdirSync(msgDir, { recursive: true });
      console.log(`[OK] Created ${confDir}/Messages`);
    }

    // Clear ALL message files (.msg files, including negative numbers and corrupt files)
    if (fs.existsSync(msgDir)) {
      const msgs = fs.readdirSync(msgDir);
      let removedCount = 0;
      for (const msg of msgs) {
        // Remove all .msg files (including negative numbers like -1962934271.msg)
        if (msg.endsWith('.msg')) {
          fs.unlinkSync(path.join(msgDir, msg));
          removedCount++;
        }
        // Also remove numeric files without extension (legacy format)
        if (msg.match(/^-?\d+$/)) {
          fs.unlinkSync(path.join(msgDir, msg));
          removedCount++;
        }
      }

      // Initialize MailStats file (8 bytes of zeros: lowestKey, lowestNotDel, highMsgNum)
      const mailStatsPath = path.join(msgDir, 'MailStats');
      const mailStatsBuffer = Buffer.alloc(8, 0);
      fs.writeFileSync(mailStatsPath, mailStatsBuffer);

      console.log(`[OK] Cleaned Conf${i}: removed ${removedCount} messages, initialized MailStats`);
    }

    // Ensure Files directory exists
    const filesDir = path.join(confDir, 'Files');
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
      console.log(`[OK] Created ${confDir}/Files`);
    }
  }
}

// 8. Remove test files
console.log('\n--- Cleaning Test Files ---');
const testFiles = ['test-user.data'];
for (const file of testFiles) {
  const filePath = path.join(BBS_ROOT, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[OK] Removed ${file}`);
  }
}

// 9. Batch files - DO NOT MODIFY (they contain door configurations)
// Batch files are user-configured and should never be reset

// 10. Clean Node WorkDirs
console.log('\n--- Cleaning Node WorkDirs ---');
for (let i = 0; i <= 10; i++) {
  const workDir = path.join(BBS_ROOT, `Node${i}/WorkDir`);
  if (fs.existsSync(workDir)) {
    const files = fs.readdirSync(workDir);
    for (const file of files) {
      const filePath = path.join(workDir, file);
      if (fs.statSync(filePath).isFile()) {
        fs.unlinkSync(filePath);
      }
    }
    console.log(`[OK] Cleaned Node${i}/WorkDir`);
  }
}

// 11. Reset DIRX files (file directory indexes) in conferences
console.log('\n--- Resetting DIRX Files ---');
for (let i = 1; i <= 14; i++) {
  const confDir = path.join(BBS_ROOT, `Conf${i}`);
  if (fs.existsSync(confDir)) {
    // Reset Dir1 (upload counter)
    const dir1Path = path.join(confDir, 'Dir1');
    if (fs.existsSync(dir1Path)) {
      fs.writeFileSync(dir1Path, '0');
      console.log(`[OK] Reset Conf${i}/Dir1`);
    }

    // Clear .dir files (file listings)
    const filesDir = path.join(confDir, 'Files');
    if (fs.existsSync(filesDir)) {
      const dirFiles = fs.readdirSync(filesDir).filter(f => f.endsWith('.dir'));
      for (const dirFile of dirFiles) {
        // Keep the file but clear content (empty directory listing)
        fs.writeFileSync(path.join(filesDir, dirFile), '');
      }
      if (dirFiles.length > 0) {
        console.log(`[OK] Cleared ${dirFiles.length} .dir files in Conf${i}/Files`);
      }
    }

    // Reset NumULs (number of uploads)
    const numULsPath = path.join(confDir, 'NumULs');
    if (fs.existsSync(numULsPath)) {
      fs.writeFileSync(numULsPath, '0');
    }
  }
}

// 12. Clear Callers log files
console.log('\n--- Clearing Callers Logs ---');
const callersFiles = fs.readdirSync(BBS_ROOT).filter(f => f.startsWith('Callers'));
for (const file of callersFiles) {
  const filePath = path.join(BBS_ROOT, file);
  if (fs.statSync(filePath).isFile()) {
    fs.writeFileSync(filePath, '');
    console.log(`[OK] Cleared ${file}`);
  }
}

// 13. Clear application logs
console.log('\n--- Clearing Application Logs ---');
const logsDir = path.join(BBS_ROOT, 'logs');
if (fs.existsSync(logsDir)) {
  const logFiles = fs.readdirSync(logsDir);
  for (const file of logFiles) {
    fs.unlinkSync(path.join(logsDir, file));
  }
  console.log(`[OK] Cleared ${logFiles.length} log files`);
}

// 14. Reset last caller info
console.log('\n--- Resetting Last Caller Info ---');
const lastCallerFiles = ['LastCaller', 'lastcaller', 'LastCall.txt'];
for (const file of lastCallerFiles) {
  const filePath = path.join(BBS_ROOT, file);
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, 'spot\n');
    console.log(`[OK] Reset ${file}`);
  }
}

console.log('\n=== BBS Reset Complete ===');
console.log(`Backup saved to: ${backupDir}`);
console.log('Users: spot, sysop (both with sysop access)');
console.log('Conferences: Preserved structure, cleared messages');
console.log('Ready for fresh start!\n');
