/**
 * Download Handler
 * Port from express.e:24853 (internalCommandD)
 * Port from express.e:19791 (beginDLF)
 * Port from express.e:20075+ (downloadAFile)
 *
 * Handles file download commands and transfers
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity, getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { checkDownloadRatios, updateDownloadStats, creditAccountTrackDownloads } from '../../utils/download-ratios.util';
import { logDownload } from '../../utils/download-logging.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
import { ConferenceRepository } from '../../database/conference-repository';
import { db } from '../../database';
import { config } from '../../config';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import * as fs from 'fs';
import * as path from 'path';
import { FileFlagManager } from '../../utils/file-flag.util';
import { getConferenceDir } from '../../utils/file-hold.util';
import { userFileManager } from '../../services/UserFileManager';
import { doorDropFileManager } from '../../services/DoorDropFileManager';
import { emitDownload } from '../../services/bbs-event-emitter';

/**
 * Download Handler
 * Manages file downloads for the BBS
 */
export class DownloadHandler {
  /**
   * Handle D command - Download single file
   * Port from express.e:24853-24858 (internalCommandD)
   */
  static async handleDownloadCommand(
    socket: Socket,
    session: BBSSession,
    params: string = ''
  ): Promise<void> {
    // Check security - express.e:24854
    if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
      socket.emit('ansi-output', '\x1b[31mPermission denied.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // setEnvStat(ENV_DOWNLOADING) - express.e:24855
console.log('[ENV] Downloading');

    // Call beginDLF - express.e:24856
    await this.beginDLF(socket, session, params);
  }

  /**
   * Begin download flow
   * Port from express.e:19791-19794 (beginDLF)
   */
  private static async beginDLF(
    socket: Socket,
    session: BBSSession,
    params: string
  ): Promise<void> {
    // express.e:19792
    const stat = await this.downloadAFile(socket, session, params);

    // express.e:19793 - modemOffHook if RESULT_GOODBYE
    if (stat === 'GOODBYE') {
console.log('[DOWNLOAD] User chose goodbye after download');
      // Handle disconnect here if needed
    }
  }

  /**
   * Download a file or multiple files - main download logic
   * Port from express.e:20075+ (downloadAFile)
   * Supports batch downloads: space-separated filenames or wildcards
   */
  private static async downloadAFile(
    socket: Socket,
    session: BBSSession,
    params: string
  ): Promise<string> {
    let filenameInput = params.trim();
    const fileList: any[] = [];

    // If user has flagged files and no filename was provided, use the flagged list
    if (!filenameInput) {
      const flagged: { confNum: number; filename: string }[] = [];

      if (session.flagManager instanceof FileFlagManager && session.flagManager.getCount() > 0) {
        session.flagManager.getAll().forEach((f) => {
          flagged.push({ confNum: f.confNum, filename: f.filename });
        });
      }

      if (Array.isArray(session.tempData?.flaggedFiles)) {
        session.tempData.flaggedFiles.forEach((f: any) => {
          if (f?.fileName) {
            flagged.push({ confNum: f.confNum, filename: f.fileName });
          }
        });
      }

      if (Array.isArray((session as any).flaggedFiles)) {
        (session as any).flaggedFiles.forEach((f: any) => {
          const name = f.filename || f.fileName || f.name;
          if (name) {
            flagged.push({ confNum: f.confNum || f.conferenceid || f.conf || -1, filename: name });
          }
        });
      }

      if (flagged.length > 0) {
        console.log(`[Download] Processing ${flagged.length} flagged file(s)`);
        const dataDir = config.get('dataDir');
        for (const flag of flagged) {
          const confNum = flag.confNum > 0 ? flag.confNum : (session.currentConf || 1);
          const matches = await this.findFilesInConference(
            dataDir,
            confNum,
            flag.filename
          );
          if (matches.length > 0) {
            fileList.push(...matches);
          } else {
            console.log(`[Download] Warning: Flagged file "${flag.filename}" not found in conf ${confNum}`);
          }
        }
      }
    }

    // Parse parameters or prompt for filename(s)
    if (!filenameInput && fileList.length === 0) {
      // No filename provided - prompt user - express.e:20135+
      socket.emit('ansi-output', '\r\n\x1b[36mFilename(s) to download (space-separated): \x1b[0m');
      session.subState = LoggedOnSubState.DOWNLOAD_FILENAME_INPUT;
      session.tempData = { waitingForDownloadFilename: true };
      return 'SUCCESS';
    }

    if (filenameInput) {
      // express.e:20037-20055 - Parse multiple filenames (space-separated)
      const filenames = filenameInput.split(/\s+/).filter(f => f.length > 0);
console.log(`[DOWNLOAD] Processing ${filenames.length} filename(s):`, filenames);

      for (const filename of filenames) {
        // Validate filename - express.e:20136-20155
        if (!this.isValidFilename(filename)) {
          socket.emit('ansi-output', `\r\n\x1b[31mInvalid filename: ${filename}\x1b[0m\r\n`);
          continue;
        }

        // Check if wildcards are used without permission - express.e:20140-20145
        if (this.hasWildcards(filename) && !checkSecurity(session.user, ACSPermission.FILE_EXPANSION)) {
          socket.emit('ansi-output', `\r\n\x1b[31mYou may not include wildcards: ${filename}\x1b[0m\r\n`);
          continue;
        }

        // Search for files matching this pattern (handles wildcards)
        const matchingFiles = await this.findFilesInConference(
          config.get('dataDir'),
          session.currentConf || 1,
          filename
        );

        if (matchingFiles.length === 0) {
          socket.emit('ansi-output', `\r\n\x1b[31mFile not found: ${filename}\x1b[0m\r\n`);
          continue;
        }

        fileList.push(...matchingFiles);
      }
    }

    if (fileList.length === 0) {
      SysopDebugUtil.debug(
        socket,
        session,
        'DOWNLOAD',
        'No files found matching download request',
        { filenameInput, conferenceId: session.currentConf },
        DebugSeverity.WARNING
      );
      socket.emit('ansi-output', '\r\n\x1b[31mNo files found to download.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }

    // express.e:20066 - "Checking..."
    if (fileList.length > 1) {
      socket.emit('ansi-output', '\r\n\x1b[36mChecking...\x1b[0m\r\n');
    }

    // Check ratio requirements - express.e:20085-20095, 19823+
    const ratioCheck = await checkDownloadRatios(
      session.user,
      fileList.map(f => ({
        size: f.size,
        isFree: this.isFreeDownload(f),
        conference: f.confNum
      })),
      await this.loadConferences(session),
      checkSecurity(session.user, ACSPermission.CONFERENCE_ACCOUNTING),
      getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true
    );
    if (!ratioCheck.canDownload) {
      socket.emit('ansi-output', `\r\n\x1b[31m${ratioCheck.errorMessage}\x1b[0m\r\n`);
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }
    const totalSize = fileList.reduce((sum, file) => sum + file.size, 0);
    const totalKb = Math.floor(totalSize / 1024);

    // Get estimated CPS from user stats or default to 10000 (100kbps)
    const estCPS = session.user?.topDownloadCPS || 10000;
    const estSecs = estCPS > 0 ? Math.floor(totalSize / estCPS) : 0;
    const estMins = Math.floor(estSecs / 60);
    const estSecsRem = estSecs % 60;

    // express.e:20182-20195 - Protocol and estimate header
    socket.emit('ansi-output', '\r\nHTTP Batch Download Estimate:\r\n');

    // express.e:20202 - File count, size, time estimate
    socket.emit('ansi-output', `   ${fileList.length} files, ${totalKb}k bytes, ${estMins} mins ${estSecsRem} secs\r\n`);

    // express.e:20210 - LAST CHANCE prompt
    socket.emit('ansi-output', '\r\nLAST CHANCE!   (Enter) to Start, (G)oodbye after transfer, (A)bort? ');

    // Set state to wait for confirmation
    session.subState = LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT;
    session.tempData = {
      waitingForDownloadConfirm: true,
      downloadFileList: fileList,
      downloadBatch: fileList.length > 1
    };

    return 'SUCCESS';
  }

  /**
   * Handle filename input continuation
   */
  static async handleFilenameInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (session.tempData?.waitingForDownloadFilename) {
      session.tempData.waitingForDownloadFilename = false;

      if (!input.trim()) {
        // Empty input - cancel
        socket.emit('ansi-output', '\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      // Process the filename
      await this.downloadAFile(socket, session, input.trim());
    }
  }

  /**
   * Handle download confirmation input
   * express.e:20212-20231 - Handle Enter/G/A responses
   */
  static async handleConfirmInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (session.tempData?.waitingForDownloadConfirm) {
      session.tempData.waitingForDownloadConfirm = false;
      const fileList = session.tempData.downloadFileList || [session.tempData.downloadFile];
      const isBatch = session.tempData.downloadBatch || false;

      const answer = input.trim().toUpperCase();
      let goodbyeAfter = false;

      // express.e:20219-20221 - A = Abort
      if (answer === 'A') {
        socket.emit('ansi-output', 'Abort!\r\n\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.tempData.downloadFile = null;
        session.tempData.downloadFileList = null;
        session.tempData.downloadBatch = false;
        return;
      }

      // express.e:20228 - G = Goodbye after transfer
      if (answer === 'G') {
        socket.emit('ansi-output', 'Goodbye!\r\n\r\n');
        goodbyeAfter = true;
      } else {
        // Enter or Y = Start transfer - express.e:20231
        socket.emit('ansi-output', '\r\n\r\n');
      }

      // User confirmed - initiate download(s)
      if (isBatch) {
        await this.initiateBatchDownload(socket, session, fileList, goodbyeAfter);
      } else {
        await this.initiateDownload(socket, session, fileList[0], goodbyeAfter);
      }

      session.tempData.downloadFile = null;
      session.tempData.downloadFileList = null;
      session.tempData.downloadBatch = false;
    }
  }

  /**
   * Initiate the actual download (single file)
   * express.e:15731-15740 - Ready to Send message
   * express.e:20251 - File transfer Completed
   */
  private static async initiateDownload(
    socket: Socket,
    session: BBSSession,
    fileInfo: any,
    goodbyeAfter: boolean = false
  ): Promise<void> {
    // express.e:15732 - "Protocol: Ready to Send"
    socket.emit('ansi-output', 'HTTP: Ready to Send\r\n');

    // Generate download URL
    const downloadUrl = `/api/download/${fileInfo.confNum}/${fileInfo.dirNum}/${encodeURIComponent(fileInfo.name)}`;

    // Send download link to client
    socket.emit('download-file', {
      filename: fileInfo.name,
      size: fileInfo.size,
      url: downloadUrl,
      path: fileInfo.fullPath
    });

    // Log download activity - express.e:9475+
    if (session.user) {
      // Check if file is marked as free download
      // express.e:12740 - IF((fBlock.comment[0]="F") OR (freeDownloads))
      const isFree = this.isFreeDownload(fileInfo);

      await logDownload(session.user, fileInfo.name, fileInfo.size, isFree, session.nodeId || 0);

      // Emit BBS event for LiveChat integration
      try {
        const conference = await db.getConferenceById(session.currentConf);
        emitDownload({
          username: session.user.username,
          nodeId: session.nodeId || 1,
          fileName: fileInfo.name,
          fileSize: fileInfo.size,
          conferenceId: session.currentConf,
          conferenceName: conference?.name,
          timestamp: Date.now()
        });
      } catch (error) {
console.error('[BBSEvent] Error emitting download event:', error);
      }

      await updateDownloadStats(session.user, fileInfo.size, isFree);
      await this.persistDownloadStats(session);
      await this.updateConferenceDownloadStats(session, fileInfo, isFree);

      // Update per-node download tracking for DOOR.SYS line 32
      doorDropFileManager.updateDownloadBytesToday(session.nodeId || 0, fileInfo.size);
    }

    // express.e:20251 - "File transfer Completed."
    socket.emit('ansi-output', '\r\n\r\nFile transfer Completed.\r\n');

    // Handle goodbye after transfer - express.e:20317
    if (goodbyeAfter) {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      // Trigger goodbye flow
      const { handleGoodbyeCommand } = require('../commands/system-commands.handler');
      handleGoodbyeCommand(socket, session, 'Y');
    } else {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
  }

  /**
   * Initiate batch download (multiple files)
   * Port from express.e:15571-15720 (downloadFiles)
   * express.e:15732 - "Protocol: Ready to Send"
   * express.e:20251 - "File transfer Completed."
   */
  private static async initiateBatchDownload(
    socket: Socket,
    session: BBSSession,
    fileList: any[],
    goodbyeAfter: boolean = false
  ): Promise<void> {
    // express.e:15732 - "Protocol: Ready to Send"
    socket.emit('ansi-output', 'HTTP: Ready to Send\r\n');

    // Send all files to client for download
    for (let i = 0; i < fileList.length; i++) {
      const fileInfo = fileList[i];
      const downloadUrl = `/api/download/${fileInfo.confNum}/${fileInfo.dirNum}/${encodeURIComponent(fileInfo.name)}`;

      // Send download event to client
      socket.emit('download-file', {
        filename: fileInfo.name,
        size: fileInfo.size,
        url: downloadUrl,
        path: fileInfo.fullPath,
        batchIndex: i,
        batchTotal: fileList.length
      });

      // Log download activity
      if (session.user) {
        const isFree = this.isFreeDownload(fileInfo);
        await logDownload(session.user, fileInfo.name, fileInfo.size, isFree, session.nodeId || 0);

        // Emit BBS event for LiveChat integration
        try {
          const conference = await db.getConferenceById(session.currentConf);
          emitDownload({
            username: session.user.username,
            nodeId: session.nodeId || 1,
            fileName: fileInfo.name,
            fileSize: fileInfo.size,
            conferenceId: session.currentConf,
            conferenceName: conference?.name,
            timestamp: Date.now()
          });
        } catch (error) {
console.error('[BBSEvent] Error emitting download event:', error);
        }

        await updateDownloadStats(session.user, fileInfo.size, isFree);
        await this.persistDownloadStats(session);
        await this.updateConferenceDownloadStats(session, fileInfo, isFree);

        // Update per-node download tracking for DOOR.SYS line 32
        doorDropFileManager.updateDownloadBytesToday(session.nodeId || 0, fileInfo.size);
      }
    }

    // express.e:20251 - "File transfer Completed."
    socket.emit('ansi-output', '\r\n\r\nFile transfer Completed.\r\n');

    // Handle goodbye after transfer - express.e:20317
    if (goodbyeAfter) {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      // Trigger goodbye flow
      const { handleGoodbyeCommand } = require('../commands/system-commands.handler');
      handleGoodbyeCommand(socket, session, 'Y');
    } else {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
  }

  /**
   * Find file in conference directories (single file, exact match)
   */
  private static async findFileInConference(
    dataDir: string,
    confNum: number,
    filename: string
  ): Promise<any | null> {
    const files = await this.findFilesInConference(dataDir, confNum, filename);
    return files.length > 0 ? files[0] : null;
  }

  /**
   * Load area paths for the given area IDs
   */
  private static async loadAreaPaths(areaIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (!areaIds.length) return map;
    const placeholders = areaIds.map(() => '?').join(',');
    const result = await db.query(`SELECT id, path FROM file_areas WHERE id IN (${placeholders})`, areaIds);
    result.rows.forEach((row: any) => {
      map.set(row.id, row.path);
    });
    return map;
  }

  /**
   * Find files via database (file_entries + file_areas)
   */
  private static async findFilesInDatabase(confNum: number, pattern: string): Promise<any[]> {
    const hasWildcard = this.hasWildcards(pattern);
    const matcher = hasWildcard
      ? pattern.replace(/\*/g, '%').replace(/\?/g, '_').replace(/#/g, '_')
      : pattern;

    const sql = `
      SELECT fe.filename, fe.size, fe.areaid, fa.path, fa.conferenceid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = ?
        AND UPPER(fe.filename) ${hasWildcard ? 'LIKE' : '='} UPPER(?)
    `;
    const rows = (await db.query(sql, [confNum, matcher])).rows;
    return rows.map((r: any) => ({
      name: r.filename,
      size: r.size || 0,
      confNum: r.conferenceid || confNum,
      dirNum: r.areaid,
      fullPath: r.path ? path.join(r.path, r.filename) : undefined
    })).filter((r: any) => !!r.fullPath);
  }

  /**
   * Find files in conference directories (supports wildcards)
   * Port from express.e:20068-20090 - wildcard matching logic
   */
  private static async findFilesInConference(
    dataDir: string,
    confNum: number,
    pattern: string
  ): Promise<any[]> {
    // AmiExpress stores files on DISK in Conf{N}/Files/ and Conf{N}/Upload/ directories
    // We must search the filesystem, NOT the database
    // Doors expect files to be on disk where they can access them
    const confPath = getConferenceDir(confNum, dataDir);
    const matchingFiles: any[] = [];
    const hasWildcard = this.hasWildcards(pattern);

    // Search in both Files/ and Upload/ directories (express.e searches both)
    const searchDirs = [
      path.join(confPath, 'Upload'),  // Newly uploaded files
      path.join(confPath, 'Files')    // Older/organized files
    ];

    for (const filesDir of searchDirs) {
      if (!fs.existsSync(filesDir)) {
        continue;
      }

      if (hasWildcard) {
        // Wildcard search - check all files in directory
        const files = fs.readdirSync(filesDir);
        for (const file of files) {
          if (this.matchesWildcard(file, pattern)) {
            const filePath = path.join(filesDir, file);
            const stats = fs.statSync(filePath);

            if (stats.isFile()) {
              matchingFiles.push({
                name: file,
                size: stats.size,
                confNum: confNum,
                dirNum: 1,  // All files are in directory 1
                fullPath: filePath
              });
            }
          }
        }
      } else {
        // Exact match - search in directory
        const filePath = path.join(filesDir, pattern);

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);

          if (stats.isFile()) {
            matchingFiles.push({
              name: pattern,
              size: stats.size,
              confNum: confNum,
              dirNum: 1,  // All files are in directory 1
              fullPath: filePath
            });
          }
        }
      }
    }

    return matchingFiles;
  }

  /**
   * Match filename against wildcard pattern
   * Supports * (any chars) and ? (single char)
   */
  private static matchesWildcard(filename: string, pattern: string): boolean {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')    // Escape dots
      .replace(/\*/g, '.*')      // * matches any characters
      .replace(/\?/g, '.');      // ? matches single character

    const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case insensitive
    return regex.test(filename);
  }

  /**
   * Check if filename has wildcards
   */
  private static hasWildcards(filename: string): boolean {
    return filename.includes('*') || filename.includes('?') || filename.includes('#');
  }

  /**
   * Validate filename
   * express.e:20136-20155
   */
  private static isValidFilename(filename: string): boolean {
    // Check for path separators - express.e:20140
    if (filename.includes(':') || filename.includes('/') || filename.includes('\\')) {
      return false;
    }

    // Check if starts with wildcard - express.e:20147
    if (filename.startsWith('?') || filename.startsWith('*')) {
      return false;
    }

    return true;
  }
  /**
   * Check if file is marked as free download
   * Port from express.e:12740 - IF((fBlock.comment[0]="F") OR (freeDownloads))
   */
  private static isFreeDownload(fileInfo: any): boolean {
    // Check if file comment starts with "F" (free marker)
    if (fileInfo.comment && fileInfo.comment.toUpperCase().startsWith('F')) {
      return true;
    }

    // Conference-level FREEDOWNLOADS tooltype
    if (fileInfo.confNum) {
      const flags = getConferenceToolFlags(fileInfo.confNum);
      if (flags.freeDownloads) {
        return true;
      }
    }

    return false;
  }

  /**
   * Persist updated download counters to the database AND disk files
   */
  private static async persistDownloadStats(session: BBSSession): Promise<void> {
    const user = session.user;
    if (!user) return;

    try {
      // Use the imported db from ../../database
      if (db?.updateUser) {
        await db.updateUser(user.id, {
          downloads: user.downloads,
          bytesDownload: user.bytesDownload,
          dailyBytesDld: user.dailyBytesDld,
          bytesAvailableForDownload: user.bytesAvailableForDownload,
          lastDownloadTime: user.lastDownloadTime,
          topDownloadCPS: user.topDownloadCPS
        });

        // DISK-BASED: Write updated download stats to user.data/keys/misc files
        if (user.slotNumber) {
          try {
            userFileManager.updateUserDataFile(user, user.slotNumber);
console.log(`[DOWNLOAD] Updated user ${user.username} disk files with download stats`);
          } catch (diskErr) {
console.error('[DOWNLOAD] Error writing user disk files:', diskErr);
            // Continue anyway - database has the stats, sync can happen later
          }
        }
      }
    } catch (err) {
console.error('[DOWNLOAD] Failed to persist download stats', err);
    }
  }

  /**
   * Persist per-conference download statistics (ACS_CONFERENCE_ACCOUNTING path)
   */
  private static async updateConferenceDownloadStats(
    session: BBSSession,
    fileInfo: any,
    isFree: boolean = false
  ): Promise<void> {
    const user = session.user;
    if (!user) return;
    if (!checkSecurity(user, ACSPermission.CONFERENCE_ACCOUNTING)) return;
    if (isFree) return;
    if (!creditAccountTrackDownloads(user)) return;

    try {
      // Load conferences from DB (or session cache)
      const conferences = await this.loadConferences(session);
      const target = conferences?.find(c => c.id === fileInfo.confNum);
      if (!target) return;

      target.downloads = (target.downloads || 0) + 1;
      target.bytesDownload = (target.bytesDownload || 0) + (fileInfo.size || 0);

      // Use imported db - get underlying db if it's a proxy
      const rawDb = (db as any).db ?? db;
      const repo = new ConferenceRepository(rawDb);
      await repo.updateConference(target.id, {
        downloads: target.downloads,
        bytesDownload: target.bytesDownload
      });
    } catch (err) {
console.error('[DOWNLOAD] Failed to persist conference download stats', err);
    }
  }

  private static async loadConferences(session: BBSSession) {
    if (session.conferences && Array.isArray(session.conferences)) {
      return session.conferences;
    }
    try {
      // Use imported db
      const repo = new ConferenceRepository(db);
      const confs = await repo.getConferences();
      session.conferences = confs;
      return confs;
    } catch (err) {
console.error('[DOWNLOAD] Failed to load conferences for accounting', err);
      return undefined;
    }
  }
}
