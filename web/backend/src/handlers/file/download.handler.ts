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
import { checkSecurity, getACSConfig, ToggleFlags } from '../../utils/acs.util';
import { updateDownloadStats, creditAccountTrackDownloads } from '../../utils/download-ratios.util';
import { logDownload } from '../../utils/download-logging.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
import { ConferenceRepository } from '../../database/conference-repository';
import { db } from '../../database';
import { config } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import { FileFlagManager } from '../../utils/file-flag.util';
import { getConferenceDir } from '../../utils/file-hold.util';
import { userFileManager } from '../../services/UserFileManager';
import { doorDropFileManager } from '../../services/DoorDropFileManager';
import { emitDownload } from '../../services/bbs-event-emitter';

export class DownloadHandler {
  /**
   * D command entry point — express.e:24853-24858 internalCommandD
   */
  static async handleDownloadCommand(
    socket: Socket,
    session: BBSSession,
    params: string = ''
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
    await this.beginDLF(socket, session, params);
  }

  /**
   * express.e:19791 beginDLF → downloadAFile
   * Begins download flow: shows header, handles flagged/param files or
   * drops into filename-input loop.
   */
  private static async beginDLF(
    socket: Socket,
    session: BBSSession,
    params: string
  ): Promise<void> {
    // express.e:19960 aePuts('\b\n')
    socket.emit('ansi-output', '\r\n');

    // express.e:19961-19964 IF(maxDirs=0) myError(5) RETURN RESULT_FAILURE
    // Check whether any file directories exist for this conference
    try {
      const { fileAreaManager } = require('../../services/FileAreaManager');
      const areas = fileAreaManager?.getAreasForConference?.(session.currentConf || 1);
      if (Array.isArray(areas) && areas.length === 0) {
        // express.e:8528-8530 myError(ERR_NOFILES=5): 'No files available in this conference.\b\n\b\n'
        socket.emit('ansi-output', 'No files available in this conference.\r\n\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }
    } catch { /* fileAreaManager may not expose this API — continue */ }

    // express.e:19966-19971 IF(quietDownload=FALSE) IF(displayScreen(SCREEN_DOWNLOAD)) doPause() \b\n
    try {
      const { displayScreen, doPause } = require('../screen.handler');
      if (typeof displayScreen === 'function') {
        const shown = await displayScreen(socket, session, 'DOWNLOAD');
        if (shown) {
          if (typeof doPause === 'function') doPause(socket, session);
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

    // Collect pre-flagged/params files into fileList — express.e:20037-20097
    // express.e: addFlagItems(tempList,currentConf,params) + flagFilesList items
    // If any are present, tempList.count()<>0 → show '\b\nChecking...\b\n' (line 20066)
    const fileList: any[] = [];

    const hasFlags = (session.flagManager instanceof FileFlagManager && session.flagManager.getCount() > 0)
                  || (Array.isArray(session.tempData?.flaggedFiles) && session.tempData.flaggedFiles.length > 0);
    const hasParams = !!params.trim();

    if (hasFlags || hasParams) {
      // express.e:20066 '\b\nChecking...\b\n'
      socket.emit('ansi-output', '\r\nChecking...\r\n');

      if (hasFlags) {
        const dataDir = config.get('dataDir');
        if (session.flagManager instanceof FileFlagManager) {
          for (const f of session.flagManager.getAll()) {
            const found = await this.findFilesInConference(dataDir, f.confNum, f.filename);
            fileList.push(...found);
          }
        }
        if (Array.isArray(session.tempData?.flaggedFiles)) {
          for (const f of session.tempData.flaggedFiles) {
            if (f?.fileName) {
              const found = await this.findFilesInConference(
                dataDir, f.confNum || session.currentConf || 1, f.fileName);
              fileList.push(...found);
            }
          }
        }
      }

      if (hasParams) {
        const hasExpansion = checkSecurity(user, ACSPermission.FILE_EXPANSION);
        for (const name of params.trim().split(/\s+/).filter(n => n.length > 0)) {
          const err = this.validateFilenameStr(name, hasExpansion);
          if (err) { socket.emit('ansi-output', `\r\n${err}\r\n`); continue; }
          const found = await this.findFilesInConference(config.get('dataDir'), session.currentConf || 1, name);
          if (found.length === 0) {
            socket.emit('ansi-output', `\r\nFile not found: ${name}\r\n`);
            continue;
          }
          fileList.push(...found);
        }
      }
    }

    // Initialize download session state — always drop into the LOOP (express.e:20107+)
    // The LOOP runs regardless of pre-loaded files; user can add more or press blank.
    session.tempData = {
      downloadFileList: fileList,
      downloadNumFiles: fileList.length,
    };

    // express.e:20107 LOOP — show filespec prompt, wait for filename input
    this.showFilespecPrompt(socket, session);
    session.subState = LoggedOnSubState.DOWNLOAD_FILENAME_INPUT;
  }

  /**
   * express.e:19784-19789 downloadPrompt
   * Formats the filespec prompt line.
   * ratioType = loggedOnUser.secBoard (0=bytes, 1=bytes+files, 2=files)
   */
  private static showFilespecPrompt(socket: Socket, session: BBSSession): void {
    const user = session.user!;
    const numFiles = session.tempData?.downloadNumFiles || 0;
    const filespecNum = numFiles + 1;
    const minsLeft = (session as any).timeRemaining || 60;

    if (!user.secLibrary) {
      // express.e:20118 '\b\n\d mins, (Ratio Disabled), Filespec(\d): '
      socket.emit('ansi-output', `\r\n${minsLeft} mins, (Ratio Disabled), Filespec(${filespecNum}): `);
    } else {
      // express.e:19786 ratioType=0: '\b\n\d mins, \d bytes, Filespec(\d): '
      // bytesADL=$7fffffff (Infinite) for web — express.e would show Infinite here too
      // since we have no modem speed and no daily byte cap
      socket.emit('ansi-output', `\r\n${minsLeft} mins, Infinite bytes, Filespec(${filespecNum}): `);
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

    // express.e:20146-20165 — validate filename chars (after Checking...)
    const err = this.validateFilenameStr(trimmed, checkSecurity(user, ACSPermission.FILE_EXPANSION));
    if (err) {
      socket.emit('ansi-output', `\r\n${err}\r\n`);
      this.showFilespecPrompt(socket, session);
      return;
    }

    // express.e:20167 checkForFileSize(...)
    const found = await this.findFilesInConference(
      config.get('dataDir'), session.currentConf || 1, trimmed);

    if (found.length === 0) {
      socket.emit('ansi-output', `File not found: ${trimmed}\r\n`);
      this.showFilespecPrompt(socket, session);
      return;
    }

    // Add to list, update count
    fileList.push(...found);
    if (!session.tempData) session.tempData = { downloadFileList: [], downloadNumFiles: 0 };
    session.tempData.downloadFileList = fileList;
    session.tempData.downloadNumFiles = fileList.length;

    // Show next filespec prompt — stay in DOWNLOAD_FILENAME_INPUT
    this.showFilespecPrompt(socket, session);
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
    const onlineBaud = (session as any).onlineBaud || 38400;
    const estDlCPS  = lastDlCPS > 0 ? lastDlCPS : Math.floor(onlineBaud / 10);

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

    // express.e:20205-20208 time check (simplified — no timelimit enforcement for web)

    // express.e:20210 '\b\nLAST CHANCE!   (Enter) to Start, (G)oodbye after transfer, (A)bort? '
    socket.emit('ansi-output', '\r\nLAST CHANCE!   (Enter) to Start, (G)oodbye after transfer, (A)bort? ');

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
    const startTime = Date.now();
    let totalBytes  = 0;

    // express.e:20247 downloadFiles(finalList, dtfsize, TRUE)
    // In web mode: send download-file socket events for each file
    for (let i = 0; i < fileList.length; i++) {
      const fileInfo = fileList[i];
      const downloadUrl = `/api/download/${fileInfo.confNum}/${fileInfo.dirNum}/${encodeURIComponent(fileInfo.name)}`;

      socket.emit('download-file', {
        filename:   fileInfo.name,
        size:       fileInfo.size,
        url:        downloadUrl,
        path:       fileInfo.fullPath,
        batchIndex: i,
        batchTotal: fileList.length,
      });

      if (session.user) {
        const isFree = this.isFreeDownload(fileInfo);
        await logDownload(session.user, fileInfo.name, fileInfo.size, isFree, session.nodeId || 0);

        try {
          const conference = await db.getConferenceById(session.currentConf);
          emitDownload({
            username:       session.user.username,
            nodeId:         session.nodeId || 1,
            fileName:       fileInfo.name,
            fileSize:       fileInfo.size,
            conferenceId:   session.currentConf,
            conferenceName: conference?.name,
            timestamp:      Date.now(),
          });
        } catch { /* non-critical */ }

        await updateDownloadStats(session.user, fileInfo.size, isFree);
        await this.persistDownloadStats(session);
        await this.updateConferenceDownloadStats(session, fileInfo, isFree);
        doorDropFileManager.updateDownloadBytesToday(session.nodeId || 0, fileInfo.size);
      }
      totalBytes += fileInfo.size;
    }

    // express.e:20251 aePuts('\b\n\b\nFile transfer Completed.\b\n')
    socket.emit('ansi-output', '\r\n\r\nFile transfer Completed.\r\n');

    // express.e:20266
    // ' \d files, \sk bytes, \d minutes \d seconds \d cps, \d% efficiency at \d'
    const elapsed  = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    const mins     = Math.floor(elapsed / 60);
    const secs     = elapsed % 60;
    const totalKb  = Math.floor(totalBytes / 1024);
    const cps      = totalBytes > 0 ? Math.round(totalBytes / elapsed) : 0;
    const onlineBaud = (session as any).onlineBaud || 38400;
    socket.emit('ansi-output',
      ` ${fileList.length} files, ${totalKb}k bytes, ${mins} minutes ${secs} seconds ${cps} cps, 100% efficiency at ${onlineBaud}\r\n`);
    // express.e:20268 aePuts('\b\n\b\n')
    socket.emit('ansi-output', '\r\n');

    // express.e:20311 displayULStats(loggedOnUser,loggedOnUserMisc)
    this.displayULStats(socket, session);

    // express.e:20312 aePuts('\b\n')
    socket.emit('ansi-output', '\r\n');

    session.tempData = undefined;

    // express.e:20317 IF((mystat=71) OR (mystat=103)) THEN RETURN(pGoodbye())
    if (goodbyeAfter) {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      const { handleGoodbyeCommand } = require('../commands/system-commands.handler');
      handleGoodbyeCommand(socket, session, 'Y');
    } else {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    }
  }

  /**
   * express.e:12680-12715 displayULStats
   * Number of Downloads      : N (Xk total)
   * Number of Uploads        : N (Xk total)
   * Todays Bytes Available   : Infinite
   */
  private static displayULStats(socket: Socket, session: BBSSession): void {
    const user   = session.user!;
    const dlKb   = Math.floor((user.bytesDownload || 0) / 1024);
    const ulKb   = Math.floor((user.bytesUpload   || 0) / 1024);
    // express.e:12691 u.downloads AND $FFFF (lower 16 bits)
    const dlCount = ((user.downloads || 0)) & 0xFFFF;
    const ulCount = ((user.uploads   || 0)) & 0xFFFF;
    // express.e:12691 'Number of Downloads      : \d (\sk total)\b\n'
    socket.emit('ansi-output', `Number of Downloads      : ${dlCount} (${dlKb}k total)\r\n`);
    // express.e:12699 'Number of Uploads        : \d (\sk total)\b\n'
    socket.emit('ansi-output', `Number of Uploads        : ${ulCount} (${ulKb}k total)\r\n`);
    // express.e:12709 'Todays Bytes Available   : Infinite\b\n'  (bytesADL=$7fffffff)
    const toggles = getACSConfig().toggles;
    if (toggles && (toggles as any)[ToggleFlags.CREDITBYKB]) {
      // express.e:12703 'Todays KBytes Available  : Infinite\b\n'
      socket.emit('ansi-output', 'Todays KBytes Available  : Infinite\r\n');
    } else {
      socket.emit('ansi-output', 'Todays Bytes Available   : Infinite\r\n');
    }
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

  private static async findFilesInConference(
    dataDir: string,
    confNum: number,
    pattern: string
  ): Promise<any[]> {
    const confPath       = getConferenceDir(confNum, dataDir);
    const matchingFiles: any[] = [];
    const hasWildcard    = this.hasWildcards(pattern);
    const searchDirs     = [
      path.join(confPath, 'Upload'),
      path.join(confPath, 'Files'),
    ];

    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;
      if (hasWildcard) {
        for (const file of fs.readdirSync(dir)) {
          if (!this.matchesWildcard(file, pattern)) continue;
          const fp = path.join(dir, file);
          const st = fs.statSync(fp);
          if (st.isFile()) matchingFiles.push({ name: file, size: st.size, confNum, dirNum: 1, fullPath: fp });
        }
      } else {
        const fp = path.join(dir, pattern);
        if (fs.existsSync(fp)) {
          const st = fs.statSync(fp);
          if (st.isFile()) matchingFiles.push({ name: pattern, size: st.size, confNum, dirNum: 1, fullPath: fp });
        }
      }
    }
    return matchingFiles;
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

  private static isFreeDownload(fileInfo: any): boolean {
    if (fileInfo.comment?.toUpperCase().startsWith('F')) return true;
    if (fileInfo.confNum) {
      const flags = getConferenceToolFlags(fileInfo.confNum);
      if (flags.freeDownloads) return true;
    }
    return false;
  }

  private static async persistDownloadStats(session: BBSSession): Promise<void> {
    const user = session.user;
    if (!user) return;
    try {
      if (db?.updateUser) {
        await db.updateUser(user.id, {
          downloads:                user.downloads,
          bytesDownload:            user.bytesDownload,
          dailyBytesDld:            user.dailyBytesDld,
          bytesAvailableForDownload: user.bytesAvailableForDownload,
          lastDownloadTime:         user.lastDownloadTime,
          topDownloadCPS:           user.topDownloadCPS,
        });
        if (user.slotNumber) {
          try { userFileManager.updateUserDataFile(user, user.slotNumber); } catch { /* disk err */ }
        }
      }
    } catch (err) { console.error('[DOWNLOAD] Failed to persist download stats', err); }
  }

  private static async updateConferenceDownloadStats(
    session: BBSSession, fileInfo: any, isFree: boolean = false
  ): Promise<void> {
    const user = session.user;
    if (!user) return;
    if (!checkSecurity(user, ACSPermission.CONFERENCE_ACCOUNTING)) return;
    if (isFree) return;
    if (!creditAccountTrackDownloads(user)) return;
    try {
      const conferences = await this.loadConferences(session);
      const target = conferences?.find((c: any) => c.id === fileInfo.confNum);
      if (!target) return;
      target.downloads    = (target.downloads    || 0) + 1;
      target.bytesDownload = (target.bytesDownload || 0) + (fileInfo.size || 0);
      const rawDb = (db as any).db ?? db;
      const repo  = new ConferenceRepository(rawDb);
      await repo.updateConference(target.id, { downloads: target.downloads, bytesDownload: target.bytesDownload });
    } catch (err) { console.error('[DOWNLOAD] Failed to persist conference download stats', err); }
  }

  private static async loadConferences(session: BBSSession) {
    if (session.conferences && Array.isArray(session.conferences)) return session.conferences;
    try {
      const repo  = new ConferenceRepository(db);
      const confs = await repo.getConferences();
      session.conferences = confs;
      return confs;
    } catch { return undefined; }
  }
}
