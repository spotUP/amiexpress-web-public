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

export class CallersLogManager {
  private bbsRoot: string;

  constructor() {
    // BBS: points to project root
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
    console.log('[CallersLogManager] Initialized');
    console.log(`  BBS root: ${this.bbsRoot}`);
  }

  /**
   * Get path to CallersLog for specific node
   */
  private getLogPath(nodeId: number): string {
    return path.join(this.bbsRoot, `Node${nodeId}`, 'CallersLog');
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
  private formatTimestamp(date: Date = new Date()): string {
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
   * Append entry to CallersLog
   */
  private appendLog(nodeId: number, entry: string): void {
    try {
      this.ensureNodeDir(nodeId);
      const logPath = this.getLogPath(nodeId);
      const timestamp = this.formatTimestamp();
      const logLine = `${timestamp} ${entry}\n`;

      fs.appendFileSync(logPath, logLine, 'utf8');
      console.log(`[CallersLog] Node${nodeId}: ${entry}`);
    } catch (error) {
      console.error(`[CallersLog] Error writing to Node${nodeId}/CallersLog:`, error);
    }
  }

  /**
   * Log user login
   */
  logLogin(nodeId: number, username: string): void {
    this.appendLog(nodeId, `Login: ${username}`);
  }

  /**
   * Log user logoff
   */
  logLogoff(nodeId: number, username: string): void {
    this.appendLog(nodeId, `Logoff: ${username}`);
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
    this.appendLog(nodeId, `Upload: ${filename} to ${area}`);
  }

  /**
   * Log file download
   */
  logFileDownload(nodeId: number, filename: string): void {
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
