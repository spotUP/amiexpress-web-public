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

import { LoggedOnSubState } from '../constants/bbs-states';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity } from '../utils/acs.util';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { FileFlagManager } from '../utils/file-flag.util';
import { parseDirSpan, getDirSpanPrompt, DirSpan } from '../utils/dir-span.util';
import { parseDirFile, DirFileEntry } from '../utils/dir-file-reader.util';
import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { getConferenceDir } from '../utils/file-hold.util';

import type { BBSSession } from '../index';

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
    const { getMaxDirs } = require('../utils/max-dirs.util');
    const bbsDataPath = _config.get('dataDir');
    const maxDirs = await getMaxDirs(session.currentConf || 1, bbsDataPath);

    if (maxDirs === 0) {
      socket.emit('ansi-output', AnsiUtil.errorLine('No file directories available in this conference'));
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
    const flagManager = new FileFlagManager('', 0, 0);
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
      const flagManager = new FileFlagManager('', 0, 0);
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
      socket.emit('ansi-output', AnsiUtil.colorize(`Scanning directory ${dirMeta.label}\r\n`, 'yellow'));
      session.tempData.lineCount = (session.tempData.lineCount || 0) + 1;

      if (!fs.existsSync(dirFilePath)) {
        resumePos = 0;
        continue;
      }

      const dirContent = fs.readFileSync(dirFilePath, 'utf-8');
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
    const isLcFiles = dirNum === 0;
    const label = isHold ? 'HOLD' : isLcFiles ? 'LCFILES' : dirNum === maxDirs ? `${dirNum} (Upload)` : `${dirNum}`;
    const dirPath = isHold
      ? path.join(conferencePath, 'hold', 'held')
      : isLcFiles
        ? path.join(conferencePath, 'LCFILES', 'LCFILES')
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

  private static async promptMoveDestination(
    socket: any,
    session: BBSSession
  ): Promise<void> {
    socket.emit('ansi-output', 'Enter destination directory number: ');
    session.subState = LoggedOnSubState.FM_MOVE_DEST_INPUT;
  }

  static async handleMoveDestInput(
    socket: any,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const ctx = session.tempData.fmContext || {};
    const maxDirs = ctx.maxDirs || 0;
    const destDir = parseInt(input.trim(), 10);
    const nextPos = ctx.nextPos ?? (ctx.matchPos ?? 0) + 1;

    socket.emit('ansi-output', '\r\n');

    if (isNaN(destDir) || destDir < 1 || (maxDirs && destDir > maxDirs)) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Invalid destination directory'));
      await this.redisplayPrompt(socket, session);
      session.subState = LoggedOnSubState.FM_ACTION_INPUT;
      return;
    }

    await this.performMove(socket, session, ctx, destDir);
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

    if (!fs.existsSync(dirFilePath)) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Directory list not found'));
      return;
    }

    const lines = fs.readFileSync(dirFilePath, 'utf-8').split(/\r?\n/);
    const start = currentFile.lineNumber ?? 0;
    const end = start + (currentFile.rawLines?.length || 1);
    const updated = [...lines.slice(0, start), ...lines.slice(end)];

    fs.writeFileSync(dirFilePath, updated.join('\r\n'), 'utf-8');

    await this.deletePhysicalFile(session, currentFile.filename, ctx.dirNum);

    // Database sync - optional, not required for BBS operation
    // Doors read from DIR files on disk, not from database
    // await this.deleteDbEntries(session.currentConf || 1, currentFile.filename);

    if (_callersLog) {
      _callersLog(session.user?.id || null, session.user?.username || 'unknown', 'Deleted file', currentFile.filename, session.nodeId || 1);
    }

    socket.emit('ansi-output', AnsiUtil.successLine('Delete operation complete'));
  }

  private static async performMove(
    socket: any,
    session: BBSSession,
    ctx: any,
    destDir: number
  ): Promise<void> {
    const { dirFilePath, currentFile } = ctx;
    if (!dirFilePath || !currentFile) {
      socket.emit('ansi-output', AnsiUtil.errorLine('Missing file context'));
      return;
    }

    const bbsDataPath = _config.get('dataDir');
    const confNum = session.currentConf || 1;
    const conferencePath = getConferenceDir(confNum, bbsDataPath);
    const destMeta = this.getDirMeta(conferencePath, destDir, ctx.maxDirs);
    const destPath = destMeta.path;

    const srcLines = fs.readFileSync(dirFilePath, 'utf-8').split(/\r?\n/);
    const start = currentFile.lineNumber ?? 0;
    const end = start + (currentFile.rawLines?.length || 1);
    const entryLines = srcLines.slice(start, end);
    const remaining = [...srcLines.slice(0, start), ...srcLines.slice(end)];

    fs.writeFileSync(dirFilePath, remaining.join('\r\n'), 'utf-8');

    const destLines = fs.existsSync(destPath)
      ? fs.readFileSync(destPath, 'utf-8').split(/\r?\n/)
      : [];

    const merged = destLines.concat(entryLines);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, merged.join('\r\n'), 'utf-8');

    await this.movePhysicalFile(session, currentFile.filename, ctx.dirNum, destDir);

    // Database sync - optional, not required for BBS operation
    // Doors read from DIR files on disk, not from database
    // await this.moveDbEntry(session.currentConf || 1, currentFile.filename, destDir);

    if (_callersLog) {
      _callersLog(session.user?.id || null, session.user?.username || 'unknown', 'Moved file', `${currentFile.filename} -> ${destDir}`, session.nodeId || 1);
    }

    socket.emit('ansi-output', AnsiUtil.successLine(`Move operation successful to directory ${destDir}`));
  }

  private static async deletePhysicalFile(session: BBSSession, filename: string, dirNum?: number) {
    const confNum = session.currentConf || 1;
    const dataDir = _config.get('dataDir');
    const candidates = await this.buildFileCandidates(confNum, filename, dirNum);

    for (const filePath of candidates) {
      try {
        await fsp.unlink(filePath);
        return;
      } catch {
        // Try next candidate
      }
    }
  }

  private static async movePhysicalFile(session: BBSSession, filename: string, srcDir?: number, destDir?: number) {
    const confNum = session.currentConf || 1;
    const dataDir = _config.get('dataDir');
    const candidates = await this.buildFileCandidates(confNum, filename, srcDir);
    const destBase = await this.getUploadBase(confNum);
    if (!destBase) {
      return;
    }
    const destPath = path.join(destBase, filename);

    for (const srcPath of candidates) {
      try {
        await fsp.mkdir(path.dirname(destPath), { recursive: true });
        await fsp.rename(srcPath, destPath);
        return;
      } catch {
        // Try next candidate
      }
    }
  }

  private static async buildFileCandidates(confNum: number, filename: string, dirNum?: number): Promise<string[]> {
    const dataDir = _config.get('dataDir');
    const confPath = getConferenceDir(confNum, dataDir);
    const list: string[] = [];

    // HOLD / LCFILES
    list.push(path.join(confPath, 'HOLD', filename));
    list.push(path.join(confPath, 'LCFILES', filename));

    // DIR-specific folder (best-effort)
    if (dirNum && dirNum > 0) {
      list.push(path.join(confPath, `DIR${dirNum}`, filename));
    }

    // Configured download/upload paths
    const paths = await this.getConfiguredPaths(['DLPATH', 'ULPATH']);
    for (const p of paths) {
      const base = path.isAbsolute(p) ? p : path.join(dataDir, p);
      list.push(path.join(base, filename));
    }

    return list;
  }

  private static async getConfiguredPaths(keys: Array<'DLPATH' | 'ULPATH'>): Promise<string[]> {
    if (!_db?.query) return [];
    const results: string[] = [];

    for (const key of keys) {
      try {
        const rows = await _db.query(`SELECT value FROM system_config WHERE key LIKE '${key}.%'`);
        for (const row of rows.rows || []) {
          if (row.value) {
            results.push(row.value);
          }
        }
      } catch (error) {
        console.error(`[FM] Failed to read ${key} paths:`, error);
      }
    }

    return results;
  }

  private static async getUploadBase(confNum: number): Promise<string | null> {
    const dataDir = _config.get('dataDir');
    const paths = await this.getConfiguredPaths(['ULPATH']);
    if (paths.length === 0) {
      return null;
    }
    const base = paths[0];
    return path.isAbsolute(base) ? base : path.join(dataDir, base);
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
        socket.emit('ansi-output', AnsiUtil.errorLine('View option is not available for this directory'));
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
      const flagManager = new FileFlagManager('', 0, 0);
      flagManager.removeFlag(currentFile.filename, session.currentConf);
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
    const { ViewFileHandler } = require('./view-file.handler');
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
