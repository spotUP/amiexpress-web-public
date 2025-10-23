/**
 * Batch Download Handler
 * Port from express.e:15571 (downloadFiles)
 *
 * Downloads all flagged files via browser downloads
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Batch Download Handler
 * Downloads all flagged files
 */
export class BatchDownloadHandler {
  /**
   * Handle batch download - Download all flagged files
   * Port from express.e:15571+ (downloadFiles)
   *
   * In web context, this triggers multiple browser downloads
   */
  static async handleBatchDownload(
    socket: Socket,
    session: BBSSession
  ): Promise<void> {
    // Check security - express.e:15598-15602
    if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
      socket.emit('ansi-output', '\x1b[31mPermission denied.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Get flagged files - express.e:15595-15597
    if (!session.flagManager) {
      socket.emit('ansi-output', '\r\n\x1b[33mNo files flagged for download.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const flaggedFiles = session.flagManager.getAll();

    if (flaggedFiles.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[33mNo files flagged for download.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const config = (global as any).config;

    socket.emit('ansi-output', `\r\n\x1b[32mPreparing to download ${flaggedFiles.length} flagged file(s)...\x1b[0m\r\n\r\n`);

    let successCount = 0;
    let failCount = 0;
    const downloadList: any[] = [];

    // Validate and prepare each file - express.e:15671+
    for (const flagItem of flaggedFiles) {
      const fileInfo = await this.findFileInConference(
        config.dataDir,
        flagItem.confNum,
        flagItem.fileName
      );

      if (!fileInfo) {
        socket.emit('ansi-output', `\x1b[31m✗ File not found: ${flagItem.fileName}\x1b[0m\r\n`);
        failCount++;
        continue;
      }

      // Check ratio for this file
      const canDownload = await this.checkDownloadRatios(session, fileInfo.size);
      if (!canDownload) {
        socket.emit('ansi-output', `\x1b[31m✗ Insufficient quota for: ${flagItem.fileName}\x1b[0m\r\n`);
        failCount++;
        continue;
      }

      downloadList.push(fileInfo);
      socket.emit('ansi-output', `\x1b[32m✓ Queued: ${flagItem.fileName} (${fileInfo.size} bytes)\x1b[0m\r\n`);
      successCount++;
    }

    if (downloadList.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo files available for download.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Display summary - express.e:20215-20224
    const totalBytes = downloadList.reduce((sum, file) => sum + file.size, 0);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    socket.emit('ansi-output', `\r\n\x1b[36mBatch Download Summary:\x1b[0m\r\n`);
    socket.emit('ansi-output', `  Files: ${successCount}\r\n`);
    socket.emit('ansi-output', `  Total Size: ${totalMB} MB\r\n`);
    socket.emit('ansi-output', `  Failed: ${failCount}\r\n`);

    // Confirm download - express.e:20226-20235
    socket.emit('ansi-output', '\r\n\x1b[33mStart batch download? (Y/N): \x1b[0m');
    session.subState = LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM;
    session.tempData = {
      waitingForBatchConfirm: true,
      batchDownloadList: downloadList,
      successCount,
      failCount
    };
  }

  /**
   * Handle batch download confirmation
   */
  static async handleBatchConfirm(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (!session.tempData?.waitingForBatchConfirm) {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    session.tempData.waitingForBatchConfirm = false;
    const downloadList = session.tempData.batchDownloadList || [];

    const answer = input.trim().toUpperCase();

    if (answer !== 'Y' && answer !== 'YES') {
      socket.emit('ansi-output', '\r\n\x1b[33mBatch download cancelled.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Initiate batch download - express.e:20236-20250
    socket.emit('ansi-output', '\r\n\x1b[32mInitiating batch download...\x1b[0m\r\n\r\n');

    // Emit download events for browser to handle
    for (const fileInfo of downloadList) {
      const downloadUrl = `/api/download/${fileInfo.confNum}/${fileInfo.dirNum}/${encodeURIComponent(fileInfo.name)}`;

      // Emit download-file event for each file
      socket.emit('download-file', {
        filename: fileInfo.name,
        size: fileInfo.size,
        url: downloadUrl,
        path: fileInfo.fullPath
      });

      socket.emit('ansi-output', `\x1b[32m→ Downloading: ${fileInfo.name}\x1b[0m\r\n`);

      // Update download statistics for each file
      await this.updateDownloadStats(session, fileInfo);
    }

    socket.emit('ansi-output', `\r\n\x1b[32m✓ Batch download complete! ${downloadList.length} file(s) queued.\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[36mCheck your browser downloads.\x1b[0m\r\n');

    // Clear flags after successful batch download - express.e:20249
    if (session.flagManager) {
      session.flagManager.clearAll();
      socket.emit('ansi-output', '\r\n\x1b[33mAll flags cleared.\x1b[0m\r\n');
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
   * Check download ratios and limits
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

    // Check daily byte limit
    const dailyLimit = user.todaysBytesLimit || 0;
    const dailyDownloaded = user.dailyBytesDld || 0;

    if (dailyLimit > 0) {
      const remaining = dailyLimit - dailyDownloaded;
      if (fileSize > remaining) {
        return false;
      }
    }

    // Check ratio requirements
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
    console.log(`[BATCH DOWNLOAD] User ${user.username} downloaded ${fileInfo.name} (${fileInfo.size} bytes)`);
  }
}
