#!/usr/bin/env npx tsx
/**
 * Rebuild user.data/keys/misc files from database
 * Fixes corruption caused by inconsistent slot number calculations
 */

import * as path from 'path';
import { UserFileManager } from '../../web/backend/src/services/UserFileManager';

const Database = require('../../web/backend/node_modules/better-sqlite3');

const bbsRoot = path.resolve(__dirname, '../..');
const dbPath = path.join(bbsRoot, 'data', 'amiexpress.db');

async function rebuildUserFiles() {
  console.log('=== Rebuilding User Files ===');
  console.log(`BBS Root: ${bbsRoot}`);
  console.log(`Database: ${dbPath}`);

  // Initialize services
  const db = new Database(dbPath);
  const userFileManager = new UserFileManager(bbsRoot);

  try {
    // Get all users from database (sorted by username)
    const users = db.prepare('SELECT * FROM users ORDER BY username').all() as any[];
    console.log(`\nFound ${users.length} users in database`);

    // Initialize empty user files
    userFileManager.initializeUserFiles();
    console.log('Initialized empty user files');

    // Convert database rows to User objects
    const userObjects = users.map((row: any) => {
      const safeNumber = (value: any, defaultValue: number = 0): number => {
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
      };

      return {
        id: row.id,
        slotNumber: row.slotnumber ? safeNumber(row.slotnumber) : undefined,
        username: row.username,
        passwordHash: row.passwordhash,
        realname: row.realname,
        location: row.location,
        phone: row.phone,
        email: row.email,
        secLevel: safeNumber(row.seclevel, 10),
        uploads: safeNumber(row.uploads, 0),
        downloads: safeNumber(row.downloads, 0),
        bytesUpload: safeNumber(row.bytesupload, 0),
        bytesDownload: safeNumber(row.bytesdownload, 0),
        ratio: safeNumber(row.ratio, 0),
        ratioType: safeNumber(row.ratiotype, 0),
        timeTotal: safeNumber(row.timetotal, 0),
        timeLimit: safeNumber(row.timelimit, 0),
        timeUsed: safeNumber(row.timeused, 0),
        chatLimit: safeNumber(row.chatlimit, 0),
        chatUsed: safeNumber(row.chatused, 0),
        lastLogin: row.lastlogin ? new Date(row.lastlogin * 1000) : undefined,
        firstLogin: new Date(row.firstlogin * 1000),
        calls: safeNumber(row.calls, 0),
        callsToday: safeNumber(row.callstoday, 0),
        messagesPosted: safeNumber(row.messagesposted, 0),
        newUser: Boolean(row.newuser),
        expert: row.expert ? 'X' : 'N',
        ansi: Boolean(row.ansi),
        linesPerScreen: safeNumber(row.linesperscreen, 23),
        computer: row.computer,
        screenType: row.screentype,
        protocol: row.protocol,
        editor: row.editor,
        zoomType: row.zoomtype,
        availableForChat: Boolean(row.availableforchat),
        quietNode: Boolean(row.quietnode),
        autoRejoin: safeNumber(row.autorejoin, 1),
        confAccess: row.confaccess,
        areaName: row.areaname,
        uuCP: Boolean(row.uucp),
        baud: safeNumber(row.baud, 0),
        topUploadCPS: safeNumber(row.topuploadcps, 0),
        topDownloadCPS: safeNumber(row.topdownloadcps, 0),
        byteLimit: safeNumber(row.bytelimit, 0),
        securityFlags: row.securityflags,
        secOverride: row.secoverride,
        userFlags: safeNumber(row.userflags, 0),
        created: new Date(row.created * 1000),
        updated: new Date(row.updated * 1000),
      };
    });

    // Write each user to their slot
    let written = 0;
    for (const user of userObjects) {
      if (user.slotNumber) {
        console.log(`Writing ${user.username} to slot ${user.slotNumber}`);
        userFileManager.updateUserDataFile(user, user.slotNumber);
        written++;
      } else {
        console.warn(`WARNING: User ${user.username} (${user.id}) has no slot number, skipping`);
      }
    }

    console.log(`\nSuccessfully wrote ${written} users to disk files`);
    console.log('\nVerifying files:');

    // Verify each user can be read back
    for (const user of userObjects) {
      if (user.slotNumber) {
        const readUser = userFileManager.readUserBySlot(user.slotNumber);
        if (readUser && readUser.username === user.username) {
          console.log(`  ✓ Slot ${user.slotNumber}: ${user.username}`);
        } else {
          console.error(`  ✗ Slot ${user.slotNumber}: Failed to verify ${user.username}`);
        }
      }
    }

    db.close();

    console.log('\nRebuild complete!');
  } catch (error) {
    console.error('Error rebuilding user files:', error);
    process.exit(1);
  }
}

rebuildUserFiles();
