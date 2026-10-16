/**
 * CallersLogManager - Node{n}/CallersLog, written the way express.e writes it.
 *
 * express.e:9493-9518 callersLog(): append `stringout` to
 * `BBS:Node<n>/CallersLog`, followed by a linefeed unless the caller says
 * otherwise, and only while ACS.DO_CALLERSLOG is on. It adds NOTHING - no
 * timestamp, no name. Every line carries its own shape, built by the writer
 * that logs it (the logon line, logoffLog, `\t...` detail lines), and every
 * tool that reads a CallersLog - GLCUpdater, SAmiLog, ByteKillHandler -
 * depends on those exact bytes:
 *
 *   **************************************************************
 *   10-04-26 (17:37:02) [7] regress (CONNECT 19200) Test Account
 *   \tAmiga Demoscene! (1) Conference Joined
 *   \tDownloading MUSIC.LHA 54321 bytes
 *   \t 1 files, 53k bytes, 0 minutes 9 seconds 6035 cps, 100% efficiency at 19200
 *   10-04-26 (17:41:11) regress Off Normally
 *
 * This port used to prefix every line with its own `DD-Mon-YY HH:MM ` and
 * write `(LOCAL)` for the connect string, so GLCUpdater and SAmiLog found no
 * call in any log the board wrote (live Node1: 87 dividers, 0 calls).
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime, formatLongDate, formatLongTime } from '../utils/date-time.util';
import { getBoardConfig } from './bbs-config-file.service';
import { config as appConfig } from '../config';
import { getACSConfig, LevelFlags } from '../utils/acs.util';
import { boardRoot } from '../utils/board-root.util';

/** express.e:9575-9577 callersLogDivider(). */
export const CALLERS_LOG_DIVIDER = '**************************************************************';

/**
 * The connect string of a caller who came in over a socket.
 *
 * express.e:7258-7259 checkIncomingCall: `IF telnetSocket>=0 THEN
 * StrCopy(connectString,'CONNECT 19200')` - a telnet caller has no modem
 * CONNECT line, so express.e writes a fixed one. Every caller of this board
 * arrives on a socket (telnet, SSH or the browser), so all of them are that
 * caller. `SYSOP_LOCAL` (express.e:7611, 29056) and `F2_LOCAL`
 * (express.e:7630) are logons at the Amiga's own console; this board has no
 * console logon, so it never writes either.
 */
export const SOCKET_CONNECT_STRING = 'CONNECT 19200';

/** express.e:7344 onlineBaud:=Val(connectString+7) - the speed the string above carries. */
export const SOCKET_CONNECT_BAUD = parseInt(SOCKET_CONNECT_STRING.slice(8), 10);

/** The fields displayUserToCallersLog (express.e:16023-16056) prints. */
export interface CallerLogonLine {
  /** loggedOnUser.slotNumber - the ACCOUNT number, not the node. */
  slotNumber: number;
  name: string;
  connectString: string;
  location: string;
  /** loggedOnUser.timesCalled=0 before this call: the line reads `NEW [n]`. */
  isNew: boolean;
}

/**
 * The logon line, express.e:16034-16042:
 *
 *   formatLongDate(calltime,tempStr)       -> MM-DD-YY (FORMAT_USA)
 *   formatLongTime(calltime,tempStr2)      -> HH:MM:SS
 *   '\s (\s) NEW [\d] \s (\s) \s'          when timesCalled=0
 *   '\s (\s) [\d] \s (\s) \s'              otherwise
 *
 * The same line heads the UDLog session (udonly=TRUE).
 */
export function formatCallerLogonLine(caller: CallerLogonLine, when: Date = getSystemTime()): string {
  const date = formatLongDate(when);
  const time = formatLongTime(when);
  const marker = caller.isNew ? 'NEW ' : '';
  return `${date} (${time}) ${marker}[${caller.slotNumber}] ${caller.name} (${caller.connectString}) ${caller.location}`;
}

/** A logon line read back: what formatCallerLogonLine wrote. */
export interface ParsedCallerLogonLine extends CallerLogonLine {
  date: string;   // MM-DD-YY
  time: string;   // HH:MM:SS
}

/**
 * Read a logon line. The connect string is one of the three GLCUpdater.e and
 * SAmiLog.asm look for (` (CONNECT `, ` (SYSOP_LOCAL)`, ` (F2_LOCAL)`); a line
 * without one is not a call to either tool, and is not one here.
 */
const LOGON_LINE = /^(\d\d-\d\d-\d\d) \((\d\d:\d\d:\d\d)\) (NEW )?\[(\d+)\] (.*?) \((CONNECT[^)]*|SYSOP_LOCAL|F2_LOCAL)\) ?(.*)$/;
export function parseCallerLogonLine(line: string): ParsedCallerLogonLine | null {
  const m = LOGON_LINE.exec(line.replace(/\r$/, ''));
  if (!m) return null;
  return {
    date: m[1], time: m[2], isNew: !!m[3], slotNumber: parseInt(m[4], 10),
    name: m[5], connectString: m[6], location: m[7],
  };
}

/** logoffLog's line (express.e:9467-9471) read back. */
export interface ParsedLogoffLine { date: string; time: string; name: string; stat: string }
const LOGOFF_LINE = /^(\d\d-\d\d-\d\d) \((\d\d:\d\d:\d\d)\) (.+) Off (.+)$/;
export function parseLogoffLine(line: string): ParsedLogoffLine | null {
  const m = LOGOFF_LINE.exec(line.replace(/\r$/, ''));
  return m ? { date: m[1], time: m[2], name: m[3], stat: m[4] } : null;
}

export class CallersLogManager {
  private bbsRoot: string;

  constructor(root?: string) {
    // BBS: the audit trail must live where the node files live - on the
    // persistent data volume, not the image-local repo tree. The old
    // fallback (repo root) meant every deploy wiped the logs while the
    // console still showed their lines, which is exactly the "emitted
    // but never reach the file" gap (2026-09-10). Same precedence as
    // initialization.ts: explicit root, then boardRoot().
    this.bbsRoot = root ?? boardRoot();
  }

  /**
   * P3-2: SYS_DONT_SAVE_STATE (ACP.e:3091-3093 NO_SAVESTATE tooltype;
   * axSetupTool/helpText.e:265 "Do not save the last callers, uploads,
   * downloads information."). Real AmiExpress gates a separate process's
   * (ACP.e) acp.dat cache with this flag - this port has no such process,
   * so the toggle instead suppresses the logon line (logLogin), the "last
   * callers" entry the tooltype names. Every other line is unaffected,
   * matching express.e's own CallersLog write - which this toggle never
   * gated at all.
   */
  private isStateSaveDisabled(): boolean {
    try {
      return !!getBoardConfig(appConfig.get('dataDir')).dont_save_state;
    } catch {
      return false;
    }
  }

  /**
   * Get path to CallersLog for specific node
   */
  private getLogPath(nodeId: number): string {
    return path.join(this.bbsRoot, `Node${nodeId}`, 'CallersLog');
  }

  /**
   * Which nodes have a CallersLog, and where each one is.
   *
   * express.e:24479-24487 walks Node0, Node1, ... and stops at the first one
   * with no log file, which is also how it decides what to offer the sysop.
   */
  public availableLogs(): Array<{ nodeId: number; path: string }> {
    const found: Array<{ nodeId: number; path: string }> = [];
    for (let nodeId = 0; nodeId < 100; nodeId += 1) {
      const logPath = this.getLogPath(nodeId);
      if (!fs.existsSync(logPath)) break;
      found.push({ nodeId, path: logPath });
    }
    return found;
  }

  /** The log file for one node, whether or not it exists. */
  public logPathFor(nodeId: number): string {
    return this.getLogPath(nodeId);
  }

  /**
   * Ensure Node{n}/ directory exists
   */
  private ensureNodeDir(nodeId: number): void {
    const nodeDir = path.join(this.bbsRoot, `Node${nodeId}`);
    if (!fs.existsSync(nodeDir)) {
      fs.mkdirSync(nodeDir, { recursive: true });
console.log(`[CallersLog] Created directory: Node${nodeId}/`);
    }
  }

  /**
   * express.e:9493-9518 callersLog(stringout, linefeed=TRUE).
   *
   * The line goes in exactly as given - express.e adds no stamp and no name -
   * with a linefeed unless `linefeed` is false (a door's BB_CALLERSLOG,
   * express.e:3805, brings its own). Nothing is written while ACS
   * DO_CALLERSLOG is off (express.e:9497).
   */
  logActivity(nodeId: number, stringout: string, linefeed: boolean = true): void {
    if (!getACSConfig().acLvl[LevelFlags.DO_CALLERSLOG]) return;
    try {
      this.ensureNodeDir(nodeId);
      fs.appendFileSync(this.getLogPath(nodeId), linefeed ? `${stringout}\n` : stringout, 'utf8');
    } catch (error) {
console.error(`[CallersLog] Error writing to Node${nodeId}/CallersLog:`, error);
    }
  }

  /**
   * express.e:16023-16052 displayUserToCallersLog(0): the divider, then the
   * logon line (formatCallerLogonLine).
   */
  logLogin(nodeId: number, caller: CallerLogonLine): void {
    // express.e:16029 - the divider is a session boundary other tooling
    // (ByteKillHandler, GLCUpdater, SAmiLog) parses and carries no caller
    // identity, so it is kept even with SYS_DONT_SAVE_STATE set.
    this.logActivity(nodeId, CALLERS_LOG_DIVIDER);
    // P3-2: SYS_DONT_SAVE_STATE suppresses the "last callers" entry itself.
    if (this.isStateSaveDisabled()) return;
    this.logActivity(nodeId, formatCallerLogonLine(caller));
  }

  /**
   * express.e:9457-9473 logoffLog(stat):
   *   'N...'  -> '\s (\s) \s Off Normally'
   *   other   -> '\s (\s) \s Off \s'      ('Loss Carrier', 'UUCP feed completed')
   */
  logLogoff(nodeId: number, username: string, stat: string = 'N', at?: Date): void {
    // WEB_: a parked call that never came back went off when it dropped, not
    // when its resume window closed - `at` is that drop time.
    const now = at ?? getSystemTime();
    const reason = stat[0] === 'N' ? 'Off Normally' : `Off ${stat}`;
    this.logActivity(nodeId, `${formatLongDate(now)} (${formatLongTime(now)}) ${username} ${reason}`);
  }

  /**
   * logoffLog for one session, once.
   *
   * express.e writes it at "logging off 5" (express.e:8160-8166), BEFORE the
   * LOGOFF system commands run (express.e:8222, 8230-8231) - and those are the
   * logoff batches that run GLCUpdater and SAmiLog over this very log, which
   * read the call's off time and `Off Loss Carrier` from this line. A `G`
   * goodbye runs the batches itself and the disconnect runs them otherwise,
   * so both write it first; whichever comes first writes it.
   */
  logLogoffOnce(
    session: { nodeId?: number; user?: { username: string } | null; logoffLogged?: boolean; detachedBoardTime?: Date },
    stat: string,
  ): void {
    if (!session.user || session.logoffLogged) return;
    session.logoffLogged = true;
    this.logLogoff(session.nodeId || 0, session.user.username, stat, session.detachedBoardTime);
  }

  /**
   * The name of the last caller to log on, from the newest logon line of the
   * first node from `nodeId` up that has one (AREXX BBSGETLASTCALLER).
   */
  getLastCaller(nodeId: number = 0): string | null {
    try {
      for (let i = nodeId; i < 255; i++) {
        const logPath = this.getLogPath(i);
        if (!fs.existsSync(logPath)) continue;
        const lines = fs.readFileSync(logPath, 'utf8').split('\n');
        for (let j = lines.length - 1; j >= 0; j--) {
          const logon = parseCallerLogonLine(lines[j]);
          if (logon) return logon.name;
        }
      }
      return null;
    } catch (error) {
console.error(`[CallersLog] Error getting last caller:`, error);
      return null;
    }
  }

  /**
   * Read CallersLog for a node
   */
  readLog(nodeId: number): string | null {
    try {
      const logPath = this.getLogPath(nodeId);
      if (!fs.existsSync(logPath)) {
        return null;
      }
      return fs.readFileSync(logPath, 'utf8');
    } catch (error) {
console.error(`[CallersLog] Error reading Node${nodeId}/CallersLog:`, error);
      return null;
    }
  }

  /**
   * Clear CallersLog for a node
   */
  clearLog(nodeId: number): void {
    try {
      const logPath = this.getLogPath(nodeId);
      if (fs.existsSync(logPath)) {
        fs.unlinkSync(logPath);
console.log(`[CallersLog] Cleared Node${nodeId}/CallersLog`);
      }
    } catch (error) {
console.error(`[CallersLog] Error clearing Node${nodeId}/CallersLog:`, error);
    }
  }

  /**
   * Initialize CallersLog for all nodes (create directories)
   */
  initializeAllNodes(maxNodes: number = 255): void {
    for (let i = 0; i < maxNodes; i++) {
      this.ensureNodeDir(i);
    }
console.log(`[CallersLog] Initialized ${maxNodes} node directories`);
  }
}

// Export singleton instance
export const callersLogManager = new CallersLogManager();
