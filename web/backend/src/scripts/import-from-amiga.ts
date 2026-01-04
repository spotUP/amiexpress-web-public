import * as fs from 'fs';
import * as path from 'path';
import { db } from '../database';
import { config } from '../config';
import { userDatabaseManager } from '../services/UserDatabaseManager';
import { loadConfConfig } from '../services/conf-config.service';
import { loadConferenceFileAreas } from '../services/file-areas-loader';
import { parseDirFile } from '../utils/quicknew-generator';

async function importAll() {
console.log('=== Importing from Amiga Disk Config ===');
  const bbsRoot = config.get('dataDir');
console.log(`BBS Root: ${bbsRoot}`);

  await db.init();

  // 1. Import Conferences
console.log('\n--- Conferences ---');
  const confConfig = loadConfConfig(bbsRoot);
  if (confConfig && confConfig.confCount > 0) {
    for (let i = 0; i < confConfig.confCount; i++) {
      const entry = confConfig.entries[i];
      const confId = i + 1;
      
      // Check if exists
      const existing = await db.getConferenceById(confId);
      if (!existing) {
console.log(`Adding Conf ${confId}: ${entry.name}`);
        await db.createConference({
          name: entry.name || `Conference ${confId}`,
          description: entry.name,
          ratio: 0,
          ratioType: 0,
          uploads: 0,
          downloads: 0,
          bytesUpload: 0,
          bytesDownload: 0
        });
      } else {
console.log(`Conf ${confId} exists: ${existing.name}`);
      }

      // 2. Import File Areas for this conference
      const diskAreas = loadConferenceFileAreas(bbsRoot, confId);
      const dbAreas = await db.getFileAreas(confId);
      
      for (const diskArea of diskAreas) {
        const alreadyInDb = dbAreas.some(a => a.name === diskArea.name || a.path === diskArea.dlPath);
        if (!alreadyInDb) {
console.log(`  Adding Area: ${diskArea.name}`);
          const areaId = await db.createFileArea({
            name: diskArea.name,
            description: diskArea.description || '',
            path: diskArea.dlPath,
            conferenceId: confId,
            maxFiles: 1000,
            uploadAccess: 10,
            downloadAccess: 10
          });

          // 3. Import File Entries from DIR1 (Optional)
          const dirFilePath = path.join(bbsRoot, `Conf${confId}`, `DIR${diskArea.dirNumber}`);
          const diskFiles = parseDirFile(dirFilePath);
          if (diskFiles.length > 0) {
console.log(`    Importing ${diskFiles.length} files for ${diskArea.name}...`);
            const existingFiles = await db.getFilesByArea(areaId);
            const existingFilenames = new Set(existingFiles.map(f => f.filename.toUpperCase()));

            for (const f of diskFiles) {
              if (existingFilenames.has(f.filename.toUpperCase())) {
                continue;
              }
              await db.createFileEntry({
                filename: f.filename,
                description: '',
                size: f.size,
                uploader: 'sysop',
                uploadDate: f.uploadDate,
                downloads: 0,
                areaId: areaId,
                fileIdDiz: '',
                rating: 0,
                votes: 0,
                status: 'active',
                checked: 'P',
                comment: ''
              });
              existingFilenames.add(f.filename.toUpperCase());
            }
          }
        } else {
console.log(`  Area exists: ${diskArea.name}`);
        }
      }
    }
  }

  // 4. Import Users
console.log('\n--- Users ---');
  const diskUsers = userDatabaseManager.importAllUsersFromDisk();
console.log(`Found ${diskUsers.length} users on disk`);
  
  for (const du of diskUsers) {
    const username = du.user.name;
    const existing = await db.getUserByUsername(username);
    
    if (!existing) {
console.log(`Adding User: ${username}`);
      await db.createUser({
        username: username,
        passwordHash: 'legacy', // AmiExpress uses different hash
        realname: du.misc.realName || du.user.name,
        location: du.user.location,
        phone: du.user.phoneNumber,
        email: du.misc.eMail,
        secLevel: du.user.secStatus,
        uploads: du.user.uploads,
        downloads: du.user.downloads,
        bytesUpload: du.user.bytesUpload,
        bytesDownload: du.user.bytesDownload,
        slotNumber: du.user.slotNumber,
        newSinceDate: du.user.newSinceDate,
        lastLogin: new Date(du.user.timeLastOn * 1000),
        firstLogin: new Date(du.user.accountDate * 1000),
        calls: du.user.timesCalled,
        messagesPosted: du.user.messagesPosted,
        newUser: du.user.newUser === 1,
        ansi: true,
        expert: du.user.expert === 1 ? 'X' : 'N',
        linesPerScreen: du.user.lineLength || 24,
        confAccess: userDatabaseManager.readConfAccessFromDisk(du.user.slotNumber),
        ratio: 0,
        ratioType: 0,
        timeTotal: du.user.timeTotal,
        timeLimit: du.user.timeLimit,
        timeUsed: du.user.timeUsed,
        chatLimit: du.user.chatLimit,
        chatUsed: 0,
        callsToday: 0,
        computer: 'Amiga',
        screenType: du.user.screenType,
        protocol: String.fromCharCode(du.user.protocol || 90), // Default 'Z'
        editor: du.user.editorType,
        zoomType: du.user.zoomType,
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        areaName: '',
        uuCP: du.user.uucpa === 1,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: du.user.dailyBytesLimit
      } as any);
    } else {
console.log(`User exists: ${username}`);
    }
  }

console.log('\nImport complete!');
}

importAll().catch(err => {
console.error('Import failed:', err);
  process.exit(1);
});
