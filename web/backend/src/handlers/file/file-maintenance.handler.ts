/**
 * File Maintenance Handler - FM Command
 *
 * 1:1 port from express.e:24889-25045 (156 lines)
 * Interactive file maintenance with search, delete, move, view operations
 *
 * PROC internalCommandFM(params) HANDLE
 *   - Prompts user to work with flagged files or enter search pattern
 *   - Asks for directory span (which directories to search)
 *   - For each matching file, prompts for action:
 *     D = Delete
 *     M = Move to different directory
 *     V = View file contents
 *     Q = Quit
 *   - Option to remove from flagged list after action
 * ENDPROC
 */

import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { flagManagerOf } from '../../utils/file-flag.util';
import { parseDirSpan, getDirSpanPrompt, DirSpan } from '../../utils/dir-span.util';
import { parseDirFile, DirFileEntry, getHoldDirFilePath } from '../../utils/dir-file-reader.util';
import { deleteEntry, moveEntry, readDirLines, dateCompareValue, dateOfDirLine } from '../../services/file-list.service';
import * as path from 'path';
import * as fs from 'fs';
import { getConferenceDir } from '../../utils/file-hold.util';
import { conferenceNumbers } from '../../conferences/conference-paths';

import type { BBSSession } from '../../index';

interface FileEntry {
  id: number;
  filename: string;
  filepath: string;
  size: number;
  areaId: number;
  areaName: string;
  uploader: string;
  uploadDate: Date;
  description: string;
  checked: string;
}

const HOLD_ACCESS_LEVEL = 201; // express.e default holdAccessLevel
const MAX_DESC_LINES = 15;     // express.e max_desclines default

// Dependencies injected from index.ts
let _db: any;
let _config: any;
let _callersLog: any;

export function setFileMaintenanceDependencies(deps: {
  db: any;
  config: any;
  callersLog?: any;
  fileAreas?: any[];
}) {
  _db = deps.db;
  _config = deps.config;
  _callersLog = deps.callersLog;
}

/**
 * Main FM command handler
 * express.e:24889-25045
 */
export class FileMaintenanceHandler {

  /**
   * Handle FM command - Interactive file maintenance
   * express.e:24889-24899
   */
  static async handleFileMaintenanceCommand(
    socket: any,
    session: BBSSession,
    params: string
  ): Promise<void> {

    // express.e:24901 - Check ACS_EDIT_FILES permission
    if (!checkSecurity(session.user, ACSPermission.EDIT_FILES)) {
      ErrorHandler.permissionDenied(socket, 'edit files', {
        nextState: LoggedOnSubState.DISPLAY_CONF_BULL
      });
      return;
    }

    // express.e:24903 - setEnvStat(ENV_FILES)
console.log('[FM] Starting file maintenance');

    // express.e:24905 - parseParams(params)
    const parsedParams = this.parseParams(params);

    // express.e:24907-24909 - Initialize
    session.tempData = session.tempData || {};
    session.tempData.lineCount = 0;
    session.tempData.nonStopDisplayFlag = false;

    socket.emit('ansi-output', '\r\n');

    // express.e:24910-24914 - Check if directories exist
    const { getMaxDirs } = require('../../utils/max-dirs.util');
    const bbsDataPath = _config.get('dataDir');
    const maxDirs = await getMaxDirs(session.currentConf || 1, bbsDataPath);

    if (maxDirs === 0) {
      // express.e:24911-24913: '\b\n' + myError(5) = 'No files available in this conference.\b\n\b\n'
      socket.emit('ansi-output', '\r\nNo files available in this conference.\r\n\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e:24916-24925 - If params provided, use them as file list
    let flagFileList: string[] = [];

    if (parsedParams.length > 0) {
      flagFileList = parsedParams;
      // Skip to fmSkip1
      await this.searchAndMaintainFiles(socket, session, flagFileList, maxDirs);
      return;
    }

    // express.e:24927-24944 - Check if user has flagged files
    const flagManager = await flagManagerOf(session, _config.get('dataDir'));
    const userFlags = flagManager.getAll();

    if (userFlags.length > 0) {
      socket.emit('ansi-output', 'You have flagged files, do you wish to work with these files ');
      socket.emit('ansi-output', AnsiUtil.colorize('(Y/n)', 'green') + '? ');

      // Store context for yes/no input
      session.tempData.fmContext = {
        step: 'ask_use_flagged',
        maxDirs
      };
      session.subState = LoggedOnSubState.FM_YESNO_INPUT;
      return;
    }

    // express.e:24946-24956 - Prompt for filename pattern
    await this.promptForFilenamePattern(socket, session, maxDirs);
  }

  /**
   * Prompt user for filename pattern
   * express.e:24946-24956
   */
  private static async promptForFilenamePattern(
    socket: any,
    session: BBSSession,
    maxDirs: number
  ): Promise<void> {
    socket.emit('ansi-output', 'Enter filename(s) to search for (wildcards are permitted): ');

    session.tempData.fmContext = {
      step: 'get_filename_pattern',
      maxDirs
    };
    session.subState = LoggedOnSubState.FM_FILENAME_INPUT;
  }

  /**
   * Handle filename pattern input
   * express.e:24948-24956
   */
  static async handleFilenameInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const trimmed = input.trim();

    socket.emit('ansi-output', '\r\n');

    // express.e:24953-24955 - Empty input, return to menu
    if (trimmed.length === 0) {
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e:24957 - Parse filename list (comma separated)
    const flagFileList = this.parseList(trimmed);
    const maxDirs = session.tempData.fmContext.maxDirs;

    await this.searchAndMaintainFiles(socket, session, flagFileList, maxDirs);
  }

  /**
   * Handle yes/no input for using flagged files
   * express.e:24932-24944
   */
  static async handleYesNoInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const response = input.trim().toUpperCase();
    const maxDirs = session.tempData.fmContext.maxDirs;

    socket.emit('ansi-output', '\r\n');

    // express.e:24937-24943 - If yes, use flagged files
    if (response === 'Y' || response === 'YES' || response === '') {
      const flagManager = await flagManagerOf(session, _config.get('dataDir'));
      const userFlags = flagManager.getAll();
      const flagFileList = userFlags.map(f => f.filename);

      session.tempData.fmUseFlagged = true;
      await this.searchAndMaintainFiles(socket, session, flagFileList, maxDirs);
      return;
    }

    // express.e:24944 - If no, prompt for filename pattern
    await this.promptForFilenamePattern(socket, session, maxDirs);
  }

  /**
   * Search directories and maintain files
   * express.e:24958-25042
   */
  private static async searchAndMaintainFiles(
    socket: any,
    session: BBSSession,
    flagFileList: string[],
    maxDirs: number
  ): Promise<void> {

    // express.e:24960 - getDirSpan() - Get directory range to search
    const hasHoldAccess = this.canAccessHold(session);
    const dirPrompt = getDirSpanPrompt(maxDirs, hasHoldAccess);

    socket.emit('ansi-output', dirPrompt);

    session.tempData.fmContext = {
      step: 'get_dir_span',
      flagFileList,
      maxDirs,
      hasHoldAccess
    };
    session.subState = LoggedOnSubState.FM_DIRSPAN_INPUT;
  }

  /**
   * Handle directory span input
   * express.e:24960-24963
   */
  static async handleDirSpanInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const { flagFileList, maxDirs, hasHoldAccess } = session.tempData.fmContext;
    const trimmed = input.trim();

    socket.emit('ansi-output', '\r\n');

    if (trimmed.length === 0) {
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = {};
      return;
    }

    const dirSpan: DirSpan = parseDirSpan(trimmed, maxDirs, hasHoldAccess);

    if (!dirSpan.success) {
      if (dirSpan.error) {
        socket.emit('ansi-output', AnsiUtil.errorLine(dirSpan.error));
      }
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = {};
      return;
    }

    const dirList = this.buildDirList(dirSpan);

    session.tempData.fmContext = {
      flagFileList,
      maxDirs,
      hasHoldAccess,
      dirSpan,
      dirList,
      dirIndex: 0,
      resumePos: 0,
      useFlagged: session.tempData.fmUseFlagged || false
    };

    await this.scanDirectories(socket, session);
  }

  /**
   * Scan directories for matching files
   * express.e:24968-25035
   */
  private static async scanDirectories(
    socket: any,
    session: BBSSession,
    startDirIndex: number = 0,
    resumePos: number = 0
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    const dirs: number[] = ctx.dirList || [];
    const flagFileList: string[] = ctx.flagFileList || [];
    const bbsDataPath = _config.get('dataDir');
    const confNum = session.currentConf || 1;

    if (dirs.length === 0) {
      socket.emit('ansi-output', '\r\nFile maintenance complete.\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = {};
      return;
    }

    for (let dirIdx = startDirIndex; dirIdx < dirs.length; dirIdx++) {
      const dirNum = dirs[dirIdx];
      const conferencePath = getConferenceDir(confNum, bbsDataPath);
      const dirMeta = this.getDirMeta(conferencePath, dirNum, ctx.maxDirs);
      const dirFilePath = dirMeta.path;

      // express.e:24972-24991 - Display scanning message
      // express.e:26191 'Scanning directory \d\b\n' — plain text, no color
      socket.emit('ansi-output', `Scanning directory ${dirMeta.label}\r\n`);
      session.tempData.lineCount = (session.tempData.lineCount || 0) + 1;

      if (!fs.existsSync(dirFilePath)) {
        resumePos = 0;
        continue;
      }

      const dirContent = fs.readFileSync(dirFilePath, 'latin1');
      const dirLines = dirContent.split(/\r?\n/);
      const entries = parseDirFile(dirContent);

      let matchPos = dirIdx === startDirIndex ? resumePos : 0;

      while (matchPos < entries.length) {
        const entry = entries[matchPos];
        if (!entry || !entry.filename) {
          matchPos++;
          continue;
        }

        const matches = flagFileList.some(pattern =>
          this.wildcardMatch(entry.filename.toUpperCase(), pattern.toUpperCase())
        );

        if (!matches) {
          matchPos++;
          continue;
        }

        await this.displayMatch(socket, session, entry, dirMeta.isHold, matchPos, dirMeta.label, dirLines);

        session.tempData.fmContext = {
          ...ctx,
          dirList: dirs,
          dirIndex: dirIdx,
          resumePos: matchPos + 1,
          step: 'get_action',
          dirNum,
          dirFilePath,
          dirLines,
          currentFile: entry,
          flagFileList,
          useFlagged: ctx.useFlagged || false,
          hasHoldAccess: ctx.hasHoldAccess || false,
          maxDirs: ctx.maxDirs,
          dirSpan: ctx.dirSpan,
          isHold: dirMeta.isHold,
          viewAllowed: this.canViewFile(session, dirMeta.isHold)
        };

        session.subState = LoggedOnSubState.FM_ACTION_INPUT;
        return; // Await user action
      }

      resumePos = 0;
    }

    socket.emit('ansi-output', '\r\nFile maintenance complete.\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = {};
  }

  private static getDirMeta(conferencePath: string, dirNum: number, maxDirs?: number) {
    const isHold = dirNum === -1;
    const label = isHold ? 'HOLD' : dirNum === maxDirs ? `${dirNum} (Upload)` : `${dirNum}`;
    // express.e:24965-24984: Hold is hold/held; every other span, including
    // getDirSpan's `L` (dirScan 0), is DIR<n> - so L scans DIR0. There is no
    // LCFILES listing in FM; the port read an LCFILES/LCFILES nothing writes.
    const dirPath = isHold
      ? getHoldDirFilePath(conferencePath)
      : path.join(conferencePath, `DIR${dirNum}`);

    return { path: dirPath, label, isHold };
  }

  private static buildDirList(span: DirSpan): number[] {
    if (span.startDir === -1 && span.endDir === -1) {
      return [-1];
    }

    const list: number[] = [];
    for (let i = span.startDir; i <= span.endDir; i++) {
      list.push(i);
    }
    return list;
  }

  private static canAccessHold(session: BBSSession): boolean {
    const level = session.user?.secLevel || 0;
    return level >= HOLD_ACCESS_LEVEL || checkSecurity(session.user, ACSPermission.HOLD_ACCESS);
  }

  private static async displayMatch(
    socket: any,
    session: BBSSession,
    entry: DirFileEntry,
    isHold: boolean,
    matchPos: number,
    dirLabel: string,
    dirLines: string[]
  ) {
    socket.emit('ansi-output', '\r\n');

    const isContinuationLine = (line: string) =>
      line.length >= 33 && line.substring(0, 33).trim().length === 0;

    const descLines = entry.rawLines
      .slice(0, 1 + MAX_DESC_LINES)
      .filter((line, index) => index === 0 || !isContinuationLine(line));
    descLines.forEach(line => socket.emit('ansi-output', `${line}\r\n`));
    socket.emit('ansi-output', '\r\n');

    const viewAllowed = this.canViewFile(session, isHold);
    const prompt = viewAllowed
      ? '\x1b[32m(\x1b[33mC\x1b[32m)\x1b[36montinue, \x1b[32m(\x1b[33mD\x1b[32m)\x1b[36melete, \x1b[32m(\x1b[33mM\x1b[32m)\x1b[36move, \x1b[32m(\x1b[33mV\x1b[32m)\x1b[36miew, \x1b[32m(\x1b[33mQ\x1b[32m)\x1b[36muit\x1b[0m? '
      : '\x1b[32m(\x1b[33mC\x1b[32m)\x1b[36montinue, \x1b[32m(\x1b[33mD\x1b[32m)\x1b[36melete, \x1b[32m(\x1b[33mM\x1b[32m)\x1b[36move, \x1b[32m(\x1b[33mQ\x1b[32m)\x1b[36muit\x1b[0m? ';
    socket.emit('ansi-output', prompt);

    session.tempData.fmContext = {
      ...(session.tempData.fmContext || {}),
      dirLabel,
      matchPos,
      viewAllowed,
      dirLines
    };
  }

  private static canViewFile(session: BBSSession, isHold: boolean): boolean {
    if (isHold) {
      return false;
    }
    return checkSecurity(session.user, ACSPermission.VIEW_A_FILE);
  }

  private static async afterAction(
    socket: any,
    session: BBSSession,
    nextPos: number
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    if (ctx.useFlagged) {
      socket.emit('ansi-output', 'Remove from flagged list ');
      socket.emit('ansi-output', AnsiUtil.colorize('(Y/n)', 'green') + '? ');
      session.tempData.fmContext = { ...ctx, step: 'ask_remove_flag', nextPos };
      session.subState = LoggedOnSubState.FM_REMOVE_FLAG_INPUT;
      return;
    }

    await this.continueSearch(socket, session, nextPos);
  }

  private static async redisplayPrompt(
    socket: any,
    session: BBSSession
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    const prompt = ctx.viewAllowed
      ? '\x1b[32m(\x1b[33mC\x1b[32m)\x1b[36montinue, \x1b[32m(\x1b[33mD\x1b[32m)\x1b[36melete, \x1b[32m(\x1b[33mM\x1b[32m)\x1b[36move, \x1b[32m(\x1b[33mV\x1b[32m)\x1b[36miew, \x1b[32m(\x1b[33mQ\x1b[32m)\x1b[36muit\x1b[0m? '
      : '\x1b[32m(\x1b[33mC\x1b[32m)\x1b[36montinue, \x1b[32m(\x1b[33mD\x1b[32m)\x1b[36melete, \x1b[32m(\x1b[33mM\x1b[32m)\x1b[36move, \x1b[32m(\x1b[33mQ\x1b[32m)\x1b[36muit\x1b[0m? ';
    socket.emit('ansi-output', prompt);
  }

  private static async promptDeleteConfirmation(
    socket: any,
    session: BBSSession
  ): Promise<void> {
    socket.emit('ansi-output', AnsiUtil.colorize('Are you sure you want to delete this file', 'red'));
    socket.emit('ansi-output', ' (Y/n)? ');
    session.subState = LoggedOnSubState.FM_CONFIRM_DELETE;
  }

  static async handleConfirmDeleteInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    const nextPos = ctx.nextPos ?? (ctx.matchPos ?? 0) + 1;
    const answer = input.trim().toUpperCase();
    socket.emit('ansi-output', '\r\n');

    if (answer === 'Y' || answer === 'YES' || answer === '') {
      await this.performDelete(socket, session, ctx);
      await this.afterAction(socket, session, nextPos);
      return;
    }

    await this.continueSearch(socket, session, nextPos);
  }

  /**
   * A move asks for a CONFERENCE first, then a directory in it.
   *
   * express.e:27105 calls `getMoveConf(FALSE)` (express.e:27019) before it
   * asks about directories at all, so a sysop can move a file out of the
   * conference it was uploaded to. This port asked only "Enter destination
   * directory number:" and then moved the file within
   * `session.currentConf` - a cross-conference move, which is most of what FM
   * Move is FOR, could not be expressed.
   */
  private static async promptMoveDestination(
    socket: any,
    session: BBSSession
  ): Promise<void> {
    socket.emit('ansi-output', '\r\nConference Number to move to (L to List): ');
    session.subState = LoggedOnSubState.FM_MOVE_CONF_INPUT;
  }

  /**
   * express.e:27019-27049, getMoveConf().
   *
   *   - empty input abandons the move
   *   - `L` lists the conferences and asks again
   *   - a number is clamped to the board's range, and refused with
   *     "You do not have access to the requested conference" when the caller
   *     cannot join it
   */
  static async handleMoveConfInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    const answer = input.trim();
    const nextPos = ctx.nextPos ?? (ctx.matchPos ?? 0) + 1;

    socket.emit('ansi-output', '\r\n');

    if (answer.length === 0) {
      await this.afterAction(socket, session, nextPos);
      return;
    }

    if (answer.toUpperCase() === 'L') {
      await this.listConferencesForMove(socket, session);
      socket.emit('ansi-output', '\r\nConference Number to move to (L to List): ');
      session.subState = LoggedOnSubState.FM_MOVE_CONF_INPUT;
      return;
    }

    const bbsDataPath = _config.get('dataDir');
    const available = conferenceNumbers(bbsDataPath);
    const highest = available.length > 0 ? Math.max(...available) : 1;

    // express clamps rather than rejecting: `IF destConf<1 THEN destConf:=1`,
    // `IF destConf>cmds.numConf THEN destConf:=cmds.numConf`.
    let destConf = Number.parseInt(answer, 10);
    if (Number.isNaN(destConf)) destConf = 1;
    if (destConf < 1) destConf = 1;
    if (destConf > highest) destConf = highest;

    const { checkConfAccess } = require('../message/message-scan.handler');
    if (!checkConfAccess(session.user, destConf)) {
      socket.emit(
        'ansi-output',
        AnsiUtil.errorLine('You do not have access to the requested conference')
      );
      await this.afterAction(socket, session, nextPos);
      return;
    }

    ctx.destConf = destConf;
    // The DIRECTORY range is the DESTINATION conference's NDIRS, not the
    // source's - express reads `readToolTypeInt(TOOLTYPE_CONF, destConf,
    // 'NDIRS')` at express.e:27112.
    const { getMaxDirs } = require('../../utils/max-dirs.util');
    const destMaxDirs = await getMaxDirs(destConf, bbsDataPath);
    ctx.destMaxDirs = destMaxDirs;
    session.tempData.fmContext = ctx;

    socket.emit(
      'ansi-output',
      `\r\nDirectory to move to: (1-${destMaxDirs}), (A)uto, (Enter)=abort? `
    );
    session.subState = LoggedOnSubState.FM_MOVE_DEST_INPUT;
  }

  /**
   * The conference list express shows for `L` (express.e:27030-27034, which
   * renders it with the `~CL|` MCI).
   *
   * Names come from `ConfConfig.info` on disk, not from the mirror: that table
   * is empty on the live board, and the row format matches the one the MESSAGE
   * mover already prints for the same express procedure
   * (`read-msg.ts`, getMoveConf).
   *
   * Only conferences the caller can actually join are listed - offering one he
   * will then be refused is worse than not offering it.
   */
  private static async listConferencesForMove(
    socket: any,
    session: BBSSession
  ): Promise<void> {
    socket.emit(
      'ansi-output',
      '\r\n\x1b[32m                                 Conference List\x1b[0m\r\n\r\n'
    );
    try {
      const bbsDataPath = _config.get('dataDir');
      const { loadConfConfig } = require('../../services/conf-config.service');
      const { checkConfAccess } = require('../message/message-scan.handler');
      const onDisk = loadConfConfig(bbsDataPath);
      const entries = onDisk?.entries ?? [];
      entries.forEach((entry: { name: string }, index: number) => {
        const conferenceId = index + 1;
        if (!checkConfAccess(session.user, conferenceId)) return;
        socket.emit(
          'ansi-output',
          `  ${String(conferenceId).padStart(3)} - ${entry.name}\r\n`
        );
      });
    } catch (err) {
      console.error('[FM] could not list conferences:', err);
    }
  }

  static async handleMoveDestInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    // The DESTINATION conference's NDIRS bounds this, not the source's
    // (express.e:27112). destConf is set by the step before this one.
    const maxDirs = ctx.destMaxDirs || ctx.maxDirs || 0;
    const destConf = ctx.destConf || session.currentConf || 1;
    const answer = input.trim();
    const nextPos = ctx.nextPos ?? (ctx.matchPos ?? 0) + 1;

    socket.emit('ansi-output', '\r\n');

    // express.e:27118 - an empty answer abandons the move, it is not an error.
    if (answer.length === 0) {
      await this.afterAction(socket, session, nextPos);
      return;
    }

    let destDir: number;
    if (answer[0] === 'A' || answer[0] === 'a') {
      // express.e:27120-27138, `(A)uto`: walk the destination's directories
      // from the highest down and take the first whose OWN newest entry is not
      // newer than the file being moved, so the file lands where the board
      // already keeps things of its age. Nothing matches -> DIR1.
      destDir = await this.autoDestinationDir(destConf, maxDirs, ctx);
    } else {
      destDir = Number.parseInt(answer, 10);
      // express.e:27140 - out of range abandons the move rather than erroring.
      if (Number.isNaN(destDir) || destDir < 1 || (maxDirs && destDir > maxDirs)) {
        await this.afterAction(socket, session, nextPos);
        return;
      }
    }

    await this.performMove(socket, session, ctx, destDir, destConf);
    await this.afterAction(socket, session, nextPos);
  }



  private static async performDelete(
    socket: any,
    session: BBSSession,
    ctx: any
  ): Promise<void> {
    const { dirFilePath, currentFile } = ctx;
    if (!dirFilePath || !currentFile) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Missing file context'));
      return;
    }

    // The one place the listings are edited (services/file-list.service).
    let outcome;
    try {
      outcome = await deleteEntry(
        { dataDir: _config.get('dataDir'), db: _db },
        session.currentConf || 1,
        ctx.dirNum,
        currentFile.filename,
        { start: currentFile.lineNumber ?? 0, count: currentFile.rawLines?.length || 1 },
      );
    } catch (error: any) {
      socket.emit('ansi-output', AnsiUtil.errorLine(error.message));
      return;
    }

    if (_callersLog) {
      _callersLog(session.user?.id || null, session.user?.username || 'unknown', 'Deleted file', currentFile.filename, session.nodeId || 1);
    }

    if (outcome.bytesError) {
      // The listing entry is gone but the file is not. Saying "complete" here
      // is how a sysop loses a listing and keeps the bytes without knowing.
      socket.emit('ansi-output', AnsiUtil.errorLine(
        `Removed from the listing, but the file could not be deleted: ${outcome.bytesError}`
      ));
      socket.emit('ansi-output', AnsiUtil.errorLine(
        `The previous listing is saved as ${path.basename(dirFilePath)}.bak`
      ));
      return;
    }

    socket.emit('ansi-output', AnsiUtil.successLine('Delete operation complete'));
    if (outcome.retentionWarning) {
      socket.emit('ansi-output', AnsiUtil.warningLine(outcome.retentionWarning));
    }
  }



  /**
   * `(A)uto` - express.e:27121-27138.
   *
   * Walk the destination conference's directories from the highest number
   * down, read the FIRST entry of each, and take the first directory whose
   * newest file is not newer than the one being moved (`d1 >= d2`). A board
   * that keeps DIR1 current and DIR8 ancient therefore files the move where
   * things of its age already live. Nothing matches - or no directory has a
   * readable date - and it is DIR1.
   */
  private static async autoDestinationDir(
    destConf: number,
    maxDirs: number,
    ctx: any
  ): Promise<number> {
    const fileDate = dateCompareValue(ctx.currentFile?.uploadDateDisplay || '');
    const bbsDataPath = _config.get('dataDir');
    const conferencePath = getConferenceDir(destConf, bbsDataPath);

    for (let candidate = maxDirs; candidate > 0; candidate -= 1) {
      try {
        const meta = this.getDirMeta(conferencePath, candidate, maxDirs);
        if (!fs.existsSync(meta.path)) continue;
        const firstLine = readDirLines(meta.path).find(
          (line) => dateOfDirLine(line) !== ''
        );
        if (!firstLine) continue;
        const dirDate = dateCompareValue(dateOfDirLine(firstLine));
        if (fileDate >= dirDate) return candidate;
      } catch (err) {
        console.error(`[FM] auto-destination could not read DIR${candidate}:`, err);
      }
    }
    return 1;
  }


  private static async performMove(
    socket: any,
    session: BBSSession,
    ctx: any,
    destDir: number,
    destConf?: number
  ): Promise<void> {
    const { dirFilePath, currentFile } = ctx;
    if (!dirFilePath || !currentFile) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Missing file context'));
      return;
    }

    // The DESTINATION conference, which is usually the point of a move. Bytes
    // first, listings after, nothing changed if the bytes cannot move - all in
    // services/file-list.service, the one place the listings are edited.
    try {
      await moveEntry(
        { dataDir: _config.get('dataDir'), db: _db },
        {
          conf: session.currentConf || 1,
          dir: ctx.dirNum,
          filename: currentFile.filename,
          at: { start: currentFile.lineNumber ?? 0, count: currentFile.rawLines?.length || 1 },
        },
        { conf: destConf || session.currentConf || 1, dir: destDir },
      );
    } catch (error: any) {
      socket.emit(
        'ansi-output',
        AnsiUtil.errorLine(`Could not move ${currentFile.filename}: ${error.message}`)
      );
      return;
    }

    if (_callersLog) {
      _callersLog(session.user?.id || null, session.user?.username || 'unknown', 'Moved file', `${currentFile.filename} -> ${destDir}`, session.nodeId || 1);
    }

    socket.emit('ansi-output', AnsiUtil.successLine(`Move operation successful to directory ${destDir}`));
  }





  private static async deleteDbEntries(confNum: number, filename: string): Promise<void> {
    if (!_db?.query) return;
    try {
      const match = await _db.query(
        `
        SELECT fe.id
        FROM file_entries fe
        JOIN file_areas fa ON fe.areaid = fa.id
        WHERE fa.conferenceid = $1 AND UPPER(fe.filename) = UPPER($2)
        `,
        [confNum, filename]
      );

      for (const row of match.rows || []) {
        await _db.query('DELETE FROM file_entries WHERE id = $1', [row.id]);
      }
    } catch (error) {
console.error('[FM] Failed to delete DB entries:', error);
    }
  }

  private static async moveDbEntry(confNum: number, filename: string, destDir: number): Promise<void> {
    if (!_db?.query) return;
    const destAreaId = await this.getAreaIdByDirIndex(confNum, destDir);
    if (!destAreaId) return;

    try {
      const match = await _db.query(
        `
        SELECT fe.id
        FROM file_entries fe
        JOIN file_areas fa ON fe.areaid = fa.id
        WHERE fa.conferenceid = $1 AND UPPER(fe.filename) = UPPER($2)
        ORDER BY fe.uploaddate DESC
        LIMIT 1
        `,
        [confNum, filename]
      );

      if (match.rows && match.rows.length > 0) {
        const id = match.rows[0].id;
        await _db.query('UPDATE file_entries SET areaid = $1 WHERE id = $2', [destAreaId, id]);
      }
    } catch (error) {
console.error('[FM] Failed to move DB entry:', error);
    }
  }

  private static async getAreaIdByDirIndex(confNum: number, dirIndex: number): Promise<number | null> {
    if (!_db?.query) return null;
    if (!dirIndex || dirIndex < 1) return null;
    try {
      const res = await _db.query(
        `
        SELECT id FROM file_areas
        WHERE conferenceid = $1
        ORDER BY id
        OFFSET $2 LIMIT 1
        `,
        [confNum, dirIndex - 1]
      );
      if (res.rows && res.rows.length > 0) {
        return res.rows[0].id;
      }
    } catch (error) {
console.error('[FM] Failed to map dir to area:', error);
    }
    return null;
  }

  /**
   * Handle action input (D/M/V/Q/Enter)
   * express.e:25012-25030
   */
  static async handleActionInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    const action = input.trim().toUpperCase() || 'C';
    const continuePos = (ctx.matchPos ?? 0) + 1;

    socket.emit('ansi-output', '\r\n');

    if (action === 'Q') {
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = {};
      return;
    }

    if (action === 'D') {
      const nextPos = ctx.matchPos ?? 0;
      session.tempData.fmContext = { ...ctx, step: 'confirm_delete', nextPos };
      await this.promptDeleteConfirmation(socket, session);
      return;
    }

    if (action === 'M') {
      const nextPos = ctx.matchPos ?? 0;
      session.tempData.fmContext = { ...ctx, step: 'get_move_dest', nextPos };
      await this.promptMoveDestination(socket, session);
      return;
    }

    if (action === 'V') {
      if (!ctx.viewAllowed) {
        // express.e:25015 '\b\nView option is not available for hold directory\b\n'
        socket.emit('ansi-output', '\r\nView option is not available for hold directory\r\n');
        await this.redisplayPrompt(socket, session);
        return;
      }
      await this.viewFile(socket, session, ctx.currentFile);
      await this.afterAction(socket, session, continuePos);
      return;
    }

    // Default: Continue
    await this.afterAction(socket, session, continuePos);
  }

  /**
   * Handle remove from flagged list input
   * express.e:25028-25030
   */
  static async handleRemoveFlagInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const response = input.trim().toUpperCase();
    const ctx = session.tempData.fmContext || {};
    const currentFile = ctx.currentFile;
    const nextPos = ctx.nextPos ?? (ctx.matchPos ?? 0) + 1;

    socket.emit('ansi-output', '\r\n');

    if (currentFile && (response === 'Y' || response === 'YES' || response === '')) {
      const flagManager = await flagManagerOf(session, _config.get('dataDir'));
      flagManager.removeFlag(currentFile.filename, session.currentConf);
      await flagManager.save();
      socket.emit('ansi-output', AnsiUtil.successLine(`Removed ${currentFile.filename} from flagged list`));
    }

    await this.continueSearch(socket, session, nextPos);
  }

  /**
   * Continue searching from position
   */
  private static async continueSearch(
    socket: any,
    session: BBSSession,
    nextPos: number
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    session.tempData.fmContext = { ...ctx, resumePos: nextPos };
    const dirIdx = ctx.dirIndex || 0;
    await this.scanDirectories(socket, session, dirIdx, nextPos);
  }

  /**
   * View file contents
   * express.e:25020 - internalCommandV()
   */
  private static async viewFile(
    socket: any,
    session: BBSSession,
    file: any
  ): Promise<void> {
    const { ViewFileHandler } = require('../content/view-file.handler');
    await ViewFileHandler.handleViewFileCommand(socket, session, file.filename);
  }

  // === UTILITY FUNCTIONS ===

  /**
   * Parse parameters from command line
   * express.e:24905
   */
  private static parseParams(params: string): string[] {
    if (!params || params.trim().length === 0) {
      return [];
    }
    return params.trim().split(/\s+/);
  }

  /**
   * Parse comma-separated list
   * express.e:24957
   */
  private static parseList(input: string): string[] {
    return input.split(/[,\s]+/).map(s => s.trim()).filter(s => s.length > 0);
  }

  /**
   * Wildcard matching (supports * and ?)
   */
  private static wildcardMatch(text: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(text);
  }
}
