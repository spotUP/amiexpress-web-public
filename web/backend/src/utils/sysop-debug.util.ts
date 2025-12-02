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
  /**
   * Check if user is a sysop (security level 100+)
   */
  static isSysop(session: any): boolean {
    return session?.user?.secLevel >= 100;
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
    const detailsMsg = details ? `\n  Details: ${JSON.stringify(details, null, 2)}` : '';

    // Always log to backend
    console.log(debugMsg + detailsMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      const color = this.getSeverityColor(severity);
      socket.emit('ansi-output', `\r\n${color}${debugMsg}${detailsMsg}\x1b[0m\r\n`);
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
   * Send door crash information to sysop
   * Includes PC, SP, and last instructions for debugging
   */
  static debugDoorCrash(
    socket: any,
    session: any,
    doorName: string,
    crashInfo: {
      pc?: number;
      sp?: number;
      lastInstructions?: string[];
      error?: string;
      [key: string]: any;
    }
  ): void {
    const crashMsg = `[SYSOP DEBUG] Door '${doorName}' CRASHED`;
    let details = '';

    if (crashInfo.pc !== undefined) {
      details += `\n  PC (Program Counter): 0x${crashInfo.pc.toString(16)}`;
    }
    if (crashInfo.sp !== undefined) {
      details += `\n  SP (Stack Pointer): 0x${crashInfo.sp.toString(16)}`;
    }
    if (crashInfo.error) {
      details += `\n  Error: ${crashInfo.error}`;
    }
    if (crashInfo.lastInstructions && crashInfo.lastInstructions.length > 0) {
      details += `\n  Last instructions:\n    ${crashInfo.lastInstructions.join('\n    ')}`;
    }

    const fullMsg = crashMsg + details;

    // Always log to backend
    console.error(fullMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      const color = this.getSeverityColor(DebugSeverity.CRITICAL);
      socket.emit('ansi-output', `\r\n${color}${fullMsg}\x1b[0m\r\n`);
      socket.emit('ansi-output', `\x1b[${DebugSeverity.WARNING}mYou can paste this information to Claude for debugging.\x1b[0m\r\n`);
    }
  }
}
