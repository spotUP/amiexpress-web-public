/**
 * Sysop Debug Utility
 * Provides debug messages to sysops for troubleshooting file I/O and door issues
 *
 * Color coding by severity:
 * - Red (31): Critical errors (file I/O failures, door crashes)
 * - Yellow (33): Warnings (missing optional files, deprecated features)
 * - Cyan (36): Info (debugging information, state changes)
 * - Magenta (35): Door-specific issues
 */

import { config as appConfig } from '../config';
import { loadBBSConfig } from '../services/bbs-config-file.service';

export enum DebugSeverity {
  CRITICAL = 'critical',  // Red - file errors, crashes
  WARNING = 'warning',    // Yellow - non-fatal issues
  INFO = 'info',          // Cyan - debug information
  DOOR = 'door'           // Magenta - door-specific
}

export class SysopDebugUtil {
  /**
   * Get ANSI color code for severity level
   */
  private static getSeverityColor(severity: DebugSeverity): string {
    switch (severity) {
      case DebugSeverity.CRITICAL:
        return '\x1b[31m'; // Red
      case DebugSeverity.WARNING:
        return '\x1b[33m'; // Yellow
      case DebugSeverity.INFO:
        return '\x1b[36m'; // Cyan
      case DebugSeverity.DOOR:
        return '\x1b[35m'; // Magenta
      default:
        return '\x1b[37m'; // White
    }
  }

  private static readonly SYSOP_DEBUG_CACHE_MS = 5000;
  private static sysopDebugCache: { enabled: boolean; loadedAt: number; dataDir: string } | null = null;

  private static isSysopDebugEnabled(session: any): boolean {
    const sessionFlag =
      session?.sysop_debug_enabled ??
      session?.systemConfig?.sysop_debug_enabled ??
      session?.bbsConfig?.sysop_debug_enabled ??
      session?.config?.sysop_debug_enabled;

    if (typeof sessionFlag === 'boolean') {
      return sessionFlag;
    }

    const dataDir = session?.dataDir || session?.bbsRoot || appConfig.get('dataDir') || process.cwd();
    const now = Date.now();
    const cache = this.sysopDebugCache;
    if (cache && cache.dataDir === dataDir && now - cache.loadedAt < this.SYSOP_DEBUG_CACHE_MS) {
      return cache.enabled;
    }

    const diskConfig = loadBBSConfig(dataDir);
    const enabled = Boolean(diskConfig.sysop_debug_enabled);
    this.sysopDebugCache = { enabled, loadedAt: now, dataDir };
    return enabled;
  }
  /**
   * Check if user is a sysop (security level 100+)
   */
  static isSysop(session: any): boolean {
    return session?.user?.secLevel >= 100 && this.isSysopDebugEnabled(session);
  }

  /**
   * Send debug message to sysop terminal and backend logs
   * Only shows in terminal if user is sysop (secLevel >= 100)
   */
  static debugFileError(
    socket: any,
    session: any,
    operation: string,
    filePath: string,
    error: Error | string,
    severity: DebugSeverity = DebugSeverity.CRITICAL
  ): void {
    const errorMsg = typeof error === 'string' ? error : error.message;
    const debugMsg = `[SYSOP DEBUG] File ${operation} failed: ${filePath}\n  Error: ${errorMsg}`;

    // Always log to backend
    console.error(debugMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      const color = this.getSeverityColor(severity);
      socket.emit('ansi-output', `\r\n${color}${debugMsg}\x1b[0m\r\n`);
    }
  }

  /**
   * Send debug message for door execution issues
   */
  static debugDoorError(
    socket: any,
    session: any,
    doorName: string,
    issue: string,
    details?: any,
    severity: DebugSeverity = DebugSeverity.DOOR
  ): void {
    const debugMsg = `[SYSOP DEBUG] Door '${doorName}': ${issue}`;
    const detailsMsg = details ? `\n  Details: ${JSON.stringify(details, null, 2)}` : '';

    // Always log to backend
    console.error(debugMsg + detailsMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      const color = this.getSeverityColor(severity);
      socket.emit('ansi-output', `\r\n${color}${debugMsg}${detailsMsg}\x1b[0m\r\n`);
    }
  }

  /**
   * Send general debug message to sysop
   */
  static debug(
    socket: any,
    session: any,
    category: string,
    message: string,
    details?: any,
    severity: DebugSeverity = DebugSeverity.INFO
  ): void {
    const debugMsg = `[SYSOP DEBUG] ${category}: ${message}`;

    // Format details as human-readable JSON with indentation
    let detailsMsg = '';
    if (details) {
      const formattedDetails = JSON.stringify(details, null, 2)
        .split('\n')
        .map((line, idx) => idx === 0 ? line : `  ${line}`) // Indent all lines except first
        .join('\r\n');
      detailsMsg = `\r\n  ${formattedDetails}`;
    }

    // Always log to backend
    console.log(debugMsg + (details ? `\n${JSON.stringify(details, null, 2)}` : ''));

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      const color = this.getSeverityColor(severity);
      socket.emit('ansi-output', `${color}${debugMsg}${detailsMsg}\x1b[0m\r\n`);
    }
  }

  /**
   * Send warning message to sysop
   */
  static warn(
    socket: any,
    session: any,
    category: string,
    message: string
  ): void {
    const warnMsg = `[SYSOP WARNING] ${category}: ${message}`;

    // Always log to backend
    console.warn(warnMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      const color = this.getSeverityColor(DebugSeverity.WARNING);
      socket.emit('ansi-output', `\r\n${color}${warnMsg}\x1b[0m\r\n`);
    }
  }

  /**
   * Format a 32-bit value as hex with optional ASCII representation
   */
  private static formatHex32(val: number): string {
    return `0x${(val >>> 0).toString(16).padStart(8, '0')}`;
  }

  /**
   * Send door crash information to sysop
   * Includes full register dump, PC history, stack contents, and error details
   */
  static debugDoorCrash(
    socket: any,
    session: any,
    doorName: string,
    crashInfo: {
      pc?: number;
      sp?: number;
      error?: string;
      iteration?: number;
      // Register dump
      registers?: {
        d0?: number; d1?: number; d2?: number; d3?: number;
        d4?: number; d5?: number; d6?: number; d7?: number;
        a0?: number; a1?: number; a2?: number; a3?: number;
        a4?: number; a5?: number; a6?: number;
      };
      // PC history (last N program counter values)
      pcHistory?: number[];
      // Stack contents (values near SP)
      stackContents?: number[];
      // Memory at key addresses
      memoryDump?: { address: number; value: number; label?: string }[];
      // Last significant PC (before library calls)
      lastSignificantPC?: number;
      // Call counts
      writeCallCount?: number;
      aedoorCallCount?: number;
      // Stack info
      stackBase?: number;
      stackSize?: number;
      // Raw error stack trace (for backend log only)
      stack?: string;
      [key: string]: any;
    }
  ): void {
    const crashMsg = `[SYSOP DEBUG] Door '${doorName}' CRASHED`;
    let details = '';

    // Basic info
    if (crashInfo.pc !== undefined) {
      details += `\r\n  PC: ${this.formatHex32(crashInfo.pc)}`;
    }
    if (crashInfo.sp !== undefined) {
      details += `\r\n  SP: ${this.formatHex32(crashInfo.sp)}`;
    }
    if (crashInfo.error) {
      details += `\r\n  Error: ${crashInfo.error}`;
    }
    if (crashInfo.iteration !== undefined) {
      details += `\r\n  Iteration: ${crashInfo.iteration}`;
    }

    // Register dump (D0-D7, A0-A6)
    if (crashInfo.registers) {
      const r = crashInfo.registers;
      details += `\r\n  Registers:`;
      details += `\r\n    D0=${this.formatHex32(r.d0 ?? 0)} D1=${this.formatHex32(r.d1 ?? 0)} D2=${this.formatHex32(r.d2 ?? 0)} D3=${this.formatHex32(r.d3 ?? 0)}`;
      details += `\r\n    D4=${this.formatHex32(r.d4 ?? 0)} D5=${this.formatHex32(r.d5 ?? 0)} D6=${this.formatHex32(r.d6 ?? 0)} D7=${this.formatHex32(r.d7 ?? 0)}`;
      details += `\r\n    A0=${this.formatHex32(r.a0 ?? 0)} A1=${this.formatHex32(r.a1 ?? 0)} A2=${this.formatHex32(r.a2 ?? 0)} A3=${this.formatHex32(r.a3 ?? 0)}`;
      details += `\r\n    A4=${this.formatHex32(r.a4 ?? 0)} A5=${this.formatHex32(r.a5 ?? 0)} A6=${this.formatHex32(r.a6 ?? 0)}`;
    }

    // PC history
    if (crashInfo.pcHistory && crashInfo.pcHistory.length > 0) {
      details += `\r\n  PC History (last ${crashInfo.pcHistory.length}):`;
      const historyStr = crashInfo.pcHistory
        .map(pc => `0x${pc.toString(16)}`)
        .join(' -> ');
      details += `\r\n    ${historyStr}`;
    }

    // Stack contents
    if (crashInfo.stackContents && crashInfo.stackContents.length > 0) {
      details += `\r\n  Stack (at SP):`;
      const stackStr = crashInfo.stackContents
        .map((val, i) => `[SP+${i * 4}]=${this.formatHex32(val)}`)
        .join(' ');
      details += `\r\n    ${stackStr}`;
    }

    // Memory dump
    if (crashInfo.memoryDump && crashInfo.memoryDump.length > 0) {
      details += `\r\n  Memory:`;
      for (const mem of crashInfo.memoryDump) {
        const label = mem.label ? ` (${mem.label})` : '';
        details += `\r\n    [${this.formatHex32(mem.address)}]=${this.formatHex32(mem.value)}${label}`;
      }
    }

    // Last significant PC
    if (crashInfo.lastSignificantPC !== undefined) {
      details += `\r\n  Last significant PC: ${this.formatHex32(crashInfo.lastSignificantPC)}`;
    }

    // Call counts
    if (crashInfo.writeCallCount !== undefined || crashInfo.aedoorCallCount !== undefined) {
      details += `\r\n  Calls: Write=${crashInfo.writeCallCount ?? 0}, AEDoor=${crashInfo.aedoorCallCount ?? 0}`;
    }

    // Stack bounds
    if (crashInfo.stackBase !== undefined && crashInfo.stackSize !== undefined) {
      const stackTop = crashInfo.stackBase + crashInfo.stackSize;
      details += `\r\n  Stack bounds: ${this.formatHex32(crashInfo.stackBase)} - ${this.formatHex32(stackTop)}`;
    }

    const fullMsg = crashMsg + details;

    // Always log to backend (use \n for console)
    console.error(fullMsg.replace(/\r\n/g, '\n'));
    if (crashInfo.stack) {
      console.error('  JavaScript stack:', crashInfo.stack);
    }

    // Send to terminal if sysop (use \r\n for ANSI terminal)
    if (this.isSysop(session) && socket) {
      const color = this.getSeverityColor(DebugSeverity.CRITICAL);
      socket.emit('ansi-output', `\r\n${color}${fullMsg}\x1b[0m\r\n`);
      socket.emit('ansi-output', `\x1b[33mPaste this output to Claude for debugging assistance.\x1b[0m\r\n`);
    }
  }
}
