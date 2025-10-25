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
   * Download a file - main download logic
   * Port from express.e:20075+ (downloadAFile)
   */
  private static async downloadAFile(
    socket: Socket,
    session: BBSSession,
    params: string
  ): Promise<string> {

    // Parse parameters or prompt for filename
    let filename = params.trim();

    if (!filename) {
      // No filename provided - prompt user - express.e:20135+
      socket.emit('ansi-output', '\r\n\x1b[36mFilename to download: \x1b[0m');
      session.subState = LoggedOnSubState.DOWNLOAD_FILENAME_INPUT;
      session.tempData = { waitingForDownloadFilename: true };
      return 'SUCCESS';
    }

    // Validate filename - express.e:20136-20155
    if (!this.isValidFilename(filename)) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid filename.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }

    // Check if wildcards are used without permission - express.e:20140-20145
    if (this.hasWildcards(filename) && !checkSecurity(session.user, ACSPermission.FILE_EXPANSION)) {
      socket.emit('ansi-output', '\r\n\x1b[31mYou may not include any special symbols\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }

    // Check if file exists in conference
    const fileInfo = await this.findFileInConference(
      config.get('dataDir'),
      session.currentConf || 1,
      filename
    );

    if (!fileInfo) {
      socket.emit('ansi-output', '\r\n\x1b[31mFile not found.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }

    // Check ratio requirements - express.e:20085-20095, 19823+
    const ratioCheck = await checkDownloadRatios(session.user, fileInfo.size);
    if (!ratioCheck.canDownload) {
      socket.emit('ansi-output', `\r\n\x1b[31m${ratioCheck.errorMessage}\x1b[0m\r\n`);
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return 'FAILURE';
    }

    // Display file info and confirmation prompt
    socket.emit('ansi-output', `\r\n\x1b[32mFile: ${fileInfo.name}\x1b[0m\r\n`);
    socket.emit('ansi-output', `\x1b[32mSize: ${fileInfo.size} bytes\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[36mDownload this file? (Y/N): \x1b[0m');

    // Set state to wait for confirmation
    session.subState = LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT;
    session.tempData = {
      waitingForDownloadConfirm: true,
      downloadFile: fileInfo
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
      const fileInfo = session.tempData.downloadFile;

      const answer = input.trim().toUpperCase();

      if (answer === 'Y' || answer === 'YES') {
        // User confirmed - initiate download
        await this.initiateDownload(socket, session, fileInfo);
      } else {
        // User cancelled
        socket.emit('ansi-output', '\r\n\x1b[33mDownload cancelled.\x1b[0m\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      }

      session.tempData.downloadFile = null;
    }
  }

  /**
   * Initiate the actual download
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
      const isFree = false; // TODO: Check if file is marked as free download
      await logDownload(session.user, fileInfo.name, fileInfo.size, isFree);

      // Update user download statistics
      await updateDownloadStats(session.user, fileInfo.size);
    }

    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Find file in conference directories
   */
  private static async findFileInConference(
    dataDir: string,
    confNum: number,
    filename: string
  ): Promise<any | null> {
    const confPath = path.join(dataDir, 'BBS', `Conf${String(confNum).padStart(2, '0')}`);

    // Search through all DIR# directories
    for (let dirNum = 1; dirNum <= 20; dirNum++) {
      const dirPath = path.join(confPath, `Dir${dirNum}`);

      if (!fs.existsSync(dirPath)) continue;

      const filePath = path.join(dirPath, filename);

      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);

        return {
          name: filename,
          size: stats.size,
          confNum: confNum,
          dirNum: dirNum,
          fullPath: filePath
        };
      }
    }

    return null;
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

    // TODO: Save to database
    console.log(`[DOWNLOAD STATS] User ${user.username} downloaded ${fileInfo.name} (${fileInfo.size} bytes)`);
  }
}
