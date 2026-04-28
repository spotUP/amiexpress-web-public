/**
 * Zippy Text Search Handler
 * Port from express.e:26123 (internalCommandZ)
 * Port from express.e:27529 (zippy function)
 *
 * Searches file descriptions in DIR files for matching text
 */

import { Socket } from 'socket.io';
import { config } from '../../config';
import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { isNewFileEntry } from '../../utils/dir-file-reader.util';
import { flagPause, initPauseState, setNonStopMode } from '../../utils/flag-pause.util';
import { getMaxDirs } from '../../utils/max-dirs.util';
import { getConferenceDir } from '../../utils/file-hold.util';

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

    // express.e:26134-26135
    // lineCount:=0; nonStopDisplayFlag:=FALSE (handled in performSearch)

    // express.e:26137 - aePuts('\b\n')
    socket.emit('ansi-output', '\r\n');

    // Check if conference has files - express.e:26138-26141
    const maxDirs = await getMaxDirs(session.currentConf || 1, config.get('dataDir'));
    if (maxDirs === 0) {
      // express.e:26139 - myError(5)
      socket.emit('ansi-output', 'No files available in this conference.\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // parseParams(params) - express.e:26143
    const paramParts = params.trim().split(/\s+/).filter(p => p.length > 0);
    const hasNonStop = paramParts.some(p => p.toUpperCase() === 'NS');
    const nonNsParams = paramParts.filter(p => p.toUpperCase() !== 'NS');

    // express.e:26145-26148: IF parsedParams.count()>0 THEN StrCopy(ss,parsedParams.item(0)); JUMP zSkip1
    if (nonNsParams.length > 0) {
      const searchString = nonNsParams[0];
      // zSkip1: UpperStr(ss) - express.e:26160
      const searchUpper = searchString.toUpperCase();

      // express.e:26162-26168: IF parsedParams.count()>1 THEN getDirSpan(param[1]) ELSE getDirSpan('')
      if (nonNsParams.length > 1) {
        // Dir span passed as second param - parse directly, no prompt
        await this.performSearch(socket, session, searchUpper, nonNsParams[1], hasNonStop, maxDirs);
      } else {
        // No dir param - must prompt user with getDirSpan (express.e:26165)
        await ZippySearchHandler._promptDirSpan(socket, session, searchUpper, hasNonStop, maxDirs);
      }
      return;
    }

    // No search string - prompt user - express.e:26150-26157
    // aePuts('Enter string to search for: ')
    socket.emit('ansi-output', 'Enter string to search for: ');
    session.subState = LoggedOnSubState.ZIPPY_SEARCH_INPUT;
    session.tempData = {
      waitingForZippySearch: true,
      nonStopDisplay: hasNonStop,
      maxDirs,
    };
  }

  /**
   * Handle search string input continuation (express.e:26150-26157)
   */
  static async handleSearchInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (!session.tempData?.waitingForZippySearch) return;

    // express.e:26154 - aePuts('\b\n')
    socket.emit('ansi-output', '\r\n');

    if (!input.trim()) {
      // Empty input - cancel - express.e:26155-26157 IF(StrLen(ss)=0) RETURN RESULT_SUCCESS
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // express.e:26159-26160: zSkip1: UpperStr(ss)
    const searchUpper = input.trim().toUpperCase();
    const nonStop = session.tempData.nonStopDisplay || false;
    const maxDirs = session.tempData.maxDirs || await getMaxDirs(session.currentConf || 1, config.get('dataDir'));

    session.tempData.waitingForZippySearch = false;

    // express.e:26162-26166: no params.count()>1, so call getDirSpan('') - prompts the user
    await ZippySearchHandler._promptDirSpan(socket, session, searchUpper, nonStop, maxDirs);
  }

  /**
   * Show getDirSpan prompt and wait for directory selection (express.e:26857-26912)
   * Called after search string is known but before search begins.
   */
  private static async _promptDirSpan(
    socket: Socket,
    session: BBSSession,
    searchString: string,
    nonStop: boolean,
    maxDirs: number
  ): Promise<void> {
    const { getDirSpanPrompt } = require('../../utils/dir-span.util');
    const { checkSecurity: cs } = require('../../utils/acs.util');
    const { ACSPermission: ACSP } = require('../../constants/acs-permissions');
    const hasHoldAccess = cs(session.user, ACSP.HOLD_ACCESS);

    // express.e:26862-26868 - aePuts(dirSpanPrompt)
    socket.emit('ansi-output', getDirSpanPrompt(maxDirs, hasHoldAccess));

    session.subState = LoggedOnSubState.ZIPPY_DIR_SPAN_INPUT;
    session.tempData = {
      zippySearchString: searchString,
      zippyNonStop: nonStop,
      zippyMaxDirs: maxDirs,
    };
  }

  /**
   * Handle directory span input for Z command (express.e:26869-26912)
   * Called when user responds to getDirSpan prompt.
   */
  static async handleDirSpanInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    const searchString = session.tempData?.zippySearchString || '';
    const nonStop = session.tempData?.zippyNonStop || false;
    const maxDirs = session.tempData?.zippyMaxDirs || 1;

    // express.e:26871-26873: IF(StrLen(str)=0) RETURN RESULT_FAILURE (user pressed Enter = cancel)
    if (!input.trim()) {
      socket.emit('ansi-output', '\r\n');
      // stat=RESULT_FAILURE -> express.e:26168 RETURN RESULT_SUCCESS (exits command cleanly)
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    socket.emit('ansi-output', '\r\n');

    await this.performSearch(socket, session, searchString, input.trim(), nonStop, maxDirs);
  }

  /**
   * Perform the search
   * Port from express.e:26170-26213 (after getDirSpan returns)
   *
   * @param searchString - Already uppercased search string (express.e:26160 UpperStr done)
   * @param dirSpanParam - Directory selection string as typed by user (A/U/H/number)
   */
  private static async performSearch(
    socket: Socket,
    session: BBSSession,
    searchString: string,
    dirSpanParam: string,
    nonStop: boolean,
    maxDirs: number = 1
  ): Promise<void> {

    // Initialize pause state
    initPauseState(session);
    if (nonStop) {
      // nonStopDisplayFlag:=paramsContains('NS') - express.e:26170
      setNonStopMode(session, true);
    }

    // searchString is already uppercased by callers (express.e:26160 UpperStr applied before performSearch)

    // Parse dirSpanParam into startDir/endDir using parseDirSpan util
    // Mirrors getDirSpan() logic - express.e:26880-26910
    const { parseDirSpan } = require('../../utils/dir-span.util');
    const { checkSecurity: cs } = require('../../utils/acs.util');
    const { ACSPermission: ACSP } = require('../../constants/acs-permissions');
    const hasHoldAccess = cs(session.user, ACSP.HOLD_ACCESS);

    const span = parseDirSpan(dirSpanParam, maxDirs, hasHoldAccess);
    if (!span.success) {
      socket.emit('ansi-output', `\r\nNo such directory.\r\n\r\n`);
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const startDir = span.startDir;
    const endDir = span.endDir;

    socket.emit('ansi-output', '\r\n');

    // Loop through directories - express.e:26180-26207
    if (searchString.length > 0) {
      for (let dirNum = startDir; dirNum <= endDir; dirNum++) {
        const confPath = getConferenceDir(session.currentConf || 1, config.get('dataDir'));

        let dirFilePath: string;

        if (dirNum === -1) {
          // HOLD directory - express.e:26200-26202
          dirFilePath = path.join(confPath, 'hold', 'held');
          socket.emit('ansi-output', 'Scanning directory HOLD\r\n');
        } else {
          // Regular directory - express.e:26188-26198
          dirFilePath = path.join(confPath, `DIR${dirNum}`);
          socket.emit('ansi-output', `Scanning directory ${dirNum}\r\n`);
        }

        // Call zippy() - express.e:26203
        const stat = await this.zippy(socket, session, dirFilePath, searchString, nonStop);

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
    session: BBSSession,
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
        const trimmedLine = line.trim();

        // Check if this is a new file entry - express.e:27569
        if (isNewFileEntry(trimmedLine)) {
          // If previous entry had a match, display it - express.e:27574-27586
          if (found && currentEntry.length > 0) {
            for (const entryLine of currentEntry) {
              socket.emit('ansi-output', entryLine + '\r\n');
            }

            // Check for pause - express.e:27583-27585
            const shouldContinue = await flagPause(socket, session, currentEntry.length);
            if (!shouldContinue) {
              rl.close();
              return -1; // RESULT_FAILURE
            }
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
