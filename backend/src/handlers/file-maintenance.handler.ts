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
import * as path from 'path';
import * as fs from 'fs';

// Types
interface BBSSession {
  user?: any;
  currentConf?: number;
  subState?: string;
  menuPause?: boolean;
  tempData?: any;
  [key: string]: any;
}

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

// Dependencies injected from index.ts
let _db: any;
let _config: any;
let _callersLog: any;

export function setFileMaintenanceDependencies(deps: {
  db: any;
  config: any;
  callersLog: any;
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
    const flagManager = new FileFlagManager();
    const userFlags = flagManager.getFlags(session);

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
      const flagManager = new FileFlagManager();
      const userFlags = flagManager.getFlags(session);
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
    const { getDirSpanPrompt } = require('../utils/dir-file-reader.util');
    const dirSpan = getDirSpanPrompt(maxDirs, false); // false = no HOLD access for normal users

    socket.emit('ansi-output', `Enter directory range to search (1-${maxDirs}) or ALL: `);

    session.tempData.fmContext = {
      step: 'get_dir_span',
      flagFileList,
      maxDirs
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
    const trimmed = input.trim().toUpperCase();
    const { flagFileList, maxDirs } = session.tempData.fmContext;

    socket.emit('ansi-output', '\r\n');

    let startDir = 1;
    let endDir = maxDirs;

    // Parse directory range
    if (trimmed === 'ALL' || trimmed === '') {
      // Use all directories
    } else if (trimmed.includes('-')) {
      const parts = trimmed.split('-');
      startDir = parseInt(parts[0]) || 1;
      endDir = parseInt(parts[1]) || maxDirs;
    } else {
      startDir = endDir = parseInt(trimmed) || 1;
    }

    // Validate range
    if (startDir < 1) startDir = 1;
    if (endDir > maxDirs) endDir = maxDirs;
    if (startDir > endDir) [startDir, endDir] = [endDir, startDir];

    // express.e:24968-25035 - Loop through directories and search for files
    await this.scanDirectories(socket, session, flagFileList, startDir, endDir, maxDirs);
  }

  /**
   * Scan directories for matching files
   * express.e:24968-25035
   */
  private static async scanDirectories(
    socket: any,
    session: BBSSession,
    flagFileList: string[],
    startDir: number,
    endDir: number,
    maxDirs: number
  ): Promise<void> {

    const bbsDataPath = _config.get('dataDir');
    const confNum = session.currentConf || 1;
    const { readDirFile } = require('../utils/dir-file-reader.util');
    const { getConferenceDir } = require('../utils/file-hold.util');

    // express.e:24970-25033 - Loop through each directory
    for (let dirNum = startDir; dirNum <= endDir; dirNum++) {
      const conferencePath = getConferenceDir(confNum, bbsDataPath);
      const dirFilePath = path.join(conferencePath, `DIR${dirNum}`);

      // express.e:24972-24991 - Display scanning message
      socket.emit('ansi-output', AnsiUtil.colorize(`Scanning directory ${dirNum}\r\n`, 'yellow'));
      session.tempData.lineCount = (session.tempData.lineCount || 0) + 1;

      // Read DIR file
      if (!fs.existsSync(dirFilePath)) {
        continue;
      }

      const entries = await readDirFile(dirFilePath);

      // express.e:24995-25031 - Search for matching files
      let matchPos = 0;
      while (matchPos < entries.length) {
        const result = await this.maintenanceFileSearch(
          socket,
          session,
          dirFilePath,
          dirNum,
          entries,
          flagFileList,
          matchPos
        );

        if (result.stat === 'NOT_FOUND') {
          break; // No more matches in this directory
        }

        if (result.stat === 'QUIT') {
          // User quit, exit completely
          socket.emit('ansi-output', '\r\n');
          session.menuPause = true;
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          session.tempData = {};
          return;
        }

        matchPos = result.nextMatchPos;
      }
    }

    // express.e:25036 - All directories scanned
    socket.emit('ansi-output', '\r\nFile maintenance complete.\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = {};
  }

  /**
   * Search for files matching patterns in directory
   * express.e:24997-25031 (maintenanceFileSearch)
   *
   * Returns: { stat: 'FOUND' | 'NOT_FOUND' | 'QUIT', nextMatchPos: number }
   */
  private static async maintenanceFileSearch(
    socket: any,
    session: BBSSession,
    dirFilePath: string,
    dirNum: number,
    entries: any[],
    flagFileList: string[],
    startPos: number
  ): Promise<{ stat: string; nextMatchPos: number }> {

    // Search for next matching file starting from startPos
    for (let i = startPos; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.filename) continue;

      // Check if filename matches any pattern in flagFileList
      const matches = flagFileList.some(pattern =>
        this.wildcardMatch(entry.filename.toUpperCase(), pattern.toUpperCase())
      );

      if (matches) {
        // Found a match! Display file info and prompt for action
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', AnsiUtil.colorize(`File: ${entry.filename}`, 'cyan'));
        socket.emit('ansi-output', `  (${entry.size || 0} bytes)\r\n`);
        if (entry.description) {
          socket.emit('ansi-output', `  ${entry.description}\r\n`);
        }
        socket.emit('ansi-output', '\r\n');

        // express.e:25012-25027 - Prompt for action
        socket.emit('ansi-output', AnsiUtil.colorize('[D]', 'green'));
        socket.emit('ansi-output', 'elete, ');
        socket.emit('ansi-output', AnsiUtil.colorize('[M]', 'green'));
        socket.emit('ansi-output', 'ove, ');
        socket.emit('ansi-output', AnsiUtil.colorize('[V]', 'green'));
        socket.emit('ansi-output', 'iew, ');
        socket.emit('ansi-output', AnsiUtil.colorize('[Q]', 'green'));
        socket.emit('ansi-output', 'uit, or ');
        socket.emit('ansi-output', AnsiUtil.colorize('[Enter]', 'green'));
        socket.emit('ansi-output', ' to skip? ');

        // Store context for action input
        session.tempData.fmContext = {
          step: 'get_action',
          dirFilePath,
          dirNum,
          entries,
          flagFileList,
          currentFile: entry,
          matchPos: i
        };
        session.subState = LoggedOnSubState.FM_ACTION_INPUT;

        // Return indication that we need user input
        return { stat: 'AWAITING_INPUT', nextMatchPos: i };
      }
    }

    // No more matches found
    return { stat: 'NOT_FOUND', nextMatchPos: entries.length };
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
    const action = input.trim().toUpperCase();
    const ctx = session.tempData.fmContext;
    const { currentFile, dirNum, dirFilePath, entries, flagFileList, matchPos } = ctx;

    socket.emit('ansi-output', '\r\n');

    // express.e:25013-25027 - Handle action
    if (action === 'D') {
      // Delete file
      await this.maintenanceFileDelete(socket, session, currentFile, dirNum);
    } else if (action === 'M') {
      // Move file
      await this.maintenanceFileMove(socket, session, currentFile, dirNum);
    } else if (action === 'V') {
      // View file
      await this.viewFile(socket, session, currentFile);
    } else if (action === 'Q') {
      // Quit
      socket.emit('ansi-output', '\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = {};
      return;
    } else if (action === '') {
      // Skip to next file
    }

    // express.e:25028-25030 - Ask if user wants to remove from flagged list
    if (session.tempData.fmUseFlagged && action !== '') {
      socket.emit('ansi-output', 'Remove from flagged list ');
      socket.emit('ansi-output', AnsiUtil.colorize('(Y/n)', 'green') + '? ');

      session.tempData.fmContext.step = 'ask_remove_flag';
      session.subState = LoggedOnSubState.FM_REMOVE_FLAG_INPUT;
      return;
    }

    // Continue searching from next position
    await this.continueSearch(socket, session, matchPos + 1);
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
    const ctx = session.tempData.fmContext;
    const { currentFile, matchPos } = ctx;

    socket.emit('ansi-output', '\r\n');

    if (response === 'Y' || response === 'YES' || response === '') {
      const flagManager = new FileFlagManager();
      flagManager.removeFlag(session, currentFile.filename);
      socket.emit('ansi-output', AnsiUtil.successLine(`Removed ${currentFile.filename} from flagged list`));
    }

    // Continue searching
    await this.continueSearch(socket, session, matchPos + 1);
  }

  /**
   * Continue searching from position
   */
  private static async continueSearch(
    socket: any,
    session: BBSSession,
    nextPos: number
  ): Promise<void> {
    const ctx = session.tempData.fmContext;
    const { dirFilePath, dirNum, entries, flagFileList } = ctx;

    const result = await this.maintenanceFileSearch(
      socket,
      session,
      dirFilePath,
      dirNum,
      entries,
      flagFileList,
      nextPos
    );

    if (result.stat === 'NOT_FOUND') {
      // Continue to next directory
      // This will be handled by scanDirectories loop
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = {};
    }
  }

  /**
   * Delete file from database and filesystem
   * express.e:22627+ (maintenanceFileDelete)
   */
  private static async maintenanceFileDelete(
    socket: any,
    session: BBSSession,
    file: any,
    dirNum: number
  ): Promise<void> {
    // Check permissions
    const userLevel = session.user?.secLevel || 0;
    if (userLevel < 200 && file.uploader?.toLowerCase() !== session.user?.username.toLowerCase()) {
      socket.emit('ansi-output', AnsiUtil.errorLine('You do not have permission to delete this file'));
      return;
    }

    // Confirm deletion
    socket.emit('ansi-output', AnsiUtil.colorize('Are you sure you want to delete this file', 'red'));
    socket.emit('ansi-output', ' (Y/n)? ');

    session.tempData.fmContext.step = 'confirm_delete';
    session.subState = LoggedOnSubState.FM_CONFIRM_DELETE;
  }

  /**
   * Move file to different directory
   * express.e:22780+ (maintenanceFileMove)
   */
  private static async maintenanceFileMove(
    socket: any,
    session: BBSSession,
    file: any,
    dirNum: number
  ): Promise<void> {
    // Check permissions
    const userLevel = session.user?.secLevel || 0;
    if (userLevel < 200) {
      socket.emit('ansi-output', AnsiUtil.errorLine('You do not have permission to move files'));
      return;
    }

    socket.emit('ansi-output', 'Enter destination directory number: ');

    session.tempData.fmContext.step = 'get_move_dest';
    session.subState = LoggedOnSubState.FM_MOVE_DEST_INPUT;
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
