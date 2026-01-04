/**
 * DoorDropFileManager - Manages DOOR.SYS and DORINFOx.DEF drop files
 *
 * BBS door programs expect "drop files" that contain user/system information.
 * These are created before door execution and deleted after.
 *
 * File locations:
 * - BBS:Node{n}/DOOR.SYS (standard format, 52 lines)
 * - BBS:Node{n}/DORINFO{n}.DEF (alternative format)
 *
 * DOOR.SYS Format (52 lines):
 * Line 1: COM port (COM1:, COM2:, etc. or LOCAL for no modem)
 * Line 2: Baud rate
 * Line 3: Parity (8 = no parity)
 * Line 4: Node number
 * Line 5: Lock baud (Y/N)
 * Line 6: Screen display (Y/N)
 * Line 7: Printer (Y/N)
 * Line 8: Page bell (Y/N)
 * Line 9: Caller alarm (Y/N)
 * Line 10: User's name (first + last)
 * Line 11: User's location
 * Line 12: User's phone (###-###-#### or ###-######)
 * Line 13: User's password
 * Line 14: Security level
 * Line 15: Number of times logged on
 * Line 16: Last date called (MM/DD/YY)
 * Line 17: Seconds remaining
 * Line 18: Minutes remaining
 * Line 19: Graphics mode (GR=ANSI, NG=ASCII, 7E=7-bit)
 * Line 20: Page length
 * Line 21: Expert mode (Y/N)
 * Lines 22-24: Access control strings
 * Line 25: Conference where user was
 * Line 26: Conference where door was run from
 * Line 27: Expired registration date (00/00/00 if not expired)
 * Line 28: User number
 * Line 29: Default protocol (X=Xmodem, etc.)
 * Line 30: Total uploads
 * Line 31: Total downloads
 * Line 32: Total download KB today
 * Line 33: Daily download limit in KB
 * Line 34: Birth date (MM/DD/YY)
 * Line 35-36: Path to user file, path to general message file
 * Line 37: BBS name
 * Line 38: Sysop's name
 * Lines 39-40: Sysop aliases
 * Line 41: System file path
 * Line 42: Time user logged on (HH:MM)
 * Line 43: Time user will be forced off (HH:MM)
 * Line 44: Previous caller's name
 * Line 45: Time of previous call (HH:MM)
 * Line 46: Previous caller's baud rate
 * Line 47: Current available memory (if known)
 * Line 48: Node number being used by caller
 * Line 49: FOSSIL mode (Y/N)
 * Line 50: User's 24-hour time format preference (Y/N)
 * Line 51: ANSI detected (Y/N)
 * Line 52: Record locking (Y/N)
 */

import * as fs from 'fs';
import * as path from 'path';
import { User } from '../database';
import { loadBBSConfig } from './bbs-config-file.service';

// Cache for previous caller info per node (avoids reading logs repeatedly)
interface PreviousCallerInfo {
  name: string;
  time: string;
  baud: string;
}

export class DoorDropFileManager {
  private bbsRoot: string;
  private bbsName: string = 'AmiExpress BBS';
  private sysopName: string = 'Sysop';
  private previousCallerCache: Map<number, PreviousCallerInfo> = new Map();

  constructor() {
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
    // Load BBS name and sysop name from disk (bbsConfig.info)
    this.loadConfigFromDisk();
console.log('[DoorDropFile] Initialized');
console.log(`  BBS root: ${this.bbsRoot}`);
console.log(`  BBS name: ${this.bbsName} (from bbsConfig.info)`);
console.log(`  Sysop: ${this.sysopName} (from bbsConfig.info)`);
  }

  private loadConfigFromDisk(): void {
    const bbsConfig = loadBBSConfig(this.bbsRoot);
    this.bbsName = bbsConfig.bbs_name || 'AmiExpress BBS';
    this.sysopName = bbsConfig.sysop_name || 'Sysop';
  }

  setBbsRoot(bbsRoot: string): void {
    this.bbsRoot = bbsRoot;
    // Reload config when BBS root changes
    this.loadConfigFromDisk();
console.log(`[DoorDropFile] Root updated -> ${bbsRoot}`);
console.log(`[DoorDropFile] Config reloaded: bbsName="${this.bbsName}" sysopName="${this.sysopName}"`);
  }

  /**
   * Get previous caller info from CallersLog or session logs
   * Returns cached value if available, otherwise parses log file
   */
  private getPreviousCaller(nodeId: number): PreviousCallerInfo {
    // Check cache first
    if (this.previousCallerCache.has(nodeId)) {
      return this.previousCallerCache.get(nodeId)!;
    }

    const result: PreviousCallerInfo = {
      name: 'No Previous Caller',
      time: '00:00',
      baud: '115200',
    };

    try {
      // Try reading from CallersLog in Node directory
      const callersLogPath = path.join(this.bbsRoot, `Node${nodeId}`, 'CallersLog');
      if (fs.existsSync(callersLogPath)) {
        const content = fs.readFileSync(callersLogPath, 'utf8');
        const lines = content.trim().split('\n').filter(l => l.trim());

        // Get second-to-last entry (previous caller, not current)
        // Format varies but typically: "Username [timestamp] action"
        if (lines.length >= 2) {
          const prevLine = lines[lines.length - 2];
          // Try to parse caller name from log line
          const nameMatch = prevLine.match(/^([A-Za-z0-9 ]+?)\s*[\[\(]/);
          if (nameMatch) {
            result.name = nameMatch[1].trim().slice(0, 30);
          }
          // Try to extract time
          const timeMatch = prevLine.match(/(\d{1,2}:\d{2})/);
          if (timeMatch) {
            result.time = timeMatch[1];
          }
        }
      }
    } catch (err) {
      // Silent fail - use defaults
console.log(`[DoorDropFile] Could not read CallersLog for Node${nodeId}:`, err);
    }

    // Cache the result
    this.previousCallerCache.set(nodeId, result);
    return result;
  }

  /**
   * Get estimated available memory (used for DOOR.SYS line 47)
   * Returns a reasonable estimate based on system state
   */
  private getAvailableMemory(): number {
    // Amiga can handle 128-256MB+ with accelerators
    // Report 64MB as a reasonable "plenty of memory" value
    // This indicates to doors that memory is not a constraint
    return 64 * 1024 * 1024; // 64MB in bytes
  }

  /**
   * Update session download bytes today (for DOOR.SYS line 32)
   * This should be called by download handlers
   */
  updateDownloadBytesToday(nodeId: number, bytes: number): void {
    const nodeDir = path.join(this.bbsRoot, `Node${nodeId}`);
    const trackingPath = path.join(nodeDir, '.download_today');
    try {
      let total = 0;
      if (fs.existsSync(trackingPath)) {
        const content = fs.readFileSync(trackingPath, 'utf8').trim();
        const [dateStr, bytesStr] = content.split(':');
        const today = new Date().toISOString().slice(0, 10);
        if (dateStr === today) {
          total = parseInt(bytesStr) || 0;
        }
      }
      total += bytes;
      const today = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(trackingPath, `${today}:${total}`, 'utf8');
    } catch (err) {
      // Silent fail
    }
  }

  /**
   * Get download bytes today for a node
   */
  private getDownloadBytesToday(nodeId: number): number {
    const nodeDir = path.join(this.bbsRoot, `Node${nodeId}`);
    const trackingPath = path.join(nodeDir, '.download_today');
    try {
      if (fs.existsSync(trackingPath)) {
        const content = fs.readFileSync(trackingPath, 'utf8').trim();
        const [dateStr, bytesStr] = content.split(':');
        const today = new Date().toISOString().slice(0, 10);
        if (dateStr === today) {
          return parseInt(bytesStr) || 0;
        }
      }
    } catch (err) {
      // Silent fail
    }
    return 0;
  }

  /**
   * Clear previous caller cache (call when a new user logs in)
   */
  clearPreviousCallerCache(nodeId: number): void {
    this.previousCallerCache.delete(nodeId);
  }

  /**
   * Create DOOR.SYS file for a door session
   */
  createDoorSys(nodeId: number, user: User, timeRemaining: number): void {
    const nodeDir = path.join(this.bbsRoot, `Node${nodeId}`);
    const doorSysPath = path.join(nodeDir, 'DOOR.SYS');

    // Ensure Node directory exists
    if (!fs.existsSync(nodeDir)) {
      fs.mkdirSync(nodeDir, { recursive: true });
    }

    // Format dates
    const now = new Date();
    const lastLogin = user.lastLogin || now;
    const formatDate = (date: Date) => {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const yy = String(date.getFullYear()).slice(-2);
      return `${mm}/${dd}/${yy}`;
    };
    const formatTime = (date: Date) => {
      const hh = String(date.getHours()).padStart(2, '0');
      const mm = String(date.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    };

    // Calculate logoff time
    const logoffTime = new Date(now.getTime() + timeRemaining * 1000);

    // Build DOOR.SYS content (52 lines)
    const lines: string[] = [
      'LOCAL',                                    // 1: COM port (LOCAL = no modem)
      '115200',                                   // 2: Baud rate
      '8',                                        // 3: Parity (8 = no parity)
      String(nodeId),                             // 4: Node number
      'Y',                                        // 5: Lock baud
      'Y',                                        // 6: Screen display
      'N',                                        // 7: Printer
      'Y',                                        // 8: Page bell
      'Y',                                        // 9: Caller alarm
      user.realname || user.username,             // 10: User's name
      user.location || 'Unknown',                 // 11: Location
      user.phone || '000-000-0000',               // 12: Phone
      '',                                         // 13: Password (blank for security)
      String(user.secLevel),                      // 14: Security level
      String(user.calls),                         // 15: Times logged on
      formatDate(lastLogin),                      // 16: Last date called
      String(timeRemaining),                      // 17: Seconds remaining
      String(Math.floor(timeRemaining / 60)),     // 18: Minutes remaining
      user.ansi ? 'GR' : 'NG',                    // 19: Graphics mode
      String(user.linesPerScreen),                // 20: Page length
      user.expert ? 'Y' : 'N',                    // 21: Expert mode
      '1,2,3,4,5,6,7',                            // 22: Access control
      '',                                         // 23: Access control
      '',                                         // 24: Access control
      '1',                                        // 25: Conference user was in
      '1',                                        // 26: Conference door run from
      '00/00/00',                                 // 27: Expired date (not expired)
      String(user.id || '1'),                     // 28: User number
      user.protocol ? user.protocol.charAt(0) : 'Z', // 29: Default protocol
      String(user.uploads),                       // 30: Total uploads
      String(user.downloads),                     // 31: Total downloads
      String(Math.floor(this.getDownloadBytesToday(nodeId) / 1024)), // 32: Download KB today
      String(Math.floor(user.byteLimit / 1024)),  // 33: Daily download limit KB
      '00/00/00',                                 // 34: Birth date
      this.bbsRoot + '/user.data',                // 35: Path to user file
      this.bbsRoot + '/messages',                 // 36: Path to message file
      this.bbsName,                               // 37: BBS name
      this.sysopName,                             // 38: Sysop name
      this.sysopName,                             // 39: Sysop alias 1
      '',                                         // 40: Sysop alias 2
      this.bbsRoot,                               // 41: System path
      formatTime(now),                            // 42: Logon time
      formatTime(logoffTime),                     // 43: Forced logoff time
      this.getPreviousCaller(nodeId).name,        // 44: Previous caller
      this.getPreviousCaller(nodeId).time,        // 45: Previous call time
      this.getPreviousCaller(nodeId).baud,        // 46: Previous baud
      String(this.getAvailableMemory()),          // 47: Available memory
      String(nodeId),                             // 48: Node number
      'N',                                        // 49: FOSSIL mode
      'N',                                        // 50: 24-hour format
      user.ansi ? 'Y' : 'N',                      // 51: ANSI detected
      'Y',                                        // 52: Record locking
    ];

    // Write file
    const content = lines.join('\r\n') + '\r\n';
    fs.writeFileSync(doorSysPath, content, 'utf8');
console.log(`[DoorDropFile] Created DOOR.SYS for Node${nodeId}`);
  }

  /**
   * Create DORINFOx.DEF file (alternative format)
   */
  createDorInfo(nodeId: number, user: User): void {
    const nodeDir = path.join(this.bbsRoot, `Node${nodeId}`);
    const dorInfoPath = path.join(nodeDir, `DORINFO${nodeId}.DEF`);

    // Ensure Node directory exists
    if (!fs.existsSync(nodeDir)) {
      fs.mkdirSync(nodeDir, { recursive: true });
    }

    // Build DORINFOx.DEF content
    const lines: string[] = [
      this.bbsName,                               // BBS name
      this.sysopName,                             // Sysop first name
      '',                                         // Sysop last name
      'LOCAL',                                    // COM port
      '115200 BAUD,N,8,1',                        // Baud rate + params
      '0',                                        // Network type (0=local)
      user.realname || user.username,             // User first name
      '',                                         // User last name
      user.location || 'Unknown',                 // User location
      user.ansi ? '1' : '0',                      // Graphics mode (1=ANSI)
      String(user.secLevel),                      // Security level
      '999',                                      // Time remaining (minutes)
      '-1',                                       // FOSSIL (-1=no)
    ];

    const content = lines.join('\r\n') + '\r\n';
    fs.writeFileSync(dorInfoPath, content, 'utf8');
console.log(`[DoorDropFile] Created DORINFO${nodeId}.DEF for Node${nodeId}`);
  }

  /**
   * Delete drop files after door exit
   */
  cleanupDropFiles(nodeId: number): void {
    const nodeDir = path.join(this.bbsRoot, `Node${nodeId}`);

    // Delete DOOR.SYS
    const doorSysPath = path.join(nodeDir, 'DOOR.SYS');
    if (fs.existsSync(doorSysPath)) {
      fs.unlinkSync(doorSysPath);
console.log(`[DoorDropFile] Deleted DOOR.SYS for Node${nodeId}`);
    }

    // Delete DORINFOx.DEF
    const dorInfoPath = path.join(nodeDir, `DORINFO${nodeId}.DEF`);
    if (fs.existsSync(dorInfoPath)) {
      fs.unlinkSync(dorInfoPath);
console.log(`[DoorDropFile] Deleted DORINFO${nodeId}.DEF for Node${nodeId}`);
    }
  }

  /**
   * Create all drop files before door execution
   */
  createAllDropFiles(nodeId: number, user: User, timeRemaining: number): void {
    this.createDoorSys(nodeId, user, timeRemaining);
    this.createDorInfo(nodeId, user);
  }
}

// Export singleton instance
export const doorDropFileManager = new DoorDropFileManager();
