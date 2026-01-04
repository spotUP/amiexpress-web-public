/**
 * File Listing Handler
 * Port from express.e:27626+ displayFileList() and related functions
 *
 * Handles file listing commands (F, FR, etc.)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import { Socket } from 'socket.io';
// Session type - using any for now since BBSSession is defined in index.ts
type Session = any;
import { LoggedOnSubState } from '../../constants/bbs-states';
import { displayScreen } from '../screen.handler';
import { readDirFile, getDirFilePath, getHoldDirFilePath, DirFileEntry } from '../../utils/dir-file-reader.util';
import { parseDirSpan, getDirSpanPrompt, getDirDisplayName, DirSpan } from '../../utils/dir-span.util';
import { FileFlagManager } from '../../utils/file-flag.util';
import { ParamsUtil } from '../../utils/params.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { config } from '../../config';
import { getConferenceDir } from '../../utils/file-hold.util';
import { flagPause, initPauseState, setNonStopMode } from '../../utils/flag-pause.util';
import { getMaxDirs, getDirFiles, DirFileInfo } from '../../utils/max-dirs.util';

/**
 * Display file list for a conference
 * Port from express.e:27626+ displayFileList()
 */
export class FileListingHandler {
  /**
   * Display file listing (F command)
   * Port from express.e:27626+ displayFileList()
   */
  static async handleFileList(
    socket: Socket,
    session: Session,
    params: string,
    reverse: boolean = false
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');

    socket.emit('ansi-output', '\r\n');

    // Check if conference has file areas
    const maxDirs = await getMaxDirs(session.currentConf, bbsDataPath);
    if (maxDirs === 0) {
      socket.emit('ansi-output', '\x1b[31mSorry, No file areas available.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Parse parameters
    const parsedParams = ParamsUtil.parse(params);
    const hasNonStop = ParamsUtil.hasFlag(parsedParams, 'NS');

    // Determine which directories to scan
    let dirSpan: DirSpan;

    if (parsedParams.length > 0) {
      // User specified directory in params
      dirSpan = parseDirSpan(parsedParams[0], maxDirs, this.canAccessHold(session));
    } else {
      // Default to entire conference directories when no params provided
      dirSpan = {
        startDir: 1,
        endDir: maxDirs,
        success: true
      };
    }

    // Check if directory parse was successful
    if (!dirSpan.success) {
      if (dirSpan.error) {
        socket.emit('ansi-output', `\x1b[31m${dirSpan.error}\x1b[0m\r\n`);
      }
      socket.emit('ansi-output', '\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Display file list
    await this.displayFileListForDirSpan(
      socket,
      session,
      dirSpan,
      reverse,
      hasNonStop,
      maxDirs
    );

    // Always return to menu after listing
    (session as any).flagPauseHandler = undefined;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Continue file list after directory input
   */
  static async handleFileListDirInput(
    socket: Socket,
    session: Session,
    input: string
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');
    const maxDirs = await getMaxDirs(session.currentConf, bbsDataPath);

    // Add line break after directory input
    socket.emit('ansi-output', '\r\n');

    // Parse directory span
    const dirSpan = parseDirSpan(input, maxDirs, this.canAccessHold(session));

    if (!dirSpan.success) {
      if (dirSpan.error) {
        socket.emit('ansi-output', `\r\n\x1b[31m${dirSpan.error}\x1b[0m\r\n`);
      }
      socket.emit('ansi-output', '\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const { reverse, hasNonStop } = session.tempData.fileListParams || {};

    await this.displayFileListForDirSpan(
      socket,
      session,
      dirSpan,
      reverse || false,
      hasNonStop || false,
      maxDirs
    );

    // Always return to menu after listing
    (session as any).flagPauseHandler = undefined;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Display file list for a directory span
   * Port from express.e:27626+ displayFileList() main loop
   */
  private static async displayFileListForDirSpan(
    socket: Socket,
    session: Session,
    dirSpan: DirSpan,
    reverse: boolean,
    hasNonStop: boolean,
    maxDirs: number
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');
    const conferencePath = getConferenceDir(session.currentConf, bbsDataPath);

    // Initialize pause state (express.e:27633-27634)
    initPauseState(session);
    if (hasNonStop) {
      setNonStopMode(session, true);
    }
    session.menuPause = false;

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.headerBox('FILE LISTING'));

    // Get list of DIR files (express.e: numbered DIR1, DIR2, etc. only)
    const allDirFiles = await getDirFiles(session.currentConf, bbsDataPath);

    // Filter to the requested range (1-indexed)
    let dirsToShow = allDirFiles.filter(df =>
      df.index >= dirSpan.startDir && df.index <= dirSpan.endDir
    );

    // Handle HOLD directory if requested
    if (dirSpan.startDir === -1 || dirSpan.endDir === -1) {
      const holdPath = getHoldDirFilePath(conferencePath);
      dirsToShow.unshift({
        index: -1,
        name: 'HOLD',
        path: holdPath,
        filename: 'HELD'
      });
    }

    // Reverse if needed
    if (reverse) {
      dirsToShow = dirsToShow.reverse();
    }

    // Loop through directories
    for (const dirInfo of dirsToShow) {
      const dirFilePath = dirInfo.path;
      // Express.e:27667-27669 - Show directory number, or "HOLD" for hold directory
      const dirDisplayName = dirInfo.index === -1 ? 'HOLD' : String(dirInfo.index);

      // Display scanning message (express.e:27667-27669, 27683-27684)
      if (reverse) {
        socket.emit('ansi-output', `Reverse scanning directory ${dirDisplayName}\r\n`);
      } else {
        socket.emit('ansi-output', `Scanning directory ${dirDisplayName}\r\n`);
      }

      // Check for pause before listing (express.e:28025+)
      const shouldContinue = await flagPause(socket, session, 1);
      if (!shouldContinue) {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      // Read and display DIR file
      let entries: DirFileEntry[];
      try {
        entries = await readDirFile(dirFilePath);
      } catch (error: any) {
        // Log error but continue to next directory instead of failing completely
console.log(`[FileList] Could not read ${dirFilePath}: ${error.message}`);
        socket.emit('ansi-output', `\x1b[33mCould not read directory ${dirDisplayName}\x1b[0m\r\n`);
        continue;
      }

      if (entries.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo files in this directory.\x1b[0m\r\n');
        const shouldContinue2 = await flagPause(socket, session, 1);
        if (!shouldContinue2) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      } else {
        // Display entries (sort by date when reverse, newest first)
        // For FR command (reverse=true), sort by uploadDate descending (newest first)
        // For F command (reverse=false), keep original order (oldest first)
        let displayEntries = entries;
        if (reverse) {
          // Sort by upload date descending (newest first)
          displayEntries = [...entries].sort((a, b) => {
            const dateA = a.uploadDate?.getTime() || 0;
            const dateB = b.uploadDate?.getTime() || 0;
            return dateB - dateA;  // Descending order (newest first)
          });
        }

        for (const entry of displayEntries) {
          const displayLines = this.getDisplayLines(entry);

          // Display file entry and allow the pause handler to decide when to stop
          const shouldContinueEntry = await this.displayFileEntry(socket, session, displayLines);
          if (!shouldContinueEntry) {
            session.subState = LoggedOnSubState.DISPLAY_MENU;
            return;
          }
        }
      }

      // Pause after directory listing (no extra blank line - flagPause adds one)
      const shouldContinue4 = await flagPause(socket, session, 1);
      if (!shouldContinue4) {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }
    }

    // Return to menu prompt (single redraw handled centrally)
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Display a single file entry
   * Port from express.e:27626+ displayIt2()
   */
  private static getDisplayLines(entry: DirFileEntry): string[] {
    const isContinuationLine = (line: string) =>
      line.length >= 33 && line.substring(0, 33).trim().length === 0;

    return entry.rawLines.filter((line, index) => {
      if (index === 0) {
        return true;
      }
      if (!isContinuationLine(line)) {
        return true;
      }
      const content = line.substring(33);
      return content.trim().length > 0;
    });
  }

  private static async displayFileEntry(
    socket: Socket,
    session: Session,
    lines: string[]
  ): Promise<boolean> {
    for (const line of lines) {
      socket.emit('ansi-output', line + '\r\n');
      const shouldContinue = await flagPause(socket, session, 1);
      if (!shouldContinue) {
        return false;
      }
    }
    return true;
  }

  /**
   * Handle failures reading a DIR file (missing or unreadable)
   */
  private static handleDirFileReadError(
    socket: Socket,
    session: Session,
    dirDisplayName: string,
    error: any
  ): void {
console.error(`[FileListing] Failed to read ${dirDisplayName} directory file:`, error);
    const sysopName = config.get('sysopName') || 'Sysop';
    socket.emit(
      `\x1b[31mThere is a problem with File listings, please tell ${sysopName}\x1b[0m\r\n`
    );
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }


  /**
   * Check if user can access HOLD directory
   * Port from express.e:346 (default level 201) and lines 26863, 26896 (dual check with OR logic)
   */
  private static canAccessHold(session: Session): boolean {
    if (!session.user) return false;

    // express.e:340-350 - Read HOLD_ACCESS_LEVEL from bbsConfig.info if present, default to 201
    const { loadBBSConfig } = require('../../services/bbs-config-file.service');
    const bbsRoot = require('../../config').config.get('bbsRoot') || process.cwd();
    const bbsConfig = loadBBSConfig(bbsRoot);
    const holdAccessLevel = bbsConfig.hold_access_level ?? 201; // Default from express.e:346

    // express.e:26863,26896 - Dual check with OR logic:
    // IF (loggedOnUser.secStatus>=holdAccessLevel) OR (checkSecurity(ACS_HOLD_ACCESS))
    const { checkSecurity } = require('../../utils/acs.util');
    const { ACSPermission } = require('../../constants/acs-permissions');

    return (
      session.user.secLevel >= holdAccessLevel ||
      checkSecurity(session.user, ACSPermission.HOLD_ACCESS)
    );
  }
}
