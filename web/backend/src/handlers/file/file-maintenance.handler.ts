/**
 * File Maintenance Handler - FM Command
 *
 * Port of express.e internalCommandFM (24889-25045) and the procedures it
 * calls: maintenanceFileSearch (27412-27527), maintenanceFileDelete
 * (26914-27017), maintenanceFileMove (27087-27410) and getMoveConf (27019,
 * shared with the message mover in message/read-msg.ts).
 *
 * The opening prompts (filename list, directory span) are line states
 * (FM_FILENAME_INPUT, FM_DIRSPAN_INPUT). From the directory span on, the scan
 * is one procedure, as in express.e: it waits on readChar / yesNo /
 * lineInput (utils/await-input), which handleCommand feeds before any
 * sub-state runs, and sits in FM_SCAN between prompts.
 */

import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { matchAmigaPattern } from '../../utils/amiga-pattern';
import { flagManagerOf } from '../../utils/file-flag.util';
import { emitText, flushOutput } from '../../utils/output.util';
import { lineInput, readChar, yesNo } from '../../utils/await-input';
import { NO_SUCH_DIRECTORY, parseDirSpan, getDirSpanPrompt, DirSpan } from '../../utils/dir-span.util';
import { DirFileEntry, getHoldDirFilePath } from '../../utils/dir-file-reader.util';
import { deleteEntry, moveEntry, listEntries, readDirLines, dateCompareValue, dateOfDirLine } from '../../services/file-list.service';
import * as path from 'path';
import * as fs from 'fs';
import { getConferenceDir } from '../../utils/file-hold.util';

import type { BBSSession } from '../../index';

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

/** What maintenanceFileSearch hands back for a key that is not C (27514-27518). */
interface SearchHit {
  action: string;
  entry: DirFileEntry;
}

/** The context performDelete / performMove act on: the listing and the entry in it. */
interface ActionContext {
  dirFilePath: string;
  dirNum: number;
  currentFile: DirFileEntry;
}

/**
 * Main FM command handler
 * express.e:24889-25045
 */
export class FileMaintenanceHandler {

  /**
   * Handle FM command - Interactive file maintenance
   * express.e:24889-24956
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

    // express.e:24905 - parseParams(params)
    const parsedParams = this.parseParams(params);

    // express.e:24907-24909 - Initialize
    session.tempData = session.tempData || {};
    session.tempData.lineCount = 0;
    session.tempData.nonStopDisplayFlag = false;

    emitText(socket, '\r\n');

    // express.e:24910-24914 - Check if directories exist
    const { getMaxDirs } = require('../../utils/max-dirs.util');
    const bbsDataPath = _config.get('dataDir');
    const maxDirs = await getMaxDirs(session.currentConf || 1, bbsDataPath);

    if (maxDirs === 0) {
      // express.e:24911-24913: '\b\n' + myError(5) = 'No files available in this conference.\b\n\b\n'
      emitText(socket, '\r\nNo files available in this conference.\r\n\r\n');
      flushOutput(socket);
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e:24916-24925 - parameters are the file list (JUMP fmSkip1)
    if (parsedParams.length > 0) {
      this.searchAndMaintainFiles(socket, session, parsedParams, maxDirs, false);
      return;
    }

    // express.e:24925-24938 - the caller's flagged files, yesNo(1) then '\b\n' (24929)
    const flagManager = await flagManagerOf(session, bbsDataPath);
    const userFlags = flagManager.getAll();

    if (userFlags.length > 0) {
      emitText(socket, 'You have flagged files, do you wish to work with these files ');
      const useFlagged = await yesNo(socket, session, 1);
      emitText(socket, '\r\n');
      if (useFlagged) {
        this.searchAndMaintainFiles(socket, session, userFlags.map(f => f.filename), maxDirs, true);
        return;
      }
    }

    // express.e:24942 - Prompt for filename pattern
    this.promptForFilenamePattern(socket, session, maxDirs);
  }

  /**
   * Prompt user for filename pattern
   * express.e:24942-24952
   */
  private static promptForFilenamePattern(
    socket: any,
    session: BBSSession,
    maxDirs: number
  ): void {
    emitText(socket, 'Enter filename(s) to search for (wildcards are permitted): ');
    flushOutput(socket); // the line it waits on is read by FM_FILENAME_INPUT

    session.tempData.fmContext = { maxDirs };
    session.subState = LoggedOnSubState.FM_FILENAME_INPUT;
  }

  /**
   * Handle filename pattern input
   * express.e:24943-24952
   */
  static async handleFilenameInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const trimmed = input.trim();

    // lineInput's line break, then 24946's aePuts('\b\n') - for any answer.
    emitText(socket, '\r\n\r\n');

    // express.e:24947-24949 - Empty input: RETURN RESULT_SUCCESS
    if (trimmed.length === 0) {
      await this.endFM(socket, session);
      return;
    }

    // express.e:24952 - Parse filename list (comma separated)
    const flagFileList = this.parseList(trimmed);
    const maxDirs = session.tempData.fmContext.maxDirs;

    this.searchAndMaintainFiles(socket, session, flagFileList, maxDirs, false);
  }

  /**
   * fmSkip1: getDirSpan('') - express.e:24956
   */
  private static searchAndMaintainFiles(
    socket: any,
    session: BBSSession,
    flagFileList: string[],
    maxDirs: number,
    useFlagged: boolean
  ): void {
    const hasHoldAccess = this.canAccessHold(session);
    emitText(socket, getDirSpanPrompt(maxDirs, hasHoldAccess));
    flushOutput(socket); // the line it waits on is read by FM_DIRSPAN_INPUT

    session.tempData.fmContext = { flagFileList, maxDirs, hasHoldAccess, useFlagged };
    session.subState = LoggedOnSubState.FM_DIRSPAN_INPUT;
  }

  /**
   * Handle directory span input, then run the scan.
   * express.e:24956-24959 (getDirSpan 26860-26910)
   */
  static async handleDirSpanInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const { flagFileList, maxDirs, hasHoldAccess, useFlagged } = session.tempData.fmContext;
    const trimmed = input.trim();

    // lineInput's line break (express.e:2378).
    emitText(socket, '\r\n');

    if (trimmed.length === 0) {
      emitText(socket, '\r\n'); // getDirSpan's (26873)
      await this.endFM(socket, session);
      return;
    }

    const dirSpan: DirSpan = parseDirSpan(trimmed, maxDirs, hasHoldAccess);

    if (!dirSpan.success) {
      emitText(socket, NO_SUCH_DIRECTORY); // getDirSpan's (26905)
      await this.endFM(socket, session);
      return;
    }

    emitText(socket, '\r\n'); // express.e:24959, before the scan

    session.subState = LoggedOnSubState.FM_SCAN;
    const finishedScan = await this.runScan(
      socket, session, flagFileList || [], this.buildDirList(dirSpan), useFlagged || false
    );
    // express.e:25040 - the closing '\b\n' only on the way out of the loop;
    // a D/M failure or q leaves through Raise(ERR_EXCEPT) without it.
    if (finishedScan) emitText(socket, '\r\n');
    await this.endFM(socket, session);
  }

  /**
   * express.e:24961-25036. Each directory of the span: "Scanning directory",
   * then maintenanceFileSearch from the last match's position until it finds
   * nothing more. Returns false when FM leaves early (q, or a D/M that did
   * not return RESULT_SUCCESS: Raise(ERR_EXCEPT), 25006/25011/25021).
   */
  private static async runScan(
    socket: any,
    session: BBSSession,
    flagFileList: string[],
    dirs: number[],
    useFlagged: boolean
  ): Promise<boolean> {
    if (flagFileList.length === 0) return true; // express.e:24961

    const bbsDataPath = _config.get('dataDir');
    const confNum = session.currentConf || 1;

    for (const dirNum of dirs) {
      const holdDir = dirNum === -1;
      const dirMeta = this.getDirMeta(getConferenceDir(confNum, bbsDataPath), dirNum);

      if (holdDir) {
        emitText(socket, '\r\nScanning directory HOLD\r\n'); // express.e:24984
      } else {
        // express.e:24966-24980 - the upload directory is printed like any other
        emitText(socket, `Scanning directory ${dirNum}\r\n`);
        session.tempData.lineCount = (session.tempData.lineCount || 0) + 1;
      }

      // express.e:24989 - matchpos starts at the top of each listing. It is
      // the LINE the last match began on: after D or M that line holds the
      // next entry; after V, an abandoned move or a refused Remove, it holds
      // the same entry, which is shown again (27514-27518 returns
      // startposition, the matched entry's own line).
      let matchPos = 0;
      for (;;) {
        const hit = await this.maintenanceFileSearch(socket, session, holdDir, confNum, dirNum, flagFileList, matchPos);
        if (hit === 'break') {
          // express.e:24993-24996: RESULT_FAILURE from the search ends FM
          // after a line break, without the closing one.
          emitText(socket, '\r\n');
          return false;
        }
        if (!hit) break;
        matchPos = hit.entry.lineNumber;

        emitText(socket, '\r\n'); // express.e:25002
        const ctx: ActionContext = { dirFilePath: dirMeta.path, dirNum, currentFile: hit.entry };
        const action = hit.action;

        if (action === 'D' || action === 'd') {
          if (!(await this.performDelete(socket, session, ctx))) return false;
        } else if (action === 'M' || action === 'm') {
          if (!(await this.maintenanceFileMove(socket, session, ctx))) return false;
        } else if (action === 'V' || action === 'v') {
          if (holdDir) {
            // express.e:25015 - unreachable through the search, which does not
            // take V in Hold (27432, 27514), and kept as express.e has it.
            emitText(socket, '\r\nView option is not available for hold directory\r\n');
          } else {
            await this.viewFile(socket, session, hit.entry);
            session.subState = LoggedOnSubState.FM_SCAN;
          }
        } else if (action === 'q') {
          // express.e:25019 tests `(action="q") OR (action="q")`: only the
          // lowercase q quits. A capital Q falls through to "Remove from
          // flagged list" and shows the same file again, as it does there.
          return false;
        }

        // express.e:25023-25031
        if (useFlagged) {
          emitText(socket, '\r\nRemove from flagged list');
          if (await yesNo(socket, session, 1)) {
            const flagManager = await flagManagerOf(session, bbsDataPath);
            flagManager.removeFlag(hit.entry.filename); // removeFlagFromList(foundfile): c=-1, every conference
            await flagManager.save();
          }
        }
      }
    }
    return true;
  }

  /**
   * express.e:27412-27527. From line `startLine` on, the next entry a name of
   * the list matches: the entry's line, up to max_desclines description
   * lines, a blank line and the action prompt, read with readChar. C carries
   * on down the listing ('\b\n'); D, M, Q, and V where viewing is allowed,
   * end it. Any other key is read again. null = nothing more matched.
   */
  private static async maintenanceFileSearch(
    socket: any,
    session: BBSSession,
    holdDir: boolean,
    confNum: number,
    dirNum: number,
    searchList: string[],
    startLine: number
  ): Promise<SearchHit | 'break' | null> {
    // checkInput() (27436): a key typed while the scan runs. The FM_SCAN
    // handler records a ^C that arrives between prompts.
    session.tempData.fmBreak = false;
    const entries = await listEntries({ dataDir: _config.get('dataDir'), db: _db }, confNum, dirNum);
    const viewAllowed = this.canViewFile(session, holdDir); // 27431-27432

    for (const entry of entries) {
      if (entry.lineNumber < startLine || !entry.filename) continue;
      // express.e:27434-27443: ^C ends the search.
      if (session.tempData.fmBreak) {
        session.tempData.fmBreak = false;
        emitText(socket, '**Break\r\n');
        flushOutput(socket);
        return 'break';
      }
      // express.e:27444-27470: the directory entry's name is the AmigaDOS
      // pattern (parsePatternNoCase2) and each typed name is the string it is
      // matched against, so a typed `*.LHA` is not a wildcard here.
      const matches = searchList.some(typed => matchAmigaPattern(entry.filename, typed, true));
      if (!matches) continue;

      // express.e:27485-27503
      emitText(socket, '\r\n');
      emitText(socket, `${entry.rawLines[0]}\r\n`);
      for (const line of entry.rawLines.slice(1, 1 + MAX_DESC_LINES)) {
        emitText(socket, `${line}\r\n`);
      }
      emitText(socket, '\r\n');
      emitText(socket, viewAllowed
        ? '\x1b[32m(\x1b[33mC\x1b[32m)\x1b[36montinue, \x1b[32m(\x1b[33mD\x1b[32m)\x1b[36melete, \x1b[32m(\x1b[33mM\x1b[32m)\x1b[36move, \x1b[32m(\x1b[33mV\x1b[32m)\x1b[36miew, \x1b[32m(\x1b[33mQ\x1b[32m)\x1b[36muit\x1b[0m? '
        : '\x1b[32m(\x1b[33mC\x1b[32m)\x1b[36montinue, \x1b[32m(\x1b[33mD\x1b[32m)\x1b[36melete, \x1b[32m(\x1b[33mM\x1b[32m)\x1b[36move, \x1b[32m(\x1b[33mQ\x1b[32m)\x1b[36muit\x1b[0m? ');

      // express.e:27505-27520
      for (;;) {
        const ch = await readChar(socket, session);
        if (ch === 'C' || ch === 'c') {
          emitText(socket, '\r\n');
          break;
        }
        if ('dDmMqQ'.includes(ch) && ch.length === 1) return { action: ch, entry };
        if ((ch === 'v' || ch === 'V') && viewAllowed) return { action: ch, entry };
      }
    }
    return null;
  }

  /**
   * express.e:27087-27146, maintenanceFileMove up to the listing work:
   * getMoveConf(FALSE), the destination's NDIRS, the directory prompt.
   * false = not RESULT_SUCCESS, which ends FM (25008-25011).
   */
  private static async maintenanceFileMove(
    socket: any,
    session: BBSSession,
    ctx: ActionContext
  ): Promise<boolean> {
    const { getMoveConf } = require('../message/read-msg');
    const chosen: { conf: number } | null = await getMoveConf(socket, session, false);
    if (!chosen) return false;                 // 27106 (getMoveConf's failure)
    if (chosen.conf === 0) return true;        // 27107
    const destConf = chosen.conf;

    // express.e:27111 - readToolTypeInt(TOOLTYPE_CONF, destConf, 'NDIRS')
    const { getMaxDirs } = require('../../utils/max-dirs.util');
    const maxConfDir: number = await getMaxDirs(destConf, _config.get('dataDir'));

    emitText(socket, `\r\nDirectory to move to: (1-${maxConfDir}), (A)uto, (Enter)=abort? `);
    const destDirStr = await lineInput(socket, session, 5);
    if (destDirStr.length === 0) return true;  // 27119

    let destDir: number;
    if (destDirStr[0] === 'A' || destDirStr[0] === 'a') {
      destDir = await this.autoDestinationDir(destConf, maxConfDir, ctx);
    } else {
      destDir = Number.parseInt(destDirStr, 10);
      if (Number.isNaN(destDir)) destDir = 0;
      if (destDir < 1 || destDir > maxConfDir) return true; // 27145
    }

    return this.performMove(socket, session, ctx, destDir, destConf);
  }

  /**
   * express.e:26914-27017, maintenanceFileDelete. The listing entry goes,
   * then the bytes (services/file-list.service, the one place the listings
   * are edited). false = not RESULT_SUCCESS, which ends FM (25003-25006).
   */
  private static async performDelete(
    socket: any,
    session: BBSSession,
    ctx: ActionContext
  ): Promise<boolean> {
    const { dirFilePath, currentFile } = ctx;

    emitText(socket, '\r\nRemoving from directory list, please wait..'); // 26937

    let outcome;
    try {
      outcome = await deleteEntry(
        { dataDir: _config.get('dataDir'), db: _db },
        session.currentConf || 1,
        ctx.dirNum,
        currentFile.filename,
        { start: currentFile.lineNumber ?? 0, count: currentFile.rawLines?.length || 1 },
      );
    } catch (error) {
      console.error(`[FM] delete of ${currentFile.filename} failed:`, error);
      emitText(socket, '\r\nError updating directory list, delete operation aborted.\r\n'); // 26979
      flushOutput(socket);
      return false;
    }

    if (_callersLog) {
      _callersLog(session.user?.id || null, session.user?.username || 'unknown', 'Deleted file', currentFile.filename, session.nodeId || 1);
    }

    // express.e:26985-26999
    emitText(socket, ctx.dirNum === -1
      ? '\r\nRemoving from hold folder, please wait..'
      : '\r\nRemoving from download folder, please wait..');

    if (outcome.bytesError) {
      // WEB_: express.e:26988/26995 ignore DeleteFile's result and say
      // "Delete operation complete" whatever happened to the bytes. Here the
      // listing entry is gone but the file is not, and the sysop is told so.
      emitText(socket, AnsiUtil.errorLine(
        `Removed from the listing, but the file could not be deleted: ${outcome.bytesError}`
      ));
      emitText(socket, AnsiUtil.errorLine(
        `The previous listing is saved as ${path.basename(dirFilePath)}.bak`
      ));
      flushOutput(socket);
      return true;
    }

    emitText(socket, '\r\n\r\nDelete operation complete \r\n'); // 27000
    if (outcome.retentionWarning) {
      // WEB_: a pooled volume's RETENTION policy has no express.e
      // counterpart; the provider may keep the object for a while.
      emitText(socket, AnsiUtil.warningLine(outcome.retentionWarning));
    }
    flushOutput(socket);
    return true;
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
    ctx: ActionContext
  ): Promise<number> {
    const fileDate = dateCompareValue(ctx.currentFile?.uploadDateDisplay || '');
    const bbsDataPath = _config.get('dataDir');
    const conferencePath = getConferenceDir(destConf, bbsDataPath);

    for (let candidate = maxDirs; candidate > 0; candidate -= 1) {
      try {
        const meta = this.getDirMeta(conferencePath, candidate);
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

  /**
   * express.e:27147-27410, the listing and bytes half of maintenanceFileMove.
   * Bytes first, listings after, nothing changed if the bytes cannot move -
   * all in services/file-list.service. false = not RESULT_SUCCESS.
   */
  private static async performMove(
    socket: any,
    session: BBSSession,
    ctx: ActionContext,
    destDir: number,
    destConf?: number
  ): Promise<boolean> {
    const { dirFilePath, currentFile } = ctx;

    emitText(socket, '\r\nUpdating directory list, please wait..'); // 27171
    if (!fs.existsSync(dirFilePath)) {
      emitText(socket, '\r\nError accessing the directory list, move operation aborted.\r\n'); // 27175
      flushOutput(socket);
      return false;
    }
    emitText(socket, '\r\nMoving file, please wait..'); // 27278

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
    } catch (error) {
      console.error(`[FM] move of ${currentFile.filename} failed:`, error);
      emitText(socket, '\r\n\r\nMove operation failed, restoring directories \r\n'); // 27358
      flushOutput(socket);
      return false;
    }

    if (_callersLog) {
      _callersLog(session.user?.id || null, session.user?.username || 'unknown', 'Moved file', `${currentFile.filename} -> ${destDir}`, session.nodeId || 1);
    }

    emitText(socket, '\r\n\r\nMove operation successful \r\n'); // 27346
    flushOutput(socket);
    return true;
  }

  /**
   * FM is over: express.e's main loop sets menuPause and goes to the menu
   * (28647-28648). From a state handler nothing else runs the display flow,
   * so it is run here, as read-msg's reader does at its end.
   */
  private static async endFM(socket: any, session: BBSSession): Promise<void> {
    flushOutput(socket);
    session.tempData = {};
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    const { advanceDisplayFlow } = require('../command.handler');
    await advanceDisplayFlow(socket, session);
  }

  private static getDirMeta(conferencePath: string, dirNum: number) {
    const isHold = dirNum === -1;
    const label = isHold ? 'HOLD' : `${dirNum}`;
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

  private static canViewFile(session: BBSSession, isHold: boolean): boolean {
    if (isHold) {
      return false;
    }
    return checkSecurity(session.user, ACSPermission.VIEW_A_FILE);
  }

  /**
   * View file contents
   * express.e:25017 - internalCommandV('V',foundfile)
   */
  private static async viewFile(
    socket: any,
    session: BBSSession,
    file: DirFileEntry
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
   * express.e:24952
   */
  private static parseList(input: string): string[] {
    return input.split(/[,\s]+/).map(s => s.trim()).filter(s => s.length > 0);
  }
}
