/**
 * View File Handler
 * Port from express.e:25675 (internalCommandV)
 * Port from express.e:20388 (viewAFile)
 *
 * Handles file viewing (text files only)
 */

import { Socket } from 'socket.io';
import { config } from '../../config';
import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity } from '../../utils/acs.util';
import { RESULT_NOT_ALLOWED, InternalCommandResult } from '../../constants/command-results';
import { ACSPermission } from '../../constants/acs-permissions';
import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';
import { flagPause, initPauseState, setNonStopMode } from '../../utils/flag-pause.util';
import { getMaxDirs } from '../../utils/max-dirs.util';
import { conferencePathEntries } from '../../conferences/conference-paths';
import { restricted } from '../../utils/file-restriction.util';
import { emitText } from '../../utils/output.util';
import { decodeUtf8Or } from '../../utils/wire-encoding.util';
import { sessionColumns } from '../../utils/door-min-columns.util';
import { deviceMounted, resolveAssignPath } from '../../utils/path-util';

/**
 * The lines E's ReadStr loop hands viewAFile (express.e:20481): split at each
 * LF, the LF dropped and a CR kept; a last line with no LF still counts, and
 * nothing after a final LF does.
 */
function splitReadStrLines(bytes: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      lines.push(bytes.subarray(start, i));
      start = i + 1;
    }
  }
  if (start < bytes.length) lines.push(bytes.subarray(start));
  return lines;
}

/**
 * View File Handler
 * Displays text file contents
 */
export class ViewFileHandler {
  /**
   * Handle V command - View a File
   * Port from express.e:25675-25687 (internalCommandV)
   */
  static async handleViewFileCommand(
    socket: Socket,
    session: BBSSession,
    params: string = '',
    cmdcode: string = 'V'
  ): Promise<InternalCommandResult> {
    // express.e:25676 - `IF checkSecurity(ACS_VIEW_A_FILE)=FALSE THEN RETURN
    // RESULT_NOT_ALLOWED`. A bare return: nothing is printed here. The
    // dispatcher says "Command requires higher access." once
    // (express.e:28400). "Permission denied." was invented by this port.
    if (!checkSecurity(session.user, ACSPermission.VIEW_A_FILE)) {
      console.warn(
        `[V] RESULT_NOT_ALLOWED: ${session.user?.username ?? '<none>'} ` +
        `(level ${session.user?.secLevel ?? '?'}) lacks ACS.VIEW_A_FILE. ` +
        'Grant it in Access/ACS.<level>.info.'
      );
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return RESULT_NOT_ALLOWED;
    }

    // setEnvStat(ENV_VIEWING) - express.e:25678
console.log('[ENV] Viewing');

    // RIP mode handling (express.e:25679-25681)
    // [1! = Enter RIP graphics/pixel mode
    // [2! = Return to RIP text mode
    if (session.ripMode) {
      emitText(socket, '\x1b[1!'); // Enter RIP pixel mode
    }

    // Call viewAFile - express.e:25682
    // V and VS both arrive here with the code typed (express.e:28373, 28377).
    await this.viewAFile(socket, session, params, cmdcode);

    // RIP mode: Return to text mode after viewing
    if (session.ripMode) {
      emitText(socket, '\x1b[2!'); // Return to RIP text mode
    }
  }

  /**
   * View a file - main viewing logic
   * Port from express.e:20388-20550 (viewAFile)
   */
  private static async viewAFile(
    socket: Socket,
    session: BBSSession,
    params: string,
    cmdcode: string = 'V'
  ): Promise<void> {

    // express.e:20394-20395
    emitText(socket, '\r\n');

    // Check if conference has files - express.e:20399-20402
    const maxDirs = await getMaxDirs(session.currentConf || 1, config.get('dataDir'));
    if (maxDirs === 0) {
      emitText(socket, 'No files available in this conference.\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Parse parameters - express.e:20401
    // filter(Boolean): ''.split(/\s+/) is [''], one EMPTY parameter, which
    // made the prompt below unreachable - a bare V tried to show a file
    // called '' (express.e:20408 prompts when parsedParams.count() is 0).
    const paramParts = params.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const hasNonStop = paramParts.includes('NS');

    // Get filename from params or prompt - express.e:20403-20419
    let filename = '';

    if (paramParts.length > 0 && paramParts[0] !== 'NS') {
      // A sysop view's parameter is a host path: kept as typed.
      filename = this.isSysopView(session, cmdcode)
        ? params.trim().split(/\s+/)[0]
        : paramParts[0];
    } else {
      // No filename provided - prompt user
      emitText(socket, 'Enter filename of file to view? ');
      session.subState = LoggedOnSubState.VIEW_FILE_INPUT;
      session.tempData = {
        waitingForViewFilename: true,
        nonStopDisplay: hasNonStop,
        viewCmdcode: cmdcode,
      };
      return;
    }

    // Validate and display file
    await this.displayFile(socket, session, filename, hasNonStop, cmdcode);
  }

  /**
   * Handle filename input continuation
   */
  static async handleFilenameInput(
    socket: Socket,
    session: BBSSession,
    input: string
  ): Promise<void> {
    if (session.tempData?.waitingForViewFilename) {
      session.tempData.waitingForViewFilename = false;
      const nonStop = session.tempData.nonStopDisplay || false;
      const cmdcode: string = session.tempData.viewCmdcode || 'V';
      // lineInput's own line break (express.e:2378) is the line prompt's
      // (LINE_PROMPT_SUBSTATES echoNewline).

      if (!input.trim()) {
        // Empty input - cancel - express.e:20417-20419
        emitText(socket, '\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        return;
      }

      // Process the filename
      await this.displayFile(socket, session, input.trim(), nonStop, cmdcode);
    }
  }

  /**
   * express.e:20421-20550 - find the file, refuse a restricted one, and show
   * it line by line, giving up at the first line that is not text.
   */
  private static async displayFile(
    socket: Socket,
    session: BBSSession,
    filename: string,
    nonStop: boolean,
    cmdcode: string = 'V'
  ): Promise<void> {
    const dataDir = config.get('dataDir');
    const done = () => { session.subState = LoggedOnSubState.DISPLAY_MENU; };

    let found: { shown: string; hostPath: string } | null;
    if (this.isSysopView(session, cmdcode)) {
      // express.e:20435-20450 - the name IS the path, on any mounted device.
      const file = this.sysopViewFile(filename);
      if (!file) {
        // express.e:20429-20431 skipToIt, with path:=fn
        emitText(socket, `File ${filename} not found.\r\n\r\n`);
        return done();
      }
      // express.e:20447-20448
      require('../../services/CallersLogManager').callersLogManager.logActivity(
        session.nodeId || 1, `\tSysopView ${filename}`);
      found = { shown: filename, hostPath: file.fullPath };
    } else {
      // express.e:20453-20458 - no device, path, wildcard or `@` in the name.
      if (/[:/*@]/.test(filename)) {
        emitText(socket, 'You may not include any special symbols\r\n\r\n');
        return done();
      }
      // express.e:20460-20470 - DLPATH.1, DLPATH.2, ... in order.
      found = this.findOnDownloadPaths(dataDir, session.currentConf || 1, filename);
      if (!found) {
        emitText(socket, 'File not found.\r\n\r\n'); // express.e:20548
        return done();
      }
    }

    // express.e:20473-20480
    if (await restricted(socket, session, found.shown, found.hostPath, dataDir)) {
      emitText(socket, '\r\nAttempt to read RESTRICTED file denied\r\n');
      emitText(socket, 'Updating Callerslog\r\n');
      require('../../services/CallersLogManager').callersLogManager.logActivity(
        session.nodeId || 1, `\t\tAttempt to read RESTRICTED file [${filename}]`);
      return done();
    }

    let bytes: Buffer;
    try {
      bytes = amigafs.readFileSync(found.hostPath) as Buffer;
    } catch (error) {
console.error('[VIEW FILE] Error reading file:', error);
      emitText(socket, 'File not found.\r\n\r\n');
      return done();
    }

    initPauseState(session);
    if (nonStop) setNonStopMode(session, true);

    // express.e:20492-20516 wraps at 79 on an 80-column screen; the width is
    // the caller's (sessionColumns), 39 for a C64.
    const wrapWidth = Math.max(20, sessionColumns(session) - 1);
    let lineCount = 0;
    for (const raw of splitReadStrLines(bytes)) {
      // express.e:20481-20485 - a line opening with a byte above 128 ends it.
      if (raw[0] > 128 || raw[1] > 128 || raw[2] > 128) {
        emitText(socket, '\r\nThis file is not a text file.\r\n\r\n');
        return done();
      }
      await this.displayLineWithWrapping(socket, decodeUtf8Or(raw, 'iso-8859-1'), wrapWidth);
      lineCount++;
      if (lineCount % 20 === 0 && !(await flagPause(socket, session, 0))) return done();
    }
    emitText(socket, '\r\n\r\n'); // express.e:20540
    done();
  }

  /**
   * express.e:20460-20470: the first DLPATH.n holding the name. `shown` is
   * that DLPATH with the name on it, as express.e builds `final`.
   */
  private static findOnDownloadPaths(
    dataDir: string,
    confNum: number,
    filename: string,
  ): { shown: string; hostPath: string } | null {
    for (const dir of conferencePathEntries(dataDir, confNum, 'DLPATH')) {
      const hostPath = amigafs.resolvePath(path.join(dir.host, filename));
      if (!hostPath) continue;
      try {
        if (fs.statSync(hostPath).isFile()) return { shown: `${dir.amiga}${filename}`, hostPath };
      } catch {
        // Not there; the next path.
      }
    }
    return null;
  }

  /**
   * Display line with wrapping at `wrapWidth` characters
   * Port from express.e:20492-20516
   *
   * `wrapWidth` is 79 for every 80-column session, which reproduces the old
   * hard-coded pair (`length < 80` / break at 79) byte-for-byte, and 39 for
   * a C64 - C64/40-col plan, Task 4.
   */
  private static async displayLineWithWrapping(
    socket: Socket,
    line: string,
    wrapWidth: number
  ): Promise<void> {
    // If line has CR or is short, display as-is - express.e:20494-20495
    if (line.includes('\r') || line.length <= wrapWidth) {
      emitText(socket, line + '\r\n');
      return;
    }

    // Wrap long lines at wrapWidth characters - express.e:20497-20514
    let remaining = line;
    while (remaining.length > 0) {
      if (remaining.length > wrapWidth) {
        const chunk = remaining.substring(0, wrapWidth);
        emitText(socket, chunk);
        remaining = remaining.substring(wrapWidth);

        if (remaining.length > 0) {
          emitText(socket, '\r\n');
        }
      } else {
        emitText(socket, remaining);
        remaining = '';
      }
    }
    emitText(socket, '\r\n');
  }

  /**
   * express.e:20435 - VS from a caller with ACS_SYSOP_VIEW. VS from anyone
   * else is V.
   */
  private static isSysopView(session: BBSSession, cmdcode: string): boolean {
    return cmdcode.toUpperCase() === 'VS' && checkSecurity(session.user, ACSPermission.SYSOP_VIEW);
  }

  /**
   * express.e:20436-20446: findAssign(fn) - the device must be mounted - and
   * Open(fn,MODE_OLDFILE), which a directory does not pass. The host file,
   * or null for "not found".
   */
  private static sysopViewFile(fn: string): { fullPath: string } | null {
    if (!deviceMounted(fn)) return null;
    const hostPath = amigafs.resolvePath(resolveAssignPath(fn));
    if (!hostPath) return null;
    try {
      return fs.statSync(hostPath).isFile() ? { fullPath: hostPath } : null;
    } catch {
      return null;
    }
  }

}

/**
 * Test seam for the width-parameterized wrapper (precedent:
 * parseTooltypeStringForTest). The wrapper itself is private because only
 * displayFile may decide the width; the tests need to drive it at both
 * 79 and 39 without a whole file read - C64/40-col plan, Task 4.
 */
export const displayLineWithWrappingForTest = (
  socket: Socket,
  line: string,
  wrapWidth: number
): Promise<void> => (ViewFileHandler as any).displayLineWithWrapping(socket, line, wrapWidth);
