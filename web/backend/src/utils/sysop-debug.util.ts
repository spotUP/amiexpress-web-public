/**
 * Sysop Debug Utility
 * Provides debug messages to sysops for troubleshooting file I/O and door issues
 */

export class SysopDebugUtil {
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
    error: Error | string
  ): void {
    const errorMsg = typeof error === 'string' ? error : error.message;
    const debugMsg = `[SYSOP DEBUG] File ${operation} failed: ${filePath}\n  Error: ${errorMsg}`;

    // Always log to backend
    console.error(debugMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      socket.emit('ansi-output', `\r\n\x1b[33m${debugMsg}\x1b[0m\r\n`);
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
    details?: any
  ): void {
    const debugMsg = `[SYSOP DEBUG] Door '${doorName}': ${issue}`;
    const detailsMsg = details ? `\n  Details: ${JSON.stringify(details, null, 2)}` : '';

    // Always log to backend
    console.error(debugMsg + detailsMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      socket.emit('ansi-output', `\r\n\x1b[33m${debugMsg}${detailsMsg}\x1b[0m\r\n`);
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
    details?: any
  ): void {
    const debugMsg = `[SYSOP DEBUG] ${category}: ${message}`;
    const detailsMsg = details ? `\n  Details: ${JSON.stringify(details, null, 2)}` : '';

    // Always log to backend
    console.log(debugMsg + detailsMsg);

    // Send to terminal if sysop
    if (this.isSysop(session) && socket) {
      socket.emit('ansi-output', `\r\n\x1b[36m${debugMsg}${detailsMsg}\x1b[0m\r\n`);
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
      socket.emit('ansi-output', `\r\n\x1b[33m${warnMsg}\x1b[0m\r\n`);
    }
  }
}
