/**
 * File Listing Handler
 * Port from express.e:27626+ displayFileList() and related functions
 *
 * Handles file listing commands (F, FR, etc.)
 */

import * as path from 'path';
import * as fs from 'fs';
import { Socket } from 'socket.io';
// Session type - using any for now since BBSSession is defined in index.ts
type Session = any;
import { LoggedOnSubState } from '../constants/bbs-states';
import { readDirFile, getDirFilePath, getHoldDirFilePath, DirFileEntry } from '../utils/dir-file-reader.util';
import { parseDirSpan, getDirSpanPrompt, getDirDisplayName, DirSpan } from '../utils/dir-span.util';
import { FileFlagManager } from '../utils/file-flag.util';
import { ParamsUtil } from '../utils/params.util';
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
      // Prompt user for directory (express.e:27646-27647)
      // Display FILEHELP screen if available
      await displayScreen(socket, session, 'FILEHELP', false); // Don't pause for file help

      const prompt = getDirSpanPrompt(maxDirs, this.canAccessHold(session));
      socket.emit('ansi-output', prompt);

      // Set state to wait for directory input
      session.subState = LoggedOnSubState.FILE_LIST_DIR_INPUT;
      session.tempData.fileListParams = {
        reverse,
        hasNonStop
      };
      return;
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
      const entries = await readDirFile(dirFilePath);

      if (entries.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo files in this directory.\x1b[0m\r\n');
        const shouldContinue = await flagPause(socket, session, 1);
        if (!shouldContinue) {
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      } else {
        // Display entries (reverse if needed)
        const displayEntries = reverse ? entries.reverse() : entries;

        for (const entry of displayEntries) {
          // Display file entry
          await this.displayFileEntry(socket, session, entry, hasNonStop);

          // Check for pause after each entry (express.e:27613)
          const shouldContinue = await flagPause(socket, session, entry.rawLines.length);
          if (!shouldContinue) {
            session.subState = LoggedOnSubState.DISPLAY_MENU;
            return;
          }
        }
      }

      socket.emit('ansi-output', '\r\n');
      const shouldContinue = await flagPause(socket, session, 1);
      if (!shouldContinue) {
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

    // Return to menu
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Display a single file entry
   * Port from express.e:27626+ displayIt2()
   */
  private static async displayFileEntry(
    socket: Socket,
    session: Session,
    entry: DirFileEntry,
    hasNonStop: boolean
  ): Promise<void> {
    // Display all raw lines for the entry
    for (const line of entry.rawLines) {
      socket.emit('ansi-output', line + '\r\n');
    }
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
