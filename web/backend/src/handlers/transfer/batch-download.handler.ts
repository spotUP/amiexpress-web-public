/**
 * Batch Download Handler
 * Port from express.e:15571 (downloadFiles)
 *
 * Downloads all flagged files via browser downloads
 */

import { Socket } from 'socket.io';
import { config } from '../../config';
import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity, getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkDownloadRatios, updateDownloadStats as applyDownloadStats, creditAccountTrackDownloads } from '../../utils/download-ratios.util';
import { ConferenceRepository } from '../../database/conference-repository';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { getConferenceDir } from '../../utils/file-hold.util';

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


    socket.emit('ansi-output', `\r\n\x1b[32mPreparing to download ${flaggedFiles.length} flagged file(s)...\x1b[0m\r\n\r\n`);

    let successCount = 0;
    let failCount = 0;
    const downloadList: any[] = [];
    const ratioRequests: { size: number; isFree?: boolean; conference?: number }[] = [];

    // Validate and prepare each file - express.e:15671+
    for (const flagItem of flaggedFiles) {
      const fileInfo = await this.findFileInConference(
        config.get('dataDir'),
        flagItem.confNum,
        flagItem.fileName
      );

      if (!fileInfo) {
        socket.emit('ansi-output', `\x1b[31m[X] File not found: ${flagItem.fileName}\x1b[0m\r\n`);
        failCount++;
        continue;
      }

      // express.e checkFIBForFileSize — reject files whose comment
      // starts "Restricted". This is the SAME gate as the single-file
      // download path at download.handler.ts:340, but the batch path
      // (F+D / flagged-files download) was bypassing it — a user could
      // flag a Restricted file then download it via batch. The
      // restricted-attempt is logged to callersLog per express.e for
      // sysop visibility.
      const fileComment = (fileInfo.comment || fileInfo.description || '');
      if (typeof fileComment === 'string' && fileComment.toLowerCase().startsWith('restricted')) {
        socket.emit('ansi-output', `\x1b[31m[X] ${flagItem.fileName}: restricted file\x1b[0m\r\n`);
        try {
          const { callersLog } = require('../../server/database-helpers');
          await callersLog(session.user?.id || null, session.user?.username || 'unknown',
            `\t\tAttempt to download RESTRICTED file [${fileInfo.fullPath || fileInfo.name || flagItem.fileName}]`);
        } catch (_err) { /* non-critical */ }
        failCount++;
        continue;
      }

      const isFree = this.isFreeDownload(fileInfo);
      fileInfo.isFree = isFree;
      downloadList.push(fileInfo);
      ratioRequests.push({
        size: fileInfo.size,
        isFree,
        conference: flagItem.confNum
      });
      socket.emit('ansi-output', `\x1b[32m[OK] Queued: ${flagItem.fileName} (${fileInfo.size} bytes)\x1b[0m\r\n`);
      successCount++;
    }

    if (downloadList.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo files available for download.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Global ratio/byte gating (express.e:19823+)
    const ratioCheck = await checkDownloadRatios(
      session.user,
      ratioRequests,
      await this.loadConferences(session),
      checkSecurity(session.user, ACSPermission.CONFERENCE_ACCOUNTING),
      getACSConfig().toggles[ToggleFlags.CREDITBYKB] === true
    );
    if (!ratioCheck.canDownload) {
      socket.emit('ansi-output', `\r\n\x1b[31m${ratioCheck.errorMessage}\x1b[0m\r\n`);
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
    const answer = input.trim().toUpperCase();

    // express.e:12670 — pendingGoodbye uses BATCH_DOWNLOAD_CONFIRM but does
    // NOT also set waitingForBatchConfirm/downloadFileList. Handle this
    // branch BEFORE the early-return guard below so a Y/N at the
    // "Do you leave without them?" prompt actually drives the logoff.
    if (session.tempData?.pendingGoodbye) {
      const pendingParams = session.tempData.pendingGoodbyeParams || 'Y';
      delete session.tempData.pendingGoodbye;
      delete session.tempData.pendingGoodbyeParams;
      if (answer === 'Y') {
        const { handleGoodbyeCommand } = require('../commands/system-commands.handler');
        handleGoodbyeCommand(socket, session, pendingParams);
      } else {
        socket.emit('ansi-output', '\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      }
      return;
    }

    // Support both the flagManager batch flow and the file selector batch flow
    if (!session.tempData?.waitingForBatchConfirm && !session.tempData?.downloadFileList) {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    session.tempData.waitingForBatchConfirm = false;
    const downloadList = session.tempData.batchDownloadList || session.tempData.downloadFileList || [];

    if (answer !== 'Y' && answer !== 'YES') {
      socket.emit('ansi-output', '\r\n\x1b[33mBatch download cancelled.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Initiate batch download - express.e:20236-20250
    socket.emit('ansi-output', '\r\n\x1b[32mInitiating batch download...\x1b[0m\r\n\r\n');

    // Emit download events for browser to handle
    for (const fileInfo of downloadList) {
      // Support both formats: name (flagManager) and filename (file selector)
      const fileName = fileInfo.name || fileInfo.filename;
      const confNum = fileInfo.confNum || fileInfo.areaId || session.currentConf || 1;
      const dirNum = fileInfo.dirNum || 1;
      const filePath = fileInfo.fullPath || fileInfo.path;

      const downloadUrl = `/api/download/${confNum}/${dirNum}/${encodeURIComponent(fileName)}`;

      // Emit download-file event for each file
      socket.emit('download-file', {
        filename: fileName,
        size: fileInfo.size,
        url: downloadUrl,
        path: filePath
      });

      socket.emit('ansi-output', `\x1b[32m-> Downloading: ${fileName}\x1b[0m\r\n`);

      // Update download statistics for each file
      const isFree = this.isFreeDownload(fileInfo);
      await this.updateDownloadStats(session, fileInfo, isFree);
      await this.updateConferenceDownloadStats(session, fileInfo, isFree);
    }

    socket.emit('ansi-output', `\r\n\x1b[32m[OK] Batch download complete! ${downloadList.length} file(s) queued.\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[36mCheck your browser downloads.\x1b[0m\r\n');

    // Clear flags after successful batch download - express.e:20249
    if (session.flagManager) {
      session.flagManager.clearAll();
      socket.emit('ansi-output', '\r\n\x1b[33mAll flags cleared.\x1b[0m\r\n');
      await session.flagManager.save();
    }

    session.subState = LoggedOnSubState.DISPLAY_MENU;

    // pendingGoodbye is handled before the download loop — not reachable here
  }

  /**
   * Determine if a file is flagged as free download
   */
  private static isFreeDownload(fileInfo: any): boolean {
    if (!fileInfo) return false;
    if (fileInfo.isFree === true) return true;
    if (typeof fileInfo.comment === 'string' && fileInfo.comment.toUpperCase().startsWith('F')) {
      return true;
    }
    if (fileInfo.confNum) {
      const flags = getConferenceToolFlags(fileInfo.confNum);
      if (flags.freeDownloads) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find file in conference directories
   */
  private static async findFileInConference(
    dataDir: string,
    confNum: number,
    filename: string
  ): Promise<any | null> {
    const confPath = getConferenceDir(confNum, dataDir);

    // Files live in Files/ or Upload/ — Dir1..DirN are AmiExpress
    // metadata text files, not directories containing downloadable files.
    const searchDirs = [
      path.join(confPath, 'Files'),
      path.join(confPath, 'Upload'),
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      const filePath = path.join(dir, filename);
      const resolved = amigafs.resolvePath(filePath); // case-insensitive
      if (!resolved) continue;

      const stats = fs.statSync(resolved);
      if (!stats.isFile()) continue;

      return {
        name: path.basename(resolved), // actual on-disk case
        size: stats.size,
        confNum,
        dirNum: 1,
        fullPath: resolved,
      };
    }

    return null;
  }

  /**
   * Update download statistics
   */
  private static async updateDownloadStats(
    session: BBSSession,
    fileInfo: any,
    isFree: boolean = false
  ): Promise<void> {
    const user = session.user;
    if (!user) return;

    await applyDownloadStats(user, fileInfo.size, isFree);

    // Save to database
    const db = require('../database').db;
    await db.updateUser(user.id, {
      downloads: user.downloads,
      bytesDownload: user.bytesDownload,
      dailyBytesDld: user.dailyBytesDld,
      bytesAvailableForDownload: user.bytesAvailableForDownload,
      lastDownloadTime: user.lastDownloadTime
    });

console.log(`[BATCH DOWNLOAD] User ${user.username} downloaded ${fileInfo.name} (${fileInfo.size} bytes)`);
  }

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
      const conferences = await this.loadConferences(session);
      const target = conferences?.find(c => c.id === fileInfo.confNum);
      if (!target) return;

      target.downloads = (target.downloads || 0) + 1;
      target.bytesDownload = (target.bytesDownload || 0) + (fileInfo.size || 0);

      const rawDb = (require('../database').db as any).db ?? require('../database').db;
      const repo = new ConferenceRepository(rawDb);
      await repo.updateConference(target.id, {
        downloads: target.downloads,
        bytesDownload: target.bytesDownload
      });
    } catch (err) {
console.error('[BATCH DOWNLOAD] Failed to persist conference download stats', err);
    }
  }

  private static async loadConferences(session: BBSSession) {
    if (session.conferences && Array.isArray(session.conferences)) {
      return session.conferences;
    }
    try {
      const repo = new ConferenceRepository(require('../database').db);
      const confs = await repo.getConferences();
      session.conferences = confs;
      return confs;
    } catch (err) {
console.error('[BATCH DOWNLOAD] Failed to load conferences for accounting', err);
      return undefined;
    }
  }
}
