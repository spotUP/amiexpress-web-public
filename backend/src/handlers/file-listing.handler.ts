/**
 * File Listing Handler
 * Port from express.e:27626+ displayFileList() and related functions
 *
 * Handles file listing commands (F, FR, etc.)
 */

import * as path from 'path';
import * as fs from 'fs';
import { Socket } from 'socket.io';
import { Session } from '../types/session.types';
import { LoggedOnSubState } from '../constants/bbs-states';
import { readDirFile, getDirFilePath, getHoldDirFilePath, DirFileEntry } from '../utils/dir-file-reader.util';
import { parseDirSpan, getDirSpanPrompt, getDirDisplayName, DirSpan } from '../utils/dir-span.util';
import { FileFlagManager } from '../utils/file-flag.util';
import { ParamsUtil } from '../utils/params.util';

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
    const config = (global as any).config;
    const bbsDataPath = config.get('dataDir');

    socket.emit('ansi-output', '\r\n');

    // Check if conference has file areas
    const maxDirs = await this.getMaxDirs(session.currentConf, bbsDataPath);
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
      // Prompt user for directory
      // TODO: Display FILEHELP screen if available
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
    const config = (global as any).config;
    const bbsDataPath = config.get('dataDir');
    const maxDirs = await this.getMaxDirs(session.currentConf, bbsDataPath);

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
    const config = (global as any).config;
    const bbsDataPath = config.get('dataDir');
    const conferencePath = path.join(bbsDataPath, `Conf${String(session.currentConf).padStart(2, '0')}`);

    let lineCount = 0;
    const userLineLen = session.user?.pageLength || 23;

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

      // Check for pause before listing
      if (!hasNonStop && lineCount >= userLineLen) {
        // TODO: Implement flagPause
        lineCount = 0;
      }

      // Read and display DIR file
      const entries = await readDirFile(dirFilePath);

      if (entries.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo files in this directory.\x1b[0m\r\n');
        lineCount++;
      } else {
        // Display entries (reverse if needed)
        const displayEntries = reverse ? entries.reverse() : entries;

        for (const entry of displayEntries) {
          // Display file entry
          await this.displayFileEntry(socket, session, entry, hasNonStop);
          lineCount += entry.rawLines.length;

          // Check for pause
          if (!hasNonStop && lineCount >= userLineLen) {
            // TODO: Implement flagPause with flag support
            lineCount = 0;
          }
        }
      }

      socket.emit('ansi-output', '\r\n');
      lineCount++;

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
   * Get maximum directory number for a conference
   */
  private static async getMaxDirs(confNum: number, bbsDataPath: string): Promise<number> {
    // TODO: Read from conference config or scan for DIR files
    // For now, return a default value
    const conferencePath = path.join(bbsDataPath, `Conf${String(confNum).padStart(2, '0')}`);

    // Scan for DIR files (DIR1, DIR2, DIR3, ...)
    let maxDirs = 0;
    for (let i = 1; i <= 20; i++) {
      const dirPath = getDirFilePath(conferencePath, i);
      if (fs.existsSync(dirPath)) {
        maxDirs = i;
      } else {
        break;
      }
    }

    return maxDirs;
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
