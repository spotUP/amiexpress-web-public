/**
 * Zippy Text Search Handler
 * Port from express.e:26123 (internalCommandZ)
 * Port from express.e:27529 (zippy function)
 *
 * Searches file descriptions in DIR files for matching text
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { isNewFileEntry } from '../utils/dir-file-reader.util';

/**
 * Zippy Search Handler
 * Full-text search across file descriptions
 */
export class ZippySearchHandler {
  /**
   * Handle Z command - Zippy Text Search
   * Port from express.e:26123-26213 (internalCommandZ)
   */
  static async handleZippySearchCommand(
    socket: Socket,
    session: BBSSession,
    params: string = ''
  ): Promise<void> {
    // Check security - express.e:26130
    if (!checkSecurity(session.user, ACSPermission.ZIPPY_TEXT_SEARCH)) {
      socket.emit('ansi-output', '\x1b[31mPermission denied.\x1b[0m\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // setEnvStat(ENV_FILES) - express.e:26132
    console.log('[ENV] Files');

    // express.e:26137-26140
    socket.emit('ansi-output', '\r\n');

    // Check if conference has files - express.e:26141-26144
    // maxDirs check - for now assume conferences have files
    // TODO: Implement maxDirs checking

    // Parse parameters - express.e:26146
    const paramParts = params.trim().split(/\s+/);
    const hasNonStop = paramParts.filter(p => p.toUpperCase() === 'NS').length > 0;
    const nonNsParams = paramParts.filter(p => p.toUpperCase() !== 'NS');

    // Get search string from params or prompt - express.e:26148-26157
    let searchString = '';

    if (nonNsParams.length > 0) {
      searchString = nonNsParams[0];
    } else {
      // No search string provided - prompt user
      socket.emit('ansi-output', '\x1b[36mEnter string to search for: \x1b[0m');
      session.subState = LoggedOnSubState.ZIPPY_SEARCH_INPUT;
      session.tempData = {
        waitingForZippySearch: true,
        nonStopDisplay: hasNonStop,
        dirSpanParam: nonNsParams[1] || ''
      };
      return;
    }

    // Perform search
    await this.performSearch(socket, session, searchString, nonNsParams[1] || '', hasNonStop);
  }

  /**
   * Handle search string input continuation
   */
  static async handleSearchInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (session.tempData?.waitingForZippySearch) {
      session.tempData.waitingForZippySearch = false;
      const nonStop = session.tempData.nonStopDisplay || false;
      const dirSpanParam = session.tempData.dirSpanParam || '';

      socket.emit('ansi-output', '\r\n');

      if (!input.trim()) {
        // Empty input - cancel - express.e:26154-26156
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      // Perform the search
      await this.performSearch(socket, session, input.trim(), dirSpanParam, nonStop);
    }
  }

  /**
   * Perform the search
   * Port from express.e:26159-26209
   */
  private static async performSearch(
    socket: Socket,
    session: BBSSession,
    searchString: string,
    dirSpanParam: string,
    nonStop: boolean
  ): Promise<void> {
    const config = (global as any).config;

    // UpperStr(ss) - express.e:26159
    const searchUpper = searchString.toUpperCase();

    // getDirSpan - express.e:26161-26168
    const { getDirSpanPrompt } = require('../utils/dir-span.util');

    // For now, default to upload directory (U) if not specified
    // In full implementation, would call getDirSpan() for interactive selection
    const dirSpan = dirSpanParam || 'U';

    // Determine directory range
    let startDir = 1;
    let endDir = 1;

    if (dirSpan.toUpperCase() === 'A') {
      // All directories
      startDir = 1;
      endDir = 20; // maxDirs
    } else if (dirSpan.toUpperCase() === 'U') {
      // Upload directory (last directory)
      startDir = 20; // maxDirs
      endDir = 20;
    } else if (dirSpan.toUpperCase() === 'H') {
      // HOLD directory - special case (-1)
      startDir = -1;
      endDir = -1;
    } else if (!isNaN(parseInt(dirSpan))) {
      // Specific directory number
      startDir = parseInt(dirSpan);
      endDir = parseInt(dirSpan);
    }

    socket.emit('ansi-output', '\r\n');

    // Loop through directories - express.e:26180-26207
    if (searchString.length > 0) {
      for (let dirNum = startDir; dirNum <= endDir; dirNum++) {
        const confPath = path.join(config.get('dataDir'), 'BBS', `Conf${String(session.currentConf || 1).padStart(2, '0')}`);

        let dirFilePath: string;

        if (dirNum === -1) {
          // HOLD directory - express.e:26200-26202
          dirFilePath = path.join(confPath, 'hold', 'held');
          socket.emit('ansi-output', '\x1b[32mScanning directory HOLD\x1b[0m\r\n');
        } else {
          // Regular directory - express.e:26188-26198
          dirFilePath = path.join(confPath, `DIR${dirNum}`);
          socket.emit('ansi-output', `\x1b[32mScanning directory ${dirNum}\x1b[0m\r\n`);
        }

        // Call zippy() - express.e:26203
        const stat = await this.zippy(socket, dirFilePath, searchUpper, nonStop);

        if (stat < 0) {
          socket.emit('ansi-output', '\r\n');
          session.subState = LoggedOnSubState.DISPLAY_MENU;
          return;
        }
      }
    }

    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }

  /**
   * Zippy search function
   * Port from express.e:27529-27625 (zippy)
   *
   * Searches a DIR file for entries matching the search string
   */
  private static async zippy(
    socket: Socket,
    dirFilePath: string,
    searchString: string,
    nonStop: boolean
  ): Promise<number> {
    // Check if DIR file exists - express.e:27546-27550
    if (!fs.existsSync(dirFilePath)) {
      return 0; // RESULT_SUCCESS
    }

    try {
      const fileStream = fs.createReadStream(dirFilePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      let currentEntry: string[] = [];
      let found = false;
      let lineNum = 1;

      // Read file line by line - express.e:27552-27620
      for await (const line of rl) {
        // Check for break (Ctrl-C) - express.e:27553-27567
        // TODO: Implement pause/break checking

        const trimmedLine = line.trim();

        // Check if this is a new file entry - express.e:27569
        if (isNewFileEntry(trimmedLine)) {
          // If previous entry had a match, display it - express.e:27574-27586
          if (found && currentEntry.length > 0) {
            for (const entryLine of currentEntry) {
              socket.emit('ansi-output', entryLine + '\r\n');
            }
            // TODO: Implement pause functionality - express.e:27583-27585
          }

          // Reset for new entry - express.e:27589-27592
          found = false;
          lineNum = 1;
          currentEntry = [];
        }

        // Store the line - express.e:27593-27595
        if (lineNum < 100) {
          currentEntry.push(line);
        }

        // Check if line contains search string - express.e:27596-27597
        const lineUpper = line.toUpperCase();
        if (lineUpper.includes(searchString)) {
          found = true;
        }

        lineNum++;
      }

      // Display last entry if it matched - express.e:27599-27619
      if (found && currentEntry.length > 0) {
        for (const entryLine of currentEntry) {
          socket.emit('ansi-output', entryLine + '\r\n');
        }
      }

      return 0; // RESULT_SUCCESS

    } catch (error) {
      console.error('[ZIPPY SEARCH] Error reading DIR file:', error);
      return 0; // RESULT_SUCCESS
    }
  }
}
