/**
 * Download Handler
 * Port from express.e:24853 (internalCommandD)
 * Port from express.e:19791 (beginDLF)
 * Port from express.e:20075+ (downloadAFile)
 *
 * Handles file download commands and transfers
 */

import { Socket } from 'socket.io';
import { config } from '../config';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { checkSecurity } from '../utils/acs.util';
import { checkDownloadRatios, updateDownloadStats } from '../utils/download-ratios.util';
import { logDownload } from '../utils/download-logging.util';
import { ACSPermission } from '../constants/acs-permissions';
import * as fs from 'fs';
import * as path from 'path';

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

    // Parse parameters or prompt for filename(s)
    let filenameInput = params.trim();

    if (!filenameInput) {
      // No filename provided - prompt user - express.e:20135+
      socket.emit('ansi-output', '\r\n\x1b[36mFilename(s) to download (space-separated): \x1b[0m');
      session.subState = LoggedOnSubState.DOWNLOAD_FILENAME_INPUT;
      session.tempData = { waitingForDownloadFilename: true };
      return 'SUCCESS';
    }

    // express.e:20037-20055 - Parse multiple filenames (space-separated)
    // Split by spaces to get individual filenames
    const filenames = filenameInput.split(/\s+/).filter(f => f.length > 0);
    console.log(`[DOWNLOAD] Processing ${filenames.length} filename(s):`, filenames);

    // Build file list (express.e:20037-20090 - addFlagItems logic)
    const fileList: any[] = [];

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

    if (fileList.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo files found to download.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }

    // express.e:20066 - "Checking..."
    if (fileList.length > 1) {
      socket.emit('ansi-output', '\r\n\x1b[36mChecking...\x1b[0m\r\n');
    }

    // Calculate total size for ratio check
    const totalSize = fileList.reduce((sum, file) => sum + file.size, 0);

    // Check ratio requirements - express.e:20085-20095, 19823+
    const ratioCheck = await checkDownloadRatios(session.user, totalSize);
    if (!ratioCheck.canDownload) {
      socket.emit('ansi-output', `\r\n\x1b[31m${ratioCheck.errorMessage}\x1b[0m\r\n`);
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }

    // Display file list
    socket.emit('ansi-output', `\r\n\x1b[32mFiles to download (${fileList.length}):\x1b[0m\r\n`);
    fileList.forEach((file, index) => {
      socket.emit('ansi-output', `  ${index + 1}. ${file.name} (${file.size} bytes)\r\n`);
    });
    socket.emit('ansi-output', `\r\n\x1b[32mTotal size: ${totalSize} bytes\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[36mDownload these files? (Y/N): \x1b[0m');

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

      if (answer === 'Y' || answer === 'YES') {
        // User confirmed - initiate download(s)
        if (isBatch) {
          await this.initiateBatchDownload(socket, session, fileList);
        } else {
          await this.initiateDownload(socket, session, fileList[0]);
        }
      } else {
        // User cancelled
        socket.emit('ansi-output', '\r\n\x1b[33mDownload cancelled.\x1b[0m\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      }

      session.tempData.downloadFile = null;
      session.tempData.downloadFileList = null;
      session.tempData.downloadBatch = false;
    }
  }

  /**
   * Initiate the actual download (single file)
   */
  private static async initiateDownload(
    socket: Socket,
    session: BBSSession,
    fileInfo: any
  ): Promise<void> {
    // In web context, we'll provide an HTTP download link
    // express.e would call downloadFiles() here which does protocol-based transfer

    socket.emit('ansi-output', '\r\n\x1b[32mInitiating download...\x1b[0m\r\n');

    // Generate download URL
    const downloadUrl = `/api/download/${fileInfo.confNum}/${fileInfo.dirNum}/${encodeURIComponent(fileInfo.name)}`;

    // Send download link to client
    socket.emit('download-file', {
      filename: fileInfo.name,
      size: fileInfo.size,
      url: downloadUrl,
      path: fileInfo.fullPath
    });

    socket.emit('ansi-output', `\r\n\x1b[36mDownload link: ${downloadUrl}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mClick the download link or use your browser\'s download feature.\x1b[0m\r\n');

    // Log download activity - express.e:9475+
    if (session.user) {
      // Check if file is marked as free download
      // express.e:12740 - IF((fBlock.comment[0]="F") OR (freeDownloads))
      const isFree = this.isFreeDownload(fileInfo);

      await logDownload(session.user, fileInfo.name, fileInfo.size, isFree);

      // Update user download statistics (only if not free)
      if (!isFree) {
        await updateDownloadStats(session.user, fileInfo.size);
      }
    }

    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Initiate batch download (multiple files)
   * Port from express.e:15571-15720 (downloadFiles)
   */
  private static async initiateBatchDownload(
    socket: Socket,
    session: BBSSession,
    fileList: any[]
  ): Promise<void> {
    socket.emit('ansi-output', '\r\n\x1b[32mInitiating batch download...\x1b[0m\r\n');

    // Send all files to client for download
    for (let i = 0; i < fileList.length; i++) {
      const fileInfo = fileList[i];
      const downloadUrl = `/api/download/${fileInfo.confNum}/${fileInfo.dirNum}/${encodeURIComponent(fileInfo.name)}`;

      socket.emit('ansi-output', `\r\n\x1b[36m[${i + 1}/${fileList.length}] ${fileInfo.name}\x1b[0m\r\n`);

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
        await logDownload(session.user, fileInfo.name, fileInfo.size, isFree);

        // Update stats (only if not free)
        if (!isFree) {
          await updateDownloadStats(session.user, fileInfo.size);
        }
      }
    }

    socket.emit('ansi-output', `\r\n\x1b[32mBatch download complete! (${fileList.length} files)\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
   * Find files in conference directories (supports wildcards)
   * Port from express.e:20068-20090 - wildcard matching logic
   */
  private static async findFilesInConference(
    dataDir: string,
    confNum: number,
    pattern: string
  ): Promise<any[]> {
    const confPath = path.join(dataDir, 'BBS', `Conf${String(confNum).padStart(2, '0')}`);
    const matchingFiles: any[] = [];
    const hasWildcard = this.hasWildcards(pattern);

    // Search through all DIR# directories
    for (let dirNum = 1; dirNum <= 20; dirNum++) {
      const dirPath = path.join(confPath, `Dir${dirNum}`);

      if (!fs.existsSync(dirPath)) continue;

      if (hasWildcard) {
        // Wildcard search - check all files in directory
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (this.matchesWildcard(file, pattern)) {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);

            if (stats.isFile()) {
              matchingFiles.push({
                name: file,
                size: stats.size,
                confNum: confNum,
                dirNum: dirNum,
                fullPath: filePath
              });
            }
          }
        }
      } else {
        // Exact match
        const filePath = path.join(dirPath, pattern);

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);

          if (stats.isFile()) {
            matchingFiles.push({
              name: pattern,
              size: stats.size,
              confNum: confNum,
              dirNum: dirNum,
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
   * Check download ratios and limits
   * Port from express.e:19825+ (checkRatiosAndTime)
   */
  private static async checkDownloadRatios(
    session: BBSSession,
    fileSize: number
  ): Promise<boolean> {
    const user = session.user;
    if (!user) return false;

    // Check if user has OVERRIDE_TIMELIMIT permission
    if (checkSecurity(user, ACSPermission.OVERRIDE_TIMELIMIT)) {
      return true; // Sysop can always download
    }

    // Check daily byte limit - express.e:19856
    const dailyLimit = user.todaysBytesLimit || 0;
    const dailyDownloaded = user.dailyBytesDld || 0;

    if (dailyLimit > 0) {
      const remaining = dailyLimit - dailyDownloaded;
      if (fileSize > remaining) {
        return false;
      }
    }

    // Check ratio requirements - express.e:19868-19885
    const ratio = user.ratio || 0;
    const secLibrary = user.secLibrary || 0;

    if (ratio > 0 && secLibrary > 0) {
      // Calculate available download bytes based on uploads
      const uploadBytes = user.bytesUpload || 0;
      const downloadBytes = user.bytesDownload || 0;
      const allowedDownload = (uploadBytes * ratio) - downloadBytes;

      if (fileSize > allowedDownload) {
        return false;
      }
    }

    return true;
  }

  /**
   * Update download statistics
   * Port from express.e:9475+ (logUDFile)
   */
  private static async updateDownloadStats(
    session: BBSSession,
    fileInfo: any
  ): Promise<void> {
    const user = session.user;
    if (!user) return;

    // Update user statistics
    user.downloads = (user.downloads || 0) + 1;
    user.bytesDownload = (user.bytesDownload || 0) + fileInfo.size;
    user.dailyBytesDld = (user.dailyBytesDld || 0) + fileInfo.size;

    // Save to database
    const db = require('../database').db;
    await db.updateUser(user.id, {
      downloads: user.downloads,
      bytesDownload: user.bytesDownload,
      dailyBytesDld: user.dailyBytesDld
    });

    console.log(`[DOWNLOAD STATS] User ${user.username} downloaded ${fileInfo.name} (${fileInfo.size} bytes)`);
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

    // TODO: Check if conference has FREEDOWNLOADS tooltype enabled
    // For now, only check comment marker
    return false;
  }
}
