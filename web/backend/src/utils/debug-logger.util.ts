/**
 * Debug Logger Utility
 * Provides structured, color-coded debug logging for session log viewer
 * Captures important BBS events: doors, screens, MCI, commands, auth, etc.
 */

import { sessionLogManager } from '../services/SessionLogManager';
import { getSystemTime } from '../utils/date-time.util';

export enum DebugCategory {
  DOOR = 'DOOR',
  SCREEN = 'SCREEN',
  MCI = 'MCI',
  COMMAND = 'COMMAND',
  AUTH = 'AUTH',
  FILE = 'FILE',
  CONFERENCE = 'CONF',
  MESSAGE = 'MSG',
  MENU = 'MENU',
  DATABASE = 'DB',
  TRANSFER = 'XFER',
  CHAT = 'CHAT',
  SYSTEM = 'SYS',
  ERROR = 'ERROR'
}

export enum DebugLevel {
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  SUCCESS = 'OK',
  WARNING = 'WARN',
  ERROR = 'ERROR',
  TRACE = 'TRACE'
}

interface DebugLogOptions {
  sessionId: string;
  category: DebugCategory;
  level: DebugLevel;
  message: string;
  data?: any;
  includeTimestamp?: boolean;
}

export class DebugLogger {
  private static enabled = true;

  /**
   * Get ANSI color code for category
   */
  private static getCategoryColor(category: DebugCategory): string {
    const colors: Record<DebugCategory, string> = {
      [DebugCategory.DOOR]: '\x1b[0;35m',      // Magenta
      [DebugCategory.SCREEN]: '\x1b[0;36m',    // Cyan
      [DebugCategory.MCI]: '\x1b[0;34m',       // Blue
      [DebugCategory.COMMAND]: '\x1b[0;33m',   // Yellow
      [DebugCategory.AUTH]: '\x1b[0;32m',      // Green
      [DebugCategory.FILE]: '\x1b[0;36m',      // Cyan
      [DebugCategory.CONFERENCE]: '\x1b[0;35m', // Magenta
      [DebugCategory.MESSAGE]: '\x1b[0;34m',   // Blue
      [DebugCategory.MENU]: '\x1b[0;33m',      // Yellow
      [DebugCategory.DATABASE]: '\x1b[0;36m',  // Cyan
      [DebugCategory.TRANSFER]: '\x1b[0;35m',  // Magenta
      [DebugCategory.CHAT]: '\x1b[0;32m',      // Green
      [DebugCategory.SYSTEM]: '\x1b[0;37m',    // White
      [DebugCategory.ERROR]: '\x1b[0;31m'      // Red
    };
    return colors[category] || '\x1b[0;37m';
  }

  /**
   * Get ANSI color code for level
   */
  private static getLevelColor(level: DebugLevel): string {
    const colors: Record<DebugLevel, string> = {
      [DebugLevel.INFO]: '\x1b[0;37m',     // White
      [DebugLevel.DEBUG]: '\x1b[0;36m',    // Cyan
      [DebugLevel.SUCCESS]: '\x1b[0;32m',  // Green
      [DebugLevel.WARNING]: '\x1b[0;33m',  // Yellow
      [DebugLevel.ERROR]: '\x1b[0;31m',    // Red
      [DebugLevel.TRACE]: '\x1b[0;90m'     // Gray
    };
    return colors[level] || '\x1b[0;37m';
  }

  /**
   * Format debug log message with ANSI colors
   */
  private static formatMessage(options: DebugLogOptions): string {
    const { category, level, message, data, includeTimestamp = true } = options;

    const timestamp = includeTimestamp
      ? `\x1b[0;90m[${getSystemTime().toISOString().substr(11, 12)}]\x1b[0m `
      : '';

    const categoryColor = this.getCategoryColor(category);
    const levelColor = this.getLevelColor(level);
    const resetColor = '\x1b[0m';

    const categoryTag = `${categoryColor}[${category}]${resetColor}`;
    const levelTag = `${levelColor}[${level}]${resetColor}`;

    let output = `${timestamp}${categoryTag} ${levelTag} ${message}`;

    // Add data if provided
    if (data !== undefined) {
      const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      output += `\n  ${resetColor}${dataStr}`;
    }

    return output + '\n';
  }

  /**
   * Log a debug message
   */
  static log(options: DebugLogOptions): void {
    if (!this.enabled) return;

    const formattedMessage = this.formatMessage(options);

    // Send to session log manager
    sessionLogManager.captureOutput(options.sessionId, formattedMessage);

    // Also log to console for server logs
console.log(`[DEBUG:${options.category}:${options.level}] ${options.message}`, options.data || '');
  }

  /**
   * Convenience methods for common logging patterns
   */

  static door(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.DOOR,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static doorSuccess(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.DOOR,
      level: DebugLevel.SUCCESS,
      message,
      data
    });
  }

  static doorError(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.DOOR,
      level: DebugLevel.ERROR,
      message,
      data
    });
  }

  static screen(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.SCREEN,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static mci(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.MCI,
      level: DebugLevel.DEBUG,
      message,
      data
    });
  }

  static mciSuccess(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.MCI,
      level: DebugLevel.SUCCESS,
      message,
      data
    });
  }

  static mciError(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.MCI,
      level: DebugLevel.ERROR,
      message,
      data
    });
  }

  static command(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.COMMAND,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static auth(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.AUTH,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static file(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.FILE,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static conference(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.CONFERENCE,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static message(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.MESSAGE,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static menu(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.MENU,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  static error(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.ERROR,
      level: DebugLevel.ERROR,
      message,
      data
    });
  }

  static warning(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.SYSTEM,
      level: DebugLevel.WARNING,
      message,
      data
    });
  }

  static system(sessionId: string, message: string, data?: any): void {
    this.log({
      sessionId,
      category: DebugCategory.SYSTEM,
      level: DebugLevel.INFO,
      message,
      data
    });
  }

  /**
   * Enable/disable debug logging
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if debug logging is enabled
   */
  static isEnabled(): boolean {
    return this.enabled;
  }
}
