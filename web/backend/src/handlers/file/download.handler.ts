/**
 * Download Handler
 * 1:1 port from express.e:
 *   24853 internalCommandD
 *   19791 beginDLF
 *   19941 downloadAFile
 *   12680 displayULStats
 *   19784 downloadPrompt
 *   20182 protocol estimate header
 *   20210 LAST CHANCE prompt
 *   20251 post-transfer stats
 *   20317 pGoodbye on G
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { deliverFilesToCaller, deliveryRouteFor } from './file-delivery';
import { checkSecurity, getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { updateDownloadStats, creditAccountEnabled } from '../../utils/download-ratios.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { db } from '../../database';
import { config } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { FileFlagManager } from '../../utils/file-flag.util';
import { getConferenceDir } from '../../utils/file-hold.util';
import { resolveFileDescription, isRestrictedComment } from '../../utils/file-restriction.util';
import { bookDownloads, isFreeDownload, checkRatiosAndTime, estimatedDownloadCps } from '../../services/download-booking.service';
import {
  listRemoteMatches,
  locateRemoteFile,
  rematerialise,
  storageFailureText,
  type RemoteListingResult,
} from '../../storage/remote-download';
import { getStorageContext } from '../../storage/storage-context';
import { getTimeRemainingMinutes } from '../../utils/time-tracking.util';
import { DEFAULT_CONNECTION_BAUD } from '../../constants/modem';
import { deviceMounted, resolveAssignPath } from '../../utils/path-util';

export class DownloadHandler {
  /**
   * D and DS command entry point — express.e:24853-24858 internalCommandD.
   * processBBSCommand sends both codes here with the code typed
   * (express.e:28300-28303); downloadAFile tells them apart (20040).
   */
  static async handleDownloadCommand(
    socket: Socket,
    session: BBSSession,
    params: string = '',
    cmdcode: string = 'D'
  ): Promise<void> {
    // express.e:24854 checkSecurity(ACS_DOWNLOAD)
    if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
      socket.emit('ansi-output', '\r\nPermission denied.\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e:24855 setEnvStat(ENV_DOWNLOADING)
    console.log('[ENV] Downloading');

    // express.e:24857 beginDLF(cmdcode,params)
    await this.beginDLF(socket, session, params, cmdcode);
  }

  /**
   * express.e:19791 beginDLF → downloadAFile
   * Begins download flow: shows header, handles flagged/param files or
   * drops into filename-input loop.
   */
  private static async beginDLF(
    socket: Socket,
    session: BBSSession,
    params: string,
    cmdcode: string = 'D'
  ): Promise<void> {
    // express.e:19960 aePuts('\b\n')
    socket.emit('ansi-output', '\r\n');

    // express.e:19961-19964 IF(maxDirs=0) myError(5) RETURN RESULT_FAILURE
    // The conference's own count - the icon's NDIRS - as express.e's maxDirs.
    // (This asked a FileAreaManager method that never existed, so the check
    // never ran.)
    const { getMaxDirs } = require('../../utils/max-dirs.util');
    if ((await getMaxDirs(session.currentConf || 1, config.get('dataDir'))) === 0) {
      // express.e:8528-8530 myError(ERR_NOFILES=5): 'No files available in this conference.\b\n\b\n'
      socket.emit('ansi-output', 'No files available in this conference.\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e:19966-19971 IF(quietDownload=FALSE) IF(displayScreen(SCREEN_DOWNLOAD)) doPause() \b\n
    // The DOWNLOAD screen is optional (express.e treats a missing file as a falsy return and
    // moves on silently). Pass silent=true so absence does not log "Screen not found" or
    // notify the sysop — matches the express.e contract.
    try {
      const { displayScreen, doPause } = require('../screen.handler');
      if (typeof displayScreen === 'function') {
        // 'DOWNLOADMSG', not 'DOWNLOAD': the routing table keys on the former
        // (screen-tables.ts:69). Asking for 'DOWNLOAD' made getScreenDirType
        // answer null, which makes the search list EMPTY - so the screen could
        // never be found however well it was drawn, and the `catch` below hid it.
        const shown = await displayScreen(socket, session, 'DOWNLOADMSG', true, true);
        if (shown) {
          /*
           * express.e's doPause() BLOCKS: the stats and the Filespec prompt
           * come after the key. This called the port's doPause and carried
           * straight on, so the caller saw "(Pause)...Space To Resume:" with
           * the stats already printed under it and the pause answering
           * nothing (walked over telnet, 2026-09-27). Its continuation is the
           * key being pressed; wait for it.
           */
          if (typeof doPause === 'function') {
            await new Promise<void>((resolve) => doPause(socket, session, () => resolve()));
          }
          socket.emit('ansi-output', '\r\n');
        }
      }
    } catch { /* screen file may not exist — silent */ }

    // express.e:19981 displayULStats(loggedOnUser,loggedOnUserMisc)
    this.displayULStats(socket, session);

    // express.e:19983-20028 ratio check
    const user = session.user!;
    if (!user.secLibrary) {
      // express.e:20027 'Download to Upload Ratio : Disabled.\b\n'
      socket.emit('ansi-output', 'Download to Upload Ratio : Disabled.\r\n');
    } else {
      const secBoard = (user as any).secBoard || 0;
      const creditByKB = !!(getACSConfig().toggles as any)?.[ToggleFlags.CREDITBYKB];

      // express.e:19984 IF((secBoard>0) AND (creditAccountEnabled=FALSE))
      // → 'Files Avail before UL : \d\b\n'
      if (secBoard > 0) {
        const cnt = (user.secLibrary) * ((user.uploads || 0) + 1) - (user.downloads || 0);
        socket.emit('ansi-output', `Files Avail before UL : ${cnt}\r\n`);
        if (cnt < 1) {
          // express.e:12677 exceedRatio()
          socket.emit('ansi-output', 'You have exceeded your ratio, you must upload first.\r\n\r\n');
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      }

      // express.e:19993 IF(secBoard<2) — bytes ratio
      if (secBoard < 2) {
        // Simplified: integer math in place of BCD (express.e uses BCD for large values)
        const ulBytes  = user.bytesUpload   || 0;
        const dlBytes  = user.bytesDownload || 0;
        const avail    = Math.max(0, user.secLibrary * ulBytes - dlBytes);
        const exceeded = user.secLibrary * ulBytes - dlBytes < 1;
        if (creditByKB) {
          // express.e:20015 'KBytes Avail before UL : \s\b\n'
          const availKb = Math.floor(avail / 1024);
          socket.emit('ansi-output', `KBytes Avail before UL : ${availKb}\r\n`);
        } else {
          // express.e:20017 'Bytes Avail before UL : \s\b\n'
          socket.emit('ansi-output', `Bytes Avail before UL : ${avail}\r\n`);
        }
        if (exceeded) {
          // express.e:12677 exceedRatio()
          socket.emit('ansi-output', 'You have exceeded your ratio, you must upload first.\r\n\r\n');
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      }
    }

    // express.e:20030-20035 'Space between filenames.  ' + [No ]'Wildcards permitted.\b\n'
    socket.emit('ansi-output', 'Space between filenames.  ');
    if (checkSecurity(user, ACSPermission.FILE_EXPANSION)) {
      socket.emit('ansi-output', 'Wildcards permitted.\r\n');
    } else {
      socket.emit('ansi-output', 'No Wildcards permitted.\r\n');
    }

    /*
     * express.e:20038-20056 - DS from a caller with ACS_SYSOP_DOWNLOAD is a
     * sysop download: the line goes to the CallersLog and the UDLog, the
     * names typed are AmigaDOS paths (any mounted device, no file area), and
     * the caller's flagged files stay out of it. DS from anyone else is D.
     */
    const sysopdl = cmdcode.toUpperCase() === 'DS' && checkSecurity(user, ACSPermission.SYSOP_DOWNLOAD);
    if (sysopdl) {
      const line = `\tSYSOP DOWNLOAD: ${cmdcode}`;
      const logging = require('../../utils/download-logging.util');
      await logging.writeToCallersLog(line, session.nodeId || 1);
      await logging.writeToUDLog(line, session.nodeId || 1);
    }

    // Collect pre-flagged/params files into fileList — express.e:20037-20097
    // express.e: addFlagItems(tempList,currentConf,params) + flagFilesList items
    // If any are present, tempList.count()<>0 → show '\b\nChecking...\b\n' (line 20066)
    const fileList: any[] = [];

    // Flagged files live on session.flaggedFiles. The F command (display-file-commands.handler.ts)
    // and the door-side JH_FLAGFILE handler (xim/system-commands.ts) both push objects shaped
    // {filename, confNum, ...}. Earlier code looked at session.tempData?.flaggedFiles and used
    // a camelCase `fileName` property — neither of which matches the producers, so flags from
    // the file-listing UI never made it into the download set.
    const sessionFlaggedFiles: any[] = Array.isArray((session as any).flaggedFiles)
      ? (session as any).flaggedFiles
      : [];
    const hasFlags = !sysopdl && (
      (session.flagManager instanceof FileFlagManager && session.flagManager.getCount() > 0)
      || sessionFlaggedFiles.length > 0);
    const hasParams = !!params.trim();

    if (hasFlags || hasParams) {
      // express.e:20066 '\b\nChecking...\b\n'
      socket.emit('ansi-output', '\r\nChecking...\r\n');

      if (hasFlags) {
        const dataDir = config.get('dataDir');
        if (session.flagManager instanceof FileFlagManager) {
          for (const f of session.flagManager.getAll()) {
            const found = await this.findFilesReporting(socket, dataDir, f.confNum, f.filename);
            if (found === null) continue; // the volume could not answer; already reported
            for (const file of found) {
              // express.e:12736 — checkFIBForFileSize prints one line per file
              // it accepts into the download set. Without this our pre-load
              // path was silent: the user pressed `d` and saw only the
              // filespec prompt with no list of what was queued.
              this.printFileFound(socket, session, file);
              fileList.push(file);
            }
          }
        }
        for (const f of sessionFlaggedFiles) {
          // Accept both {filename} (F command, JH_FLAGFILE) and legacy {fileName}.
          const name = f?.filename || f?.fileName || (typeof f === 'string' ? f : '');
          if (name) {
            const found = await this.findFilesReporting(
              socket, dataDir, f?.confNum || session.currentConf || 1, name);
            if (found === null) continue; // the volume could not answer; already reported
            for (const file of found) {
              this.printFileFound(socket, session, file);
              fileList.push(file);
            }
          }
        }
      }

      if (hasParams && sysopdl) {
        // express.e:20079-20086 every name is checked before any is looked
        // up; a wildcard anywhere ends the list (JUMP arestart1).
        const names = params.trim().split(/\s+/).filter(n => n.length > 0);
        if (names.some((n) => this.hasWildcards(n))) {
          socket.emit('ansi-output', '\r\nSysop download doesn\'t support wildcards\r\n');
        } else {
          // express.e:20088 checklist() -> checkForFileSize, one name at a time
          for (const name of names) await this.addSysopFile(socket, session, name, fileList);
        }
      } else if (hasParams) {
        const hasExpansion = checkSecurity(user, ACSPermission.FILE_EXPANSION);
        for (const name of params.trim().split(/\s+/).filter(n => n.length > 0)) {
          const err = this.validateFilenameStr(name, hasExpansion);
          if (err) { socket.emit('ansi-output', `\r\n${err}\r\n`); continue; }
          const found = await this.findFilesReporting(
            socket, config.get('dataDir'), session.currentConf || 1, name);
          if (found === null) continue; // the volume could not answer; already reported
          if (found.length === 0) {
            socket.emit('ansi-output', `\r\nFile not found: ${name}\r\n`);
            continue;
          }
          for (const file of found) {
            this.printFileFound(socket, session, file);
            fileList.push(file);
          }
        }
      }
    }

    // Initialize download session state — always drop into the LOOP (express.e:20107+)
    // The LOOP runs regardless of pre-loaded files; user can add more or press blank.
    session.tempData = {
      downloadFileList: fileList,
      downloadNumFiles: fileList.length,
      sysopDownload: sysopdl,
    };

    // express.e:20107 LOOP — show filespec prompt, wait for filename input
    await this.showFilespecPrompt(socket, session);
    session.subState = LoggedOnSubState.DOWNLOAD_FILENAME_INPUT;
  }

  /**
   * express.e:20107-20124 - the top of the filespec loop: checkRatiosAndTime
   * for the set so far, then downloadPrompt (19784-19789) with what is left.
   * Refused: the reason, and the command ends. The file allowance used up
   * exactly: no more filespecs, straight to LAST CHANCE.
   * ratioType = loggedOnUser.secBoard (0=bytes, 1=bytes+files, 2=files)
   */
  private static async showFilespecPrompt(socket: Socket, session: BBSSession): Promise<void> {
    const user = session.user!;
    const fileList: any[] = session.tempData?.downloadFileList || [];
    // A line-input prompt and a pagination gate are mutually exclusive:
    // express.e's lineInput() never has a pending pause, but a stale gate
    // can sit armed here (preamble doPause, re-armed screen gate), and
    // handleCommand gives the gate priority — the first Enter vanishes
    // into handlePaginatedScreenInput (a bare newline) and only the
    // second reaches the filename loop. Live log 2026-09-10: ENTRY
    // download_filename_input paginatedScreen=true. Disarm on EVERY
    // filespec prompt, not just loop entry: the gate re-armed mid-loop
    // (Filespec 1-3 worked, Filespec 4 ate one Enter).
    session.paginatedScreen = undefined;
    session.menuPause = false;

    const check = await checkRatiosAndTime(session, fileList);
    if (check.status === 0) {
      // express.e:20109-20112 StrAdd(string,'\b\n\b\n'); aePuts(string)
      socket.emit('ansi-output', `${check.error}\r\n\r\n`);
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }
    // express.e:20113 IF status=1 THEN JUMP astart
    if (check.status === 1) {
      await this.showLastChance(socket, session);
      return;
    }

    const filespecNum = fileList.length + 1;
    const minsLeft = check.minsLeft;

    if (!user.secLibrary || creditAccountEnabled(user)) {
      // express.e:20118 '\b\n\d mins, (Ratio Disabled), Filespec(\d): '
      socket.emit('ansi-output', `\r\n${minsLeft} mins, (Ratio Disabled), Filespec(${filespecNum}): `);
    } else {
      // express.e:19784-19789 downloadPrompt — ratioType stored in loggedOnUser.secBoard
      // ratioType=0: bytes only  '\b\n\d mins, \d bytes, Filespec(\d): '
      // ratioType=2: files only  '\b\n\d mins, \d files, Filespec(\d): '
      // ratioType=1: bytes+files '\b\n\d mins, \d bytes, \d files, Filespec(\d): '
      const ratioType = (user as any).secBoard || 0;
      const bytesAvail = check.bytesLeft ?? 0;
      const filesAvail = check.filesLeft ?? 0;

      if (ratioType === 2) {
        socket.emit('ansi-output', `\r\n${minsLeft} mins, ${filesAvail} files, Filespec(${filespecNum}): `);
      } else if (ratioType === 1) {
        socket.emit('ansi-output', `\r\n${minsLeft} mins, ${bytesAvail} bytes, ${filesAvail} files, Filespec(${filespecNum}): `);
      } else {
        socket.emit('ansi-output', `\r\n${minsLeft} mins, ${bytesAvail} bytes, Filespec(${filespecNum}): `);
      }
    }
  }

  /**
   * express.e:20134-20170 — filename input loop body
   * Called each time user submits a line in DOWNLOAD_FILENAME_INPUT state.
   */
  static async handleFilenameInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const fileList: any[] = session.tempData?.downloadFileList || [];
    const numFiles = fileList.length;
    const user = session.user!;

    // express.e:20134-20137 IF(StrLen(tempStr)=0) AND (numFiles=0) → \b\n RETURN
    if (!input.trim()) {
      if (numFiles === 0) {
        socket.emit('ansi-output', '\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.tempData = undefined;
        return;
      }
      // express.e:20139 IF(StrLen(tempStr)=0) THEN JUMP astart
      await this.showLastChance(socket, session);
      return;
    }

    const trimmed = input.trim();

    // express.e:20140-20143 Q or A alone → Aborting
    if (trimmed.length === 1 && (trimmed === 'q' || trimmed === 'Q' || trimmed === 'a' || trimmed === 'A')) {
      // express.e:20141 'Aborting...\b\n\b\n'
      // \r\n first: terminates the echoed 'A'/'Q' char (lineInput echoes Enter; we don't, so we add it)
      socket.emit('ansi-output', '\r\nAborting...\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    // express.e:20145 aePuts('\b\nChecking...\b\n') — shown BEFORE validation (line 20146)
    socket.emit('ansi-output', '\r\nChecking...\r\n');

    // express.e:20146, 20158-20165 - a sysop download takes any path, but
    // no wildcard.
    if (session.tempData?.sysopDownload) {
      if (this.hasWildcards(trimmed)) {
        socket.emit('ansi-output', '\r\nSysop download doesn\'t support wildcards\r\n');
      } else {
        // express.e:20167 checkForFileSize(...)
        await this.addSysopFile(socket, session, trimmed, fileList);
        session.tempData.downloadFileList = fileList;
        session.tempData.downloadNumFiles = fileList.length;
      }
      await this.showFilespecPrompt(socket, session);
      return;
    }

    // express.e:20146-20165 — validate filename chars (after Checking...)
    const err = this.validateFilenameStr(trimmed, checkSecurity(user, ACSPermission.FILE_EXPANSION));
    if (err) {
      socket.emit('ansi-output', `\r\n${err}\r\n`);
      await this.showFilespecPrompt(socket, session);
      return;
    }

    // express.e:20167 checkForFileSize(...)
    const found = await this.findFilesReporting(
      socket, config.get('dataDir'), session.currentConf || 1, trimmed);

    if (found === null) {
      // The volume could not answer. It is NOT a missing file, and the
      // caller has been told which drive and to try again later.
      await this.showFilespecPrompt(socket, session);
      return;
    }

    if (found.length === 0) {
      socket.emit('ansi-output', `File not found: ${trimmed}\r\n`);
      await this.showFilespecPrompt(socket, session);
      return;
    }

    // Add to list, update count. Reject files whose comment starts
    // "Restricted" per express.e checkFIBForFileSize:
    //   IF StrCmp(fBlock.comment,'Restricted',10)=0 THEN
    //     callersLog('\t\tAttempt to download RESTRICTED file [<path>]')
    //     RETURN
    // Without this gate, sysop-marked restricted files are downloadable.
    if (!session.tempData) session.tempData = { downloadFileList: [], downloadNumFiles: 0 };
    for (const file of found) {
      // findFilesInConference does not populate comments, so resolve the
      // file's DIR description here (single source of truth in
      // file-restriction.util). Without this, `file.comment` was always
      // undefined and the Restricted gate never fired.
      const commentText = file.comment || file.description ||
        await resolveFileDescription(session.currentConf || 1, config.get('dataDir'), file.name);
      if (isRestrictedComment(commentText)) {
        socket.emit('ansi-output', `\r\n\x1b[31m${file.name}: restricted file\x1b[0m\r\n`);
        try {
          const { callersLog } = require('../../server/database-helpers');
          await callersLog(session.user?.id || null, session.user?.username || 'unknown',
            `\t\tAttempt to download RESTRICTED file [${file.fullPath || file.name}]`);
          // express.e:12750-12751 - and the node's CallersLog.
          require('../../services/CallersLogManager').callersLogManager.logActivity(session.nodeId ?? 1,
            `\t\tAttempt to download RESTRICTED file [${file.fullPath || file.name}]`);
        } catch (_err) { /* non-critical */ }
        continue;
      }
      this.printFileFound(socket, session, file);  // express.e:12736
      fileList.push(file);
    }
    session.tempData.downloadFileList = fileList;
    session.tempData.downloadNumFiles = fileList.length;

    // Show next filespec prompt — stay in DOWNLOAD_FILENAME_INPUT
    await this.showFilespecPrompt(socket, session);
  }

  /**
   * express.e:12736 — checkFIBForFileSize per-file display, format:
   *   ' \r{kb}k, {min} mins {secs} secs {filename}\t' + 'Free Download!' or '\b\n'
   * One line per file accepted into the download set, both for pre-loaded
   * (flagged + params) and for files entered at the filespec loop.
   */
  private static printFileFound(socket: Socket, session: BBSSession, file: any): void {
    const user = session.user!;
    const estDlCPS  = estimatedDownloadCps(session);
    const fsize = file.size || 0;
    const tsec  = estDlCPS > 0 ? Math.floor(fsize / estDlCPS) : 0;
    const min   = Math.floor(tsec / 60);
    const secs  = tsec - min * 60;
    const kSize = (fsize >>> 10) & 0x003fffff; // express.e:12736 mask
    const line  = ` ${kSize}k, ${min} mins ${secs.toString().padStart(2, '0')} secs ${file.name}`;
    socket.emit('ansi-output', line);
    if (isFreeDownload(file)) {
      socket.emit('ansi-output', '  >>Free Download!\r\n');  // express.e:12741
    } else {
      socket.emit('ansi-output', '\r\n');                    // express.e:12745
    }
  }

  /**
   * express.e:20182-20210 — build and show the protocol estimate + LAST CHANCE prompt
   * Called when the filename loop ends (blank line with files, or direct from flagged files).
   */
  private static async showLastChance(socket: Socket, session: BBSSession): Promise<void> {
    const fileList: any[] = session.tempData?.downloadFileList || [];
    const user = session.user!;

    if (fileList.length === 0) {
      // express.e:20180 IF(numFiles=0) THEN RETURN RESULT_NO_CARRIER
      socket.emit('ansi-output', '\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    const totalSize = fileList.reduce((sum: number, f: any) => sum + (f.size || 0), 0);
    const totalKb   = Math.floor(totalSize / 1024);

    // express.e:19973-19977: estDlCPS = lastDlCPS or onlineBaud/10
    const lastDlCPS = (user as any).topDownloadCPS || 0;
    const onlineBaud = session.modemBps || session.connectionBaud || DEFAULT_CONNECTION_BAUD;
    const estDlCPS  = estimatedDownloadCps(session);

    const estSecs    = estDlCPS > 0 ? Math.floor(totalSize / estDlCPS) : 0;
    const estMins    = Math.floor(estSecs / 60);
    const estSecsRem = estSecs % 60;

    // express.e:20182-20195 — two separate aePuts calls:
    // 20183: aePuts('\b\nZmodem ')          ← protocol with trailing space (INTERNAL)
    // 20185: aePuts('\b\nFTP ')             ← protocol with trailing space (FTP)
    // 20187: StringF(tempStr,'\b\n\s',...)  ← protocol, NO trailing space (other)
    // 20191: StringF(tempStr,' Batch Download Estimate at \d cps:\b\n',...)
    //        leading space → INTERNAL/FTP = two spaces total, other = one space
    const protocol = (user as any).protocol || '/X Zmodem';
    let protoPrefix: string;  // includes leading \r\n AND trailing space per express.e
    if (protocol === '/X Zmodem' || protocol === 'Zmodem') {
      protoPrefix = '\r\nZmodem ';    // express.e:20183 '\b\nZmodem ' (trailing space)
    } else if (protocol === 'FTP') {
      protoPrefix = '\r\nFTP ';       // express.e:20185 '\b\nFTP ' (trailing space)
    } else {
      protoPrefix = `\r\n${protocol}`; // express.e:20187 '\b\n\s' (no trailing space)
    }

    // express.e:20190-20195 estimate string starts with a space (leading space)
    // combined with protoPrefix: INTERNAL/FTP → two spaces, other → one space
    if (lastDlCPS > 0) {
      socket.emit('ansi-output', `${protoPrefix} Batch Download Estimate at ${estDlCPS} cps:\r\n`);
    } else {
      socket.emit('ansi-output', `${protoPrefix} Batch Download Estimate at ${onlineBaud} bps:\r\n`);
    }

    // express.e:20202 '   \d files, \dk bytes, \d mins \d secs\b\n'
    socket.emit('ansi-output', `   ${fileList.length} files, ${totalKb}k bytes, ${estMins} mins ${estSecsRem} secs\r\n`);

    // express.e:20205-20208 - the whole set must fit the time left
    if (estMins > getTimeRemainingMinutes(session) && !checkSecurity(user, ACSPermission.OVERRIDE_TIMELIMIT)) {
      socket.emit('ansi-output', '  Insufficent time for transfer.\r\n\r\n'); // express.e's spelling
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    // express.e:20210 '\b\nLAST CHANCE!   (Enter) to Start, (G)oodbye after transfer, (A)bort? '
    socket.emit('ansi-output', '\r\nLAST CHANCE!   (Enter) to Start, (G)oodbye after transfer, (A)bort? ');

    // Same mutual exclusion as the filespec loop: no pending pause may
    // swallow the confirming keystroke.
    session.paginatedScreen = undefined;
    session.menuPause = false;
    session.subState = LoggedOnSubState.DOWNLOAD_CONFIRM_INPUT;
    session.tempData = {
      ...session.tempData,
      waitingForDownloadConfirm: true,
      downloadFileList: fileList,
      downloadBatch: fileList.length > 1,
    };
  }

  /**
   * express.e:20212-20231 — REPEAT loop on LAST CHANCE
   * Single-char read: A=abort, G=goodbye, Enter=start; everything else loops.
   */
  static async handleConfirmInput(
    socket: Socket,
    session: BBSSession,
    data: string
  ): Promise<void> {
    if (!session.tempData?.waitingForDownloadConfirm) return;

    const ch    = data[0] || '';
    const upper = ch.toUpperCase();

    // express.e:20219-20221 IF((mystat=65) OR (mystat=97)) → Abort!
    if (upper === 'A') {
      session.tempData.waitingForDownloadConfirm = false;
      socket.emit('ansi-output', 'Abort!\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }

    // express.e:20228-20231 UNTIL mystat=13 OR 71 OR 103
    // G(71)/g(103) = goodbye; Enter(13) = start
    if (upper === 'G') {
      session.tempData.waitingForDownloadConfirm = false;
      const fileList = session.tempData.downloadFileList || [];
      // express.e:20231 IF(mystat<>13) THEN aePuts('Goodbye!\b\n\b\n')
      socket.emit('ansi-output', 'Goodbye!\r\n\r\n');
      await this.initiateDownloadTransfer(socket, session, fileList, true);
      return;
    }

    if (ch === '\r' || ch === '\n') {
      session.tempData.waitingForDownloadConfirm = false;
      const fileList = session.tempData.downloadFileList || [];
      // express.e:20231 ELSE aePuts('\b\n\b\n')
      socket.emit('ansi-output', '\r\n\r\n');
      await this.initiateDownloadTransfer(socket, session, fileList, false);
      return;
    }

    // All other chars: loop (express.e REPEAT...UNTIL — do nothing, wait for valid key)
  }

  /**
   * express.e:20247-20317 — downloadFiles + post-transfer stats + displayULStats + pGoodbye
   */
  private static async initiateDownloadTransfer(
    socket: Socket,
    session: BBSSession,
    fileList: any[],
    goodbyeAfter: boolean
  ): Promise<void> {
    // Telnet/SSH transports use real ZMODEM (the same path the F+D
    // flagged-files flow uses). The web-only download-file socket
    // event below is for the browser's DOM download trigger; on
    // telnet/SSH it's a no-op and the BBS used to fake-complete the
    // transfer in 1 second without actually sending bytes. Route
    // through startZmodemDownload so MuffinTerm / SyncTerm / mTelnet
    // negotiate ZMODEM and receive the files for real.
    // How the files travel is ONE decision, in file-delivery.ts, and the
    // batch path (F+D) makes the same one. The comment this branch used to
    // carry lives there.
    if (deliveryRouteFor(session) === 'zmodem') {
      (session as any)._downloadGoodbyeAfter = goodbyeAfter;
      const route = await deliverFilesToCaller(socket, session, fileList, {
        // Persist download stats for each file before handing off - the
        // ZMODEM transfer is async and the user could disconnect; record
        // intent now so per-user totals stay accurate.
        /**
         * Booked when the transfer FINISHES, not when it is handed off.
         *
         * express counts a download inside `updateDownloadStats` behind
         * `IF sentsize` (express.e:15437): nothing sent, nothing counted.
         * This ran before sz was even spawned - "record intent now so
         * per-user totals stay accurate" - which charged a caller who
         * aborted a batch for every file in it. On a ratio board that is
         * the difference between keeping and losing download access.
         *
         * lrzsz reports only whether the whole batch went, so this is
         * per-batch. A caller who takes four of five files is still billed
         * for none, which errs in his favour rather than the board's; per
         * file would need sz's stderr parsed for each name.
         */
        onTransferFinished: async (ok: boolean) => {
          if (!ok) {
            console.log('[download] transfer did not complete - nothing booked');
            return;
          }
          await bookDownloads(session, fileList);
        },
      });
      if (route !== 'zmodem') {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.tempData = undefined;
      }
      return;
    }

    const startTime = Date.now();
    let totalBytes  = 0;

    // express.e:20247 downloadFiles(finalList, dtfsize, TRUE)
    // The browser's triggers go out through the same one decision the
    // ZMODEM branch above uses, so `download-file` is emitted in exactly
    // one place in this codebase (TP-11's success criterion).
    await deliverFilesToCaller(socket, session, fileList);

    // The browser reports no completion, so it is charged at handoff - the
    // same books the ZMODEM branch keeps on finish (download-booking.service).
    await bookDownloads(session, fileList);
    for (const fileInfo of fileList) totalBytes += fileInfo.size;

    // Route through the shared runPostDownload pipeline so web/telnet/SSH
    // post-transfer behavior (stats line, callersLog summary, top-CPS
    // persist, lastDlCPS, displayULStats, goodbye-after) stays in lock-
    // step with express.e:20247-20317.
    session.tempData = undefined;
    const { runPostDownload } = require('../../services/post-download.service');
    await runPostDownload(socket, session, {
      downloadStartTime: startTime,
      downloadedFiles: fileList.length,
      downloadedBytes: totalBytes,
      goodbyeAfter,
      success: true,
    });
    // runPostDownload handles the pGoodbye countdown for both web and
    // telnet/SSH now (was previously web-only here).
  }

  /**
   * express.e:13750-13772 pGoodbye()
   * Countdown from 10 to 1, one second per tick.
   * "Last chance!  Auto LOGOFF in N SECS.  Abort: (Enter)=yes? "
   * N/n → RESULT_GOODBYE (proceed with logoff)
   * Y/T/Enter/LF → RESULT_SUCCESS (cancel, return to menu)
   * No input after 10 ticks → RESULT_GOODBYE
   *
   * In the web event-driven model: show first tick, set DOWNLOAD_PGOODBYE
   * sub-state, schedule a 1-second interval tick. Each tick: redraw prompt
   * with updated count. On input or final tick: resolve.
   */
  static async startPGoodbye(socket: Socket, session: BBSSession): Promise<void> {
    const totalTicks = 10;
    session.tempData = {
      ...(session.tempData || {}),
      pGoodbyeTicksLeft: totalTicks,
      pGoodbyePending: true,
    };

    // Show first line (express.e: aePuts('\b\n') then [A then prompt)
    // First tick we just emit newline + prompt without cursor-up (nothing above to overwrite)
    const msg = `Last chance!  Auto LOGOFF in ${totalTicks} SECS.  Abort: (Enter)=yes? `;
    socket.emit('ansi-output', `\r\n${msg}`);

    session.subState = LoggedOnSubState.DOWNLOAD_PGOODBYE;

    // Schedule tick interval — each second, decrement and redraw
    const interval = setInterval(async () => {
      // Guard: session may have already transitioned away
      if (session.subState !== LoggedOnSubState.DOWNLOAD_PGOODBYE || !session.tempData?.pGoodbyePending) {
        clearInterval(interval);
        return;
      }

      session.tempData.pGoodbyeTicksLeft--;
      const ticks = session.tempData.pGoodbyeTicksLeft as number;

      if (ticks <= 0) {
        // express.e:13770-13772 loop ended → RESULT_GOODBYE
        clearInterval(interval);
        session.tempData.pGoodbyePending = false;
        socket.emit('ansi-output', '\r\n');
        await this.doGoodbyeLogoff(socket, session);
        return;
      }

      // express.e:13756-13759: aePuts('\b\n'), aePuts('[A'), aePuts(prompt)
      // \b\n = CR+LF, [A = ANSI cursor up 1 line — overwrites previous countdown line
      const nextMsg = `Last chance!  Auto LOGOFF in ${ticks} SECS.  Abort: (Enter)=yes? `;
      socket.emit('ansi-output', `\r\n\x1b[A${nextMsg}`);
    }, 1000);

    // Store interval ID so input handler can clear it
    session.tempData.pGoodbyeInterval = interval as unknown as number;
  }

  /**
   * express.e:13750-13772 pGoodbye() — input handler
   * Called for each character received while in DOWNLOAD_PGOODBYE state.
   */
  static async handlePGoodbyeInput(socket: Socket, session: BBSSession, data: string): Promise<void> {
    if (!session.tempData?.pGoodbyePending) return;

    const ch = data[0] || '';
    const interval = session.tempData.pGoodbyeInterval;
    if (interval != null) {
      clearInterval(interval as unknown as NodeJS.Timeout);
    }
    session.tempData.pGoodbyePending = false;
    session.tempData.pGoodbyeInterval = undefined;

    // express.e:13762-13768:
    // stat="n" OR "N" → 'No\b\n\b\n' → RESULT_GOODBYE (proceed with logoff)
    // stat="y" OR "T" OR CR(13) OR LF(10) → 'Yes\b\n\b\n' → RESULT_SUCCESS (cancel)
    if (ch === 'n' || ch === 'N') {
      socket.emit('ansi-output', 'No\r\n\r\n');
      await this.doGoodbyeLogoff(socket, session);
    } else if (ch === 'y' || ch === 'Y' || ch === 'T' || ch === '\r' || ch === '\n') {
      socket.emit('ansi-output', 'Yes\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
    // Any other key: express.e readChar(1) just returns 0 on no input or unknown key
    // so we ignore and let the interval continue — but we already cancelled it above.
    // Re-show the current tick prompt and restart the interval.
    else {
      const ticks = session.tempData?.pGoodbyeTicksLeft as number || 1;
      const nextMsg = `Last chance!  Auto LOGOFF in ${ticks} SECS.  Abort: (Enter)=yes? `;
      socket.emit('ansi-output', `\r\n\x1b[A${nextMsg}`);
      session.tempData.pGoodbyePending = true;
      const newInterval = setInterval(async () => {
        if (session.subState !== LoggedOnSubState.DOWNLOAD_PGOODBYE || !session.tempData?.pGoodbyePending) {
          clearInterval(newInterval);
          return;
        }
        session.tempData.pGoodbyeTicksLeft--;
        const t = session.tempData.pGoodbyeTicksLeft as number;
        if (t <= 0) {
          clearInterval(newInterval);
          session.tempData.pGoodbyePending = false;
          socket.emit('ansi-output', '\r\n');
          await this.doGoodbyeLogoff(socket, session);
          return;
        }
        socket.emit('ansi-output', `\r\n\x1b[A${'Last chance!  Auto LOGOFF in ' + t + ' SECS.  Abort: (Enter)=yes? '}`);
      }, 1000);
      session.tempData.pGoodbyeInterval = newInterval as unknown as number;
    }
  }

  /**
   * Perform the actual logoff after pGoodbye countdown expires or N is pressed.
   */
  private static async doGoodbyeLogoff(socket: Socket, session: BBSSession): Promise<void> {
    const { handleGoodbyeCommand } = require('../commands/system-commands.handler');
    await handleGoodbyeCommand(socket, session, 'Y');
  }

  /**
   * express.e:12680-12715 displayULStats
   * Number of Downloads      : N (Xk total)
   * Number of Uploads        : N (Xk total)
   * Todays Bytes Available   : Infinite
   */
  private static displayULStats(socket: Socket, session: BBSSession): void {
    // Delegated to shared util so the pre-transfer banner (here) and
    // the post-transfer banner (runPostDownload) emit identical text.
    // express.e:12680-12715 logic lives in display-ul-stats.util.ts.
    const { emitULStats } = require('../../utils/display-ul-stats.util');
    emitULStats(socket, session);
  }

  // ─── sysop download ─────────────────────────────────────────────────────

  /**
   * checkForFileSize (12778-13040) with sysopdl set: the name typed IS the
   * path. User.data and User.keys are never offered (12804-12820); a device
   * that is not mounted (findAssign, 12872) or a path that cannot be locked
   * (12893-12895) is "not found" (13032-13036). Otherwise
   * checkFIBForFileSize (12717-12776) prints the file's line, refuses a
   * Restricted one, and adds it once - and never to the flagged list
   * (12762), which is the caller's, not the sysop's errand.
   */
  private static async addSysopFile(
    socket: Socket,
    session: BBSSession,
    name: string,
    fileList: any[]
  ): Promise<void> {
    const part = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf(':')) + 1).toUpperCase();
    // express.e:31937/31943 the default userDataFile / userKeysFile names.
    if (part === 'USER.DATA' || part === 'USER.KEYS') {
      socket.emit('ansi-output', `   File (${part}) not found.\r\n`);
      return;
    }
    const file = this.sysopFileAt(session, name);
    if (!file) {
      socket.emit('ansi-output', `       File (${name}) not found.\r\n`);
      return;
    }
    this.printFileFound(socket, session, file);
    // express.e:12748-12754 - the file's comment, which this board keeps as
    // its DIR description (file-restriction.util).
    const comment = await resolveFileDescription(session.currentConf || 1, config.get('dataDir'), file.name);
    if (isRestrictedComment(comment)) {
      socket.emit('ansi-output', '    >>Restricted File<< Updating CallersLog\r\n');
      require('../../services/CallersLogManager').callersLogManager.logActivity(session.nodeId || 1,
        `\t\tAttempt to download RESTRICTED file [${name}]`);
      return;
    }
    if (fileList.some((f) => f.fullPath === file.fullPath)) {
      socket.emit('ansi-output', '   File is already selected!\r\n'); // express.e:12768
      return;
    }
    fileList.push(file);
  }

  /** The file an AmigaDOS path names on this host, or null when there is none. */
  private static sysopFileAt(session: BBSSession, name: string): any | null {
    if (!deviceMounted(name)) return null;
    const hostPath = amigafs.resolvePath(resolveAssignPath(name));
    if (!hostPath) return null;
    let size: number;
    try {
      const st = fs.statSync(hostPath);
      if (!st.isFile()) return null;
      size = st.size;
    } catch {
      return null;
    }
    return {
      name: path.basename(hostPath),
      size,
      fullPath: hostPath,
      confNum: session.currentConf || 1,
      dirNum: 1,
      // Not in a file area: the browser fetches it on a one-time ticket for
      // its path (file-delivery.ts), ZMODEM sends the path as it is.
      outsideFileAreas: true,
    };
  }

  // ─── filename validation ────────────────────────────────────────────────

  /**
   * express.e:20146-20165 — returns error string or null if valid
   * Checks for special symbols and too-ambiguous wildcards.
   */
  private static validateFilenameStr(filename: string, hasExpansion: boolean): string | null {
    for (let i = 0; i < filename.length; i++) {
      const c = filename[i];
      if (c === ':' || c === '/') {
        return 'You may not include any special symbols';
      }
      if ((c === '?' || c === '#' || c === '*') && !hasExpansion) {
        return 'You may not include any special symbols';
      }
    }
    // express.e:20154 IF((tempStr[0]="?") OR (tempStr[0]="*"))
    if (filename[0] === '?' || filename[0] === '*') {
      // express.e:20155 'Too ambigious, start with at least one character.\b\n'
      return 'Too ambigious, start with at least one character.';
    }
    return null;
  }

  // ─── file search ────────────────────────────────────────────────────────

  /**
   * `findFilesInConference`, plus the line the caller sees when the pool
   * cannot answer.
   *
   * Returns null - never an empty array - only when the pool failed AND
   * nothing was found locally, so the four call sites can tell that apart from
   * a real miss. They print "File not found" on an empty result, and printing
   * that for a file that is perfectly fine is the one thing this whole
   * subsystem is built to prevent.
   *
   * When the pool failed but the disk had matches, the caller gets the local
   * matches AND the storage line: the local half of a part-migrated conference
   * is not hostage to the pooled half, and the caller is still told the list
   * may be short.
   */
  private static async findFilesReporting(
    socket: Socket,
    dataDir: string,
    confNum: number,
    pattern: string
  ): Promise<any[] | null> {
    const { files, storageError } = await this.findFilesInConference(dataDir, confNum, pattern);

    if (storageError !== undefined) {
console.error(`[Download] ${pattern} in conf ${confNum}:`, storageError);
      socket.emit('ansi-output', `\r\n[X] ${pattern}: ${storageFailureText(storageError)}\r\n`);
      if (files.length === 0) return null;
    }
    return files;
  }

  /**
   * The files this conference has under a name or a filespec, from the pool
   * and from disk.
   *
   * A pooled area answers first. The disk walk still runs, because a
   * conference can be part-migrated: on an exact name a pooled HIT wins
   * outright (a leftover local copy is the older version), and on a wildcard
   * the two sets are MERGED - returning only the pooled subset would hide the
   * files still on disk from `D *.LHA`, which is the same silent drop this
   * branch exists to fix.
   *
   * The pooled half is METADATA ONLY. Nothing is fetched here; `rematerialise`
   * gets the bytes at send, once the caller has said yes.
   *
   * A pooled failure is REPORTED, not thrown: it comes back beside whatever
   * the disk held, so a purely local file in a mixed conference is still
   * downloadable while a bucket is down. It is never turned into "no such
   * file" - that distinction is the whole point of the subsystem.
   */
  private static async findFilesInConference(
    dataDir: string,
    confNum: number,
    pattern: string
  ): Promise<{ files: any[]; storageError?: unknown }> {
    const confPath       = getConferenceDir(confNum, dataDir);
    const matchingFiles: any[] = [];
    const hasWildcard    = this.hasWildcards(pattern);

    const storage = getStorageContext();
    const pooledNames = new Set<string>();
    let storageError: unknown;
    if (storage) {
      // The pooled half reports its own failures rather than throwing: one
      // area's drive being down must not discard a healthy co-conference
      // area's matches, nor the local files below.
      const remote: RemoteListingResult = hasWildcard
        ? await listRemoteMatches((name: string) => this.matchesWildcard(name, pattern), confNum, storage)
        : await locateRemoteFile(pattern, confNum, storage);
      storageError = remote.storageError;

      for (const file of remote.files) {
        pooledNames.add(file.name.toLowerCase());
        matchingFiles.push({
          name: file.name,
          size: file.size,
          confNum,
          dirNum: 1,
          // Not fetched yet: this is where the bytes WILL be. The transfer
          // calls rematerialise, which fetches them (and fetches them again
          // if the cache evicted them while the caller sat at the prompt).
          fullPath: file.localPath,
          driveNumber: file.driveNumber,
          objectKey: file.key,
        });
      }

      if (!hasWildcard && matchingFiles.length > 0) return { files: matchingFiles, storageError };
    }
    const searchDirs     = [
      path.join(confPath, 'Upload'),
      path.join(confPath, 'Files'),
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      if (hasWildcard) {
        for (const file of fs.readdirSync(dir)) {
          if (!this.matchesWildcard(file, pattern)) continue;
          if (pooledNames.has(file.toLowerCase())) continue; // the pool holds the current version
          const fp = path.join(dir, file);
          const st = fs.statSync(fp);
          if (st.isFile()) matchingFiles.push({ name: file, size: st.size, confNum, dirNum: 1, fullPath: fp });
        }
      } else {
        const fp = path.join(dir, pattern);
        const resolved = amigafs.resolvePath(fp); // case-insensitive on Linux
        if (resolved && !pooledNames.has(path.basename(resolved).toLowerCase())) {
          const st = fs.statSync(resolved);
          if (st.isFile()) matchingFiles.push({ name: path.basename(resolved), size: st.size, confNum, dirNum: 1, fullPath: resolved });
        }
      }
    }
    return { files: matchingFiles, storageError };
  }

  private static matchesWildcard(filename: string, pattern: string): boolean {
    const re = new RegExp(
      '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    return re.test(filename);
  }

  private static hasWildcards(f: string): boolean {
    return f.includes('*') || f.includes('?') || f.includes('#');
  }

  // ─── helpers ────────────────────────────────────────────────────────────

}

/**
 * express.e:13750-13772 pGoodbye(), for a procedure port that awaits its
 * answer (checkAttachedFile's G, 9776-9784). The countdown is the one
 * startPGoodbye draws: `\b\n`, cursor up, the line, readChar(1) - ten times.
 * N says No and logs off; y, T, CR or LF says Yes and the caller stays.
 */
export async function pGoodbye(socket: Socket, session: BBSSession): Promise<'goodbye' | 'success'> {
  const { emitText } = require('../../utils/output.util');
  const { readCharWithin } = require('../../utils/await-input');
  for (let i = 10; i >= 1; i--) {
    emitText(socket, '\r\n');
    emitText(socket, '\x1b[A');
    emitText(socket, `Last chance!  Auto LOGOFF in ${i} SECS.  Abort: (Enter)=yes? `);
    const stat: string | null = await readCharWithin(socket, session, 1);
    if (stat === 'n' || stat === 'N') {
      emitText(socket, 'No\r\n\r\n');
      return 'goodbye';
    }
    if (stat === 'y' || stat === 'T' || stat === '\r' || stat === '\n') {
      emitText(socket, 'Yes\r\n\r\n');
      return 'success';
    }
  }
  emitText(socket, '\r\n');
  return 'goodbye';
}
