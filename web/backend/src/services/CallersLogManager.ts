/**
 * CallersLogManager - Manages Node{n}/CallersLog activity files
 *
 * AmiExpress writes activity logs to Node{n}/CallersLog for tracking user actions.
 * This is a text file with timestamped entries.
 *
 * File locations:
 * - BBS:Node0/CallersLog
 * - BBS:Node1/CallersLog
 * - etc.
 *
 * Format: Text file with lines like:
 * 01-Nov-25 20:49 Login: sysop
 * 01-Nov-25 20:50 Command: WHO
 * 01-Nov-25 20:51 Door: WHO
 * 01-Nov-25 20:52 Logoff
 *
 * Reference: express.e lines 9499-9517
 */

import * as fs from 'fs';
import * as path from 'path';
import { getSystemTime, formatLongDate, formatLongTime } from '../utils/date-time.util';
import { getBoardConfig } from './bbs-config-file.service';
import { config as appConfig } from '../config';

export class CallersLogManager {
  private bbsRoot: string;

  constructor(root?: string) {
    // BBS: the audit trail must live where the node files live - on the
    // persistent data volume, not the image-local repo tree. The old
    // fallback (repo root) meant every deploy wiped the logs while the
    // console still showed their lines, which is exactly the "emitted
    // but never reach the file" gap (2026-09-10). Same precedence as
    // initialization.ts: explicit root, BBS_ROOT, BBS_DATA_DIR, repo.
    this.bbsRoot = root
      ?? process.env.BBS_ROOT
      ?? process.env.BBS_DATA_DIR
      ?? path.join(__dirname, '../../../..');
  }

  /**
   * P3-2: SYS_DONT_SAVE_STATE (ACP.e:3091-3093 NO_SAVESTATE tooltype;
   * axSetupTool/helpText.e:265 "Do not save the last callers, uploads,
   * downloads information."). Real AmiExpress gates a separate process's
   * (ACP.e) acp.dat cache with this flag - this port has no such process,
   * so the toggle instead suppresses the three categories the tooltype
   * names when they are written to this file: callers (logLogin), uploads
   * (logFileUpload) and downloads (logFileDownload). Everything else this
   * class logs (commands, doors, chat, conference joins, logoff) is
   * unaffected, matching express.e's own CallersLog write - which this
   * toggle never gated at all.
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
   * Format timestamp for log entry
   * Format: DD-Mon-YY HH:MM
   * Example: 01-Nov-25 20:49
   */
  private formatTimestamp(date: Date = getSystemTime()): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}-${month}-${year} ${hours}:${minutes}`;
  }

  /**
   * Append entry to CallersLog with auto-timestamp prefix
   * @param rawEntry If true, entry already contains the timestamp (skip prefix)
   */
  private appendLog(nodeId: number, entry: string, rawEntry: boolean = false): void {
    try {
      this.ensureNodeDir(nodeId);
      const logPath = this.getLogPath(nodeId);
      const logLine = rawEntry ? `${entry}\n` : `${this.formatTimestamp()} ${entry}\n`;

      fs.appendFileSync(logPath, logLine, 'utf8');
console.log(`[CallersLog] Node${nodeId}: ${entry}`);
    } catch (error) {
console.error(`[CallersLog] Error writing to Node${nodeId}/CallersLog:`, error);
    }
  }

  /**
   * Write session divider (required for ByteKillHandler compatibility)
   * express.e callersLogDivider() writes this before each user session
   */
  private writeDivider(nodeId: number): void {
    try {
      this.ensureNodeDir(nodeId);
      const logPath = this.getLogPath(nodeId);
      fs.appendFileSync(logPath, '**************************************************************\n', 'utf8');
    } catch (error) {
      console.error(`[CallersLog] Error writing divider to Node${nodeId}/CallersLog:`, error);
    }
  }

  /**
   * Log user login
   * Per express.e displayUserToCallersLog(), this writes a divider then user info
   */
  logLogin(nodeId: number, username: string, slotNumber: number = 1, location: string = 'Unknown'): void {
    // Write divider before login entry (express.e:16029) - a session
    // boundary marker other tooling (ByteKillHandler) parses, carrying no
    // caller identity, so it is kept even with SYS_DONT_SAVE_STATE set.
    this.writeDivider(nodeId);
    // P3-2: SYS_DONT_SAVE_STATE suppresses the "last callers" entry itself.
    if (this.isStateSaveDisabled()) return;
    // Format: DD-Mon-YYYY (HH:MM) [slot] username (connectString) location
    // express.e uses formatLongDate + formatLongTime, similar to our format
    const timestamp = this.formatTimestamp();
    const entry = `${timestamp} [${slotNumber}] ${username} (LOCAL) ${location}`;
    // Write directly without extra timestamp (appendLog adds one)
    try {
      this.ensureNodeDir(nodeId);
      const logPath = this.getLogPath(nodeId);
      fs.appendFileSync(logPath, entry + '\n', 'utf8');
      console.log(`[CallersLog] Node${nodeId}: Login ${username}`);
    } catch (error) {
      console.error(`[CallersLog] Error writing login to Node${nodeId}/CallersLog:`, error);
    }
  }

  /**
   * Log user logoff — express.e:9457-9473 logoffLog()
   * Format: 'MM-DD-YY (HH:MM:SS) username Off Normally'
   * @param stat Logoff reason: 'N'=Normal, 'L'=Loss Carrier, etc.
   */
  logLogoff(nodeId: number, username: string, stat: string = 'N'): void {
    const now = getSystemTime();
    const dateStr = formatLongDate(now);  // MM-DD-YY (FORMAT_USA)
    const timeStr = formatLongTime(now);  // HH:MM:SS
    const reason = stat[0] === 'N' ? 'Off Normally' : `Off ${stat}`;
    // express.e:9467-9472: '\s (\s) \s Off Normally' or '\s (\s) \s Off \s'
    // Pass rawEntry=true since the entry already contains the timestamp
    this.appendLog(nodeId, `${dateStr} (${timeStr}) ${username} ${reason}`, true);
  }

  /**
   * Log command execution
   */
  logCommand(nodeId: number, command: string): void {
    this.appendLog(nodeId, `Command: ${command}`);
  }

  /**
   * Log door execution
   */
  logDoor(nodeId: number, doorName: string): void {
    this.appendLog(nodeId, `Door: ${doorName}`);
  }

  /**
   * Log door exit
   */
  logDoorExit(nodeId: number, doorName: string): void {
    this.appendLog(nodeId, `Door exit: ${doorName}`);
  }

  /**
   * Log message post
   */
  logMessagePost(nodeId: number, conference: string, subject: string): void {
    this.appendLog(nodeId, `Message posted in ${conference}: ${subject}`);
  }

  /**
   * Log file upload
   */
  logFileUpload(nodeId: number, filename: string, area: string): void {
    // P3-2: SYS_DONT_SAVE_STATE suppresses upload history.
    if (this.isStateSaveDisabled()) return;
    this.appendLog(nodeId, `Upload: ${filename} to ${area}`);
  }

  /**
   * Log file download
   */
  logFileDownload(nodeId: number, filename: string): void {
    // P3-2: SYS_DONT_SAVE_STATE suppresses download history.
    if (this.isStateSaveDisabled()) return;
    this.appendLog(nodeId, `Download: ${filename}`);
  }

  /**
   * Log chat join
   */
  logChatJoin(nodeId: number, roomName: string): void {
    this.appendLog(nodeId, `Chat join: ${roomName}`);
  }

  /**
   * Log chat leave
   */
  logChatLeave(nodeId: number, roomName: string): void {
    this.appendLog(nodeId, `Chat leave: ${roomName}`);
  }

  /**
   * Log conference join
   */
  logConferenceJoin(nodeId: number, conferenceName: string): void {
    this.appendLog(nodeId, `Conference: ${conferenceName}`);
  }

  /**
   * Log custom activity
   */
  logActivity(nodeId: number, activity: string): void {
    this.appendLog(nodeId, activity);
  }

  /**
   * Get the last caller (most recent login) from CallersLog
   * Returns the username of the last user who logged in
   */
  getLastCaller(nodeId: number = 0): string | null {
    try {
      // Try all nodes starting from nodeId
      for (let i = nodeId; i < 255; i++) {
        const logPath = this.getLogPath(i);
        if (!fs.existsSync(logPath)) continue;

        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').reverse();

        // Find the most recent login entry
        for (const line of lines) {
          const loginMatch = line.match(/Login:\s*(\S+)/);
          if (loginMatch) {
            return loginMatch[1];
          }
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
