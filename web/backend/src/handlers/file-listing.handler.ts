/**
 * File Listing Handler
 * Port from express.e:27626+ displayFileList() and related functions
 *
 * Handles file listing commands (F, FR, etc.)
 */

import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import { Socket } from 'socket.io';
// Session type - using any for now since BBSSession is defined in index.ts
type Session = any;
import { LoggedOnSubState } from '../constants/bbs-states';
import { displayScreen } from './screen.handler';
import { readDirFile, getDirFilePath, getHoldDirFilePath, DirFileEntry } from '../utils/dir-file-reader.util';
import { parseDirSpan, getDirSpanPrompt, getDirDisplayName, DirSpan } from '../utils/dir-span.util';
import { FileFlagManager } from '../utils/file-flag.util';
import { ParamsUtil } from '../utils/params.util';
import { AnsiUtil } from '../utils/ansi.util';
import { config } from '../config';
import { getConferenceDir } from '../utils/file-hold.util';
import { flagPause, initPauseState, setNonStopMode } from '../utils/flag-pause.util';
import { getMaxDirs } from '../utils/max-dirs.util';

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

    // Determine loop direction
    let currentDir: number;
    if (reverse) {
      currentDir = dirSpan.endDir;
    } else {
      currentDir = dirSpan.startDir;
    }

    // Loop through directories
    while (
      (reverse && currentDir >= dirSpan.startDir) ||
      (!reverse && currentDir <= dirSpan.endDir)
    ) {
      // Get DIR file path
      let dirFilePath: string;
      let dirDisplayName: string;

      if (currentDir === -1) {
        // HOLD directory
        dirFilePath = getHoldDirFilePath(conferencePath);
        dirDisplayName = 'HOLD';
      } else {
        // Normal directory
        dirFilePath = getDirFilePath(conferencePath, currentDir);
        dirDisplayName = getDirDisplayName(currentDir, maxDirs);
      }

      // Display scanning message
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
        this.handleDirFileReadError(socket, session, dirDisplayName, error);
        return;
      }

      if (entries.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo files in this directory.\x1b[0m\r\n');
        const shouldContinue2 = await flagPause(socket, session, 1);
        if (!shouldContinue2) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      } else {
        // Display entries (reverse if needed)
        const displayEntries = reverse ? entries.reverse() : entries;

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

      socket.emit('ansi-output', '\r\n');
      const shouldContinue4 = await flagPause(socket, session, 1);
      if (!shouldContinue4) {
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      // Move to next directory
      if (reverse) {
        currentDir--;
      } else {
        currentDir++;
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
   */
  private static canAccessHold(session: Session): boolean {
    // TODO: Check user security level / permissions
    // For now, sysop only (level 255)
    return session.user?.secLevel >= 255;
  }
}
