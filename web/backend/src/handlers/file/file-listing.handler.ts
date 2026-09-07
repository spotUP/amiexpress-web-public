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
import { flagPause, checkForPause, initPauseState, setNonStopMode } from '../../utils/flag-pause.util';
import { getMaxDirs, getDirFiles, DirFileInfo } from '../../utils/max-dirs.util';
import { dirEntryRows } from '../../utils/table-format.util';

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
console.log(`[FileList] handleFileList: currentConf=${session.currentConf} relConfNum=${session.relConfNum} maxDirs=${maxDirs} reverse=${reverse} params="${params}"`);
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

    // express.e:27626-27636 displayFileList - just newline, no header
    socket.emit('ansi-output', '\r\n');

    // Get list of DIR files (express.e: numbered DIR1, DIR2, etc. only)
    const allDirFiles = await getDirFiles(session.currentConf, bbsDataPath);
console.log(`[FileList] getDirFiles returned ${allDirFiles.length} dirs for conf=${session.currentConf} path=${conferencePath}`);
console.log(`[FileList] dirSpan=${JSON.stringify(dirSpan)}`);

    // Filter to the requested range (1-indexed)
    let dirsToShow = allDirFiles.filter(df =>
      df.index >= dirSpan.startDir && df.index <= dirSpan.endDir
    );
console.log(`[FileList] dirsToShow after filter: ${dirsToShow.length} dirs`);

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
          // The entry's own rows, then laid out for THIS caller's screen.
          // At >= 80 columns `dirEntryRows` hands the same array straight
          // back, so the express.e bytes are the same strings; below 80 the
          // DIR file's 33-column indent is removed and each description row
          // is CROPPED if it is art and WRAPPED if it is prose, instead of
          // being folded by the C64 terminal (sysop, 2026-09-06: "fr seems
          // to overflow in 40 cols?"). See utils/table-format.util.ts.
          const displayLines = dirEntryRows(session, this.getDisplayLines(entry));

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

  /**
   * The `N` scan - express.e:27906-28023 internalCommandNewFiles().
   *
   * WHY IT LIVES HERE AND NOT IN file.handler.ts: `N` answers the same
   * question `F` does - "what is in this conference's DIR files" - and it used
   * to answer it from somewhere else entirely. It read the SQL `file_entries`
   * mirror, which is written only when a file is uploaded THROUGH THE WEB; no
   * importer ever reads the DIR files into it. Measured on the live board
   * (2026-09-07): conference 1's two areas hold 0 rows between them while the
   * DIR files on disk carry records. So `N` told a caller "no new files" for a
   * conference that is full, and `F` listed them a keystroke later.
   *
   * Uploads write BOTH the row and the DIR entry (see file-socket-handlers,
   * "Write to DIR file"), so reading the disk loses nothing the mirror had.
   *
   * express.e's rule, and it is not "filter the entries by date": a DIR file
   * is chronological, so it finds the FIRST entry at or after the date and
   * then dumps THE REST OF THE FILE (`displayIt2(fp1)`, express.e:28007),
   * descriptions and all. Filtering entry by entry would drop a file whose
   * date column is malformed but which is newer than the one above it.
   */
  static async handleNewFileScan(
    socket: Socket,
    session: Session,
    searchDate: Date,
    hasNonStop: boolean
  ): Promise<void> {
    const bbsDataPath = config.get('dataDir');

    initPauseState(session);
    if (hasNonStop) {
      setNonStopMode(session, true);
    }
    session.menuPause = false;

    const dirFiles = await getDirFiles(session.currentConf, bbsDataPath);
    if (dirFiles.length === 0) {
      socket.emit('ansi-output', '\r\nNo Files are available.\r\n\r\n');
      session.menuPause = true;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e compares y/m/d, not timestamps: a file uploaded earlier on the
    // search date is still new.
    const isAtOrAfter = (entry: DirFileEntry): boolean => {
      const d = entry.uploadDate;
      if (!d || Number.isNaN(d.getTime())) return false;
      if (d.getFullYear() !== searchDate.getFullYear()) {
        return d.getFullYear() > searchDate.getFullYear();
      }
      if (d.getMonth() !== searchDate.getMonth()) {
        return d.getMonth() > searchDate.getMonth();
      }
      return d.getDate() >= searchDate.getDate();
    };

    for (const dirInfo of dirFiles) {
      socket.emit('ansi-output', `Scanning directory ${dirInfo.index}\r\n`);

      // express.e:27934-27938 - checkForPause during confScan, flagPause otherwise.
      const beforeDir = session.newFilesPauseFlag
        ? await checkForPause(socket, session)
        : await flagPause(socket, session, 1);
      if (!beforeDir) {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      let entries: DirFileEntry[];
      try {
        entries = await readDirFile(dirInfo.path);
      } catch (error: any) {
console.log(`[NewFiles] Could not read ${dirInfo.path}: ${error.message}`);
        continue;
      }

      const first = entries.findIndex(isAtOrAfter);
      if (first < 0) continue;

      for (const entry of entries.slice(first)) {
        const displayLines = dirEntryRows(session, this.getDisplayLines(entry));
        const shouldContinue = await this.displayFileEntry(socket, session, displayLines);
        if (!shouldContinue) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      }
    }

    socket.emit('ansi-output', '\r\n');
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
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
