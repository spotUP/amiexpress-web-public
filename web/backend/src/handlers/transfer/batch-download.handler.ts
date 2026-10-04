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
import { deliverFilesToCaller } from '../file/file-delivery';
import { bookDownloads, isFreeDownload, checkRatiosAndTime } from '../../services/download-booking.service';
import { checkSecurity } from '../../utils/acs.util';
import { RESULT_NOT_ALLOWED, InternalCommandResult } from '../../constants/command-results';
import { ACSPermission } from '../../constants/acs-permissions';
import { resolveFileDescription, isRestrictedComment } from '../../utils/file-restriction.util';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { getConferenceDir } from '../../utils/file-hold.util';
import { materialiseRemoteFile, storageFailureText } from '../../storage/remote-download';
import { getStorageContext, type StorageContext } from '../../storage/storage-context';
import { conferenceDownloadDirs } from '../../conferences/conference-paths';

/** A file this handler is prepared to send: always a real path on local disk. */
export interface ResolvedFile {
  name: string;
  size: number;
  confNum: number;
  dirNum: number;
  fullPath: string;
  /** Set only for a pooled file: which drive holds it, and under what key. */
  driveNumber?: number;
  objectKey?: string;
  comment?: string;
  description?: string;
  isFree?: boolean;
}

/**
 * The file behind a caller's spelling, materialised if it lives in the pool.
 *
 * A pooled area is asked FIRST, and a pooled HIT wins outright: a conference
 * whose files went to a bucket can still have a stale copy of one of them in
 * its old `Files/` directory, and serving those bytes would hand the caller a
 * version the board no longer considers current. A pooled MISS still falls
 * through to the local walk, and that local copy is then served - which is
 * deliberate, because a part-migrated conference holds some of its files in
 * each place and both have to be reachable.
 *
 * Throws `StorageUnavailableError` when the volume cannot answer. It must not
 * be caught here and turned into null: null means "no such file", and a caller
 * shown "not found" for a file that is fine is how a sysop deletes its catalog
 * row. `resolveFlaggedFile` is where that error becomes a line on a screen.
 */
export async function resolveFile(
  dataDir: string,
  confNum: number,
  filename: string,
  storage: StorageContext | null = getStorageContext()
): Promise<ResolvedFile | null> {
  if (storage) {
    const remote = await materialiseRemoteFile(filename, confNum, storage);
    if (remote) {
      return {
        name: remote.name,
        size: remote.size,
        confNum,
        dirNum: 1,
        fullPath: remote.fullPath,
        // Kept so a transfer can fetch the object again if the cache evicted
        // it between resolution and send.
        driveNumber: remote.driveNumber,
        objectKey: remote.key,
      };
    }
  }

  const confPath = getConferenceDir(confNum, dataDir);

  // Files live in Files/ or Upload/ — Dir1..DirN are AmiExpress
  // metadata text files, not directories containing downloadable files.
  //
  // DLPATH FIRST, and this is not a nicety. `moveToFiles` writes an upload
  // into the area's DLPATH (express.e:15264) while this searched only
  // `<confDir>/Files` and `<confDir>/Upload` - so on a board whose DLPATH
  // points elsewhere, a file uploaded through the BBS could never be
  // downloaded again. The live board is exactly that: `Conf2.info` says
  // `DLPATH.1=BBS:Conf3/Files`, `Conf3.info` says `BBS:Conf5/Files`.
  // Reported over FTP on 2026-09-07 as "the board lists it, but its bytes are
  // not here"; the `D` command had the same blind spot and said "not found".
  const searchDirs = [
    ...conferenceDownloadDirs(dataDir, confNum),
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
 * `resolveFile`, plus the line the caller is shown when it does not resolve.
 *
 * The three outcomes are three different sentences, and only one of them says
 * the file is missing. A storage failure reported as "File not found" is the
 * defect this whole subsystem is written around.
 */
export async function resolveFlaggedFile(
  emit: (line: string) => void,
  dataDir: string,
  confNum: number,
  filename: string,
  storage: StorageContext | null = getStorageContext()
): Promise<ResolvedFile | null> {
  let found: ResolvedFile | null;
  try {
    found = await resolveFile(dataDir, confNum, filename, storage);
  } catch (error) {
    emit(`\x1b[31m[X] ${filename}: ${storageFailureText(error)}\x1b[0m\r\n`);
    return null;
  }

  if (!found) {
    emit(`\x1b[31m[X] File not found: ${filename}\x1b[0m\r\n`);
    return null;
  }
  return found;
}

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
  ): Promise<InternalCommandResult> {
    // DB HAS NO express.e ORIGINAL. There is no internalCommandDB in the
    // dispatcher (express.e:28288-28395); downloading everything flagged in
    // one go is this port's own command. `downloadFiles` (express.e:15571),
    // which the rest of this handler ports, carries no ACS_DOWNLOAD gate at
    // all - 15598 is `IF fileList.count()=0 THEN RETURN 0`, and its one
    // access check (15602, ACS_LOCAL_DOWNLOADS) is a LOCAL-console rule that
    // prints a different sentence, "Not supported locally...".
    //
    // So this gate is ours to shape, and it is shaped after the express.e
    // command it stands in for: internalCommandD (24854), the same
    // ACS_DOWNLOAD check, a bare RETURN RESULT_NOT_ALLOWED, nothing printed.
    // A caller refused DB now hears exactly what a caller refused D hears.
    if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
      console.warn(
        `[DB] RESULT_NOT_ALLOWED: ${session.user?.username ?? '<none>'} ` +
        `(level ${session.user?.secLevel ?? '?'}) lacks ACS.DOWNLOAD. ` +
        'Grant it in Access/ACS.<level>.info.'
      );
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return RESULT_NOT_ALLOWED;
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

    // Validate and prepare each file - express.e:15671+
    for (const flagItem of flaggedFiles) {
      // resolveFlaggedFile says which of the three things happened: the file
      // is here, it is genuinely not here, or the volume holding it could not
      // answer. It emits the line for the last two - they must never read the
      // same, and this loop must not decide that they do.
      const fileInfo = await resolveFlaggedFile(
        (line: string) => socket.emit('ansi-output', line),
        config.get('dataDir'),
        flagItem.confNum,
        flagItem.fileName
      );

      if (!fileInfo) {
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
      // resolveFile does not populate comments — resolve the DIR
      // description (single source of truth in file-restriction.util) so the
      // Restricted gate actually fires (it never did with the empty comment).
      const fileComment = fileInfo.comment || fileInfo.description ||
        await resolveFileDescription(flagItem.confNum, config.get('dataDir'), flagItem.fileName);
      if (isRestrictedComment(fileComment)) {
        socket.emit('ansi-output', `\x1b[31m[X] ${flagItem.fileName}: restricted file\x1b[0m\r\n`);
        try {
          const { callersLog } = require('../../server/database-helpers');
          await callersLog(session.user?.id || null, session.user?.username || 'unknown',
            `\t\tAttempt to download RESTRICTED file [${fileInfo.fullPath || fileInfo.name || flagItem.fileName}]`);
          // express.e:12750-12751 - and the node's CallersLog.
          require('../../services/CallersLogManager').callersLogManager.logActivity(session.nodeId ?? 1,
            `\t\tAttempt to download RESTRICTED file [${fileInfo.fullPath || fileInfo.name || flagItem.fileName}]`);
        } catch (_err) { /* non-critical */ }
        failCount++;
        continue;
      }

      fileInfo.confNum = fileInfo.confNum ?? flagItem.confNum;
      fileInfo.isFree = isFreeDownload(fileInfo);
      downloadList.push(fileInfo);
      socket.emit('ansi-output', `\x1b[32m[OK] Queued: ${flagItem.fileName} (${fileInfo.size} bytes)\x1b[0m\r\n`);
      successCount++;
    }

    if (downloadList.length === 0) {
      socket.emit('ansi-output', '\r\n\x1b[31mNo files available for download.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e:19823-19926 checkRatiosAndTime - the same gate D asks
    const ratioCheck = await checkRatiosAndTime(session, downloadList);
    if (ratioCheck.status === 0) {
      socket.emit('ansi-output', `\r\n\x1b[31m${ratioCheck.error}\x1b[0m\r\n`);
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
      const wasPartUpload = !!session.tempData.pendingGoodbyePartUpload;
      delete session.tempData.pendingGoodbye;
      delete session.tempData.pendingGoodbyeParams;
      delete session.tempData.pendingGoodbyePartUpload;
      if (answer === 'Y' && wasPartUpload) {
        // express.e:25056 - partUploadOK returning SUCCESS falls through to
        // checkFlagged, so answering Y here resumes the SAME logoff and must
        // not ask about the partial uploads a second time.
        session.tempData.partUploadAcknowledged = true;
        const { handleGoodbyeCommand } = require('../commands/system-commands.handler');
        handleGoodbyeCommand(socket, session, pendingParams);
        return;
      }
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

    /**
     * TP-11. This used to emit the browser's `download-file` trigger per
     * file whatever the transport was, print "Check your browser downloads"
     * and book the statistics - so a telnet caller was told the transfer
     * finished while not one byte had been sent. The single-file path had
     * been fixed years earlier; this one never was.
     *
     * The decision is `deliverFilesToCaller`'s now, and the completion text
     * and the accounting follow what it answers.
     */
    const route = await deliverFilesToCaller(socket, session, downloadList, {
      // Charged when the transfer FINISHES and only if it went, as `D` is
      // (express.e:15437). This booked before sz was spawned, so an aborted
      // batch was charged in full (web-vs-telnet audit item 19).
      onTransferFinished: async (ok: boolean) => {
        if (ok) await bookDownloads(session, downloadList);
      },
    });

    if (route === 'refused') {
      // Nothing was sent, so nothing is booked and no flag is cleared: the
      // caller can try again from a client that can receive.
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    if (route === 'zmodem') {
      socket.emit('ansi-output', `\r\n\x1b[32mSENDING ${downloadList.length} FILE(S) VIA ZMODEM\x1b[0m\r\n`);
    } else {
      for (const fileInfo of downloadList) {
        socket.emit('ansi-output', `\x1b[32m-> Downloading: ${fileInfo.name || fileInfo.filename}\x1b[0m\r\n`);
      }
      // The browser reports no completion: charged at handoff, the same books.
      await bookDownloads(session, downloadList);
      socket.emit('ansi-output', `\r\n\x1b[32m[OK] Batch download complete! ${downloadList.length} file(s) queued.\x1b[0m\r\n`);
      socket.emit('ansi-output', '\x1b[36mCheck your browser downloads.\x1b[0m\r\n');
    }

    // Clear flags after successful batch download - express.e:20249
    if (session.flagManager) {
      session.flagManager.clearAll();
      socket.emit('ansi-output', '\r\n\x1b[33mAll flags cleared.\x1b[0m\r\n');
      await session.flagManager.save();
    }

    session.subState = LoggedOnSubState.DISPLAY_MENU;

    // pendingGoodbye is handled before the download loop — not reachable here
  }

}
