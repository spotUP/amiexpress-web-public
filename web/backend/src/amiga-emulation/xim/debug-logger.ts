/**
 * XIM Protocol Debug Logger
 *
 * Provides detailed logging for XIM protocol debugging.
 * Enable with: XIM_DEBUG=1 environment variable
 */

import * as fs from 'fs';
import * as path from 'path';

class XIMDebugLogger {
  private enabled: boolean;
  private logPath: string;
  private sessionStart: Date;

  constructor() {
    this.enabled = process.env.XIM_DEBUG === '1' || process.env.XIM_DEBUG === 'true';
    this.sessionStart = new Date();
    this.logPath = path.join(process.cwd(), 'logs', 'xim-debug.log');

    if (this.enabled) {
      // Clear log file at start
      try {
        fs.writeFileSync(this.logPath, `\n\n=== XIM DEBUG SESSION START: ${this.sessionStart.toISOString()} ===\n\n`, 'utf8');
        console.log(`[XIM Debug] Logging enabled: ${this.logPath}`);
      } catch (e) {
        console.error(`[XIM Debug] Failed to initialize log file: ${e}`);
        this.enabled = false;
      }
    }
  }

  log(category: string, message: string, data?: any): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.sessionStart.getTime();

    let logLine = `[${timestamp}] [+${elapsed}ms] [${category}] ${message}`;

    if (data) {
      logLine += `\n  Data: ${JSON.stringify(data, null, 2)}`;
    }

    logLine += '\n';

    try {
      fs.appendFileSync(this.logPath, logLine, 'utf8');
    } catch (e) {
      // Silent fail
    }

    // Also log to console for immediate visibility
    console.log(`[XIM-DBG] [${category}] ${message}`, data || '');
  }

  logMessage(msgId: number, msgName: string, direction: 'SEND' | 'RECV', data?: any): void {
    if (!this.enabled) return;

    const arrow = direction === 'SEND' ? '→' : '←';
    this.log('XIM-MSG', `${arrow} ${msgName} (${msgId})`, data);
  }

  logFileOperation(operation: string, amiPath: string, sysPath?: string, result?: any): void {
    if (!this.enabled) return;

    this.log('FILE-OP', `${operation}: "${amiPath}"`, {
      amiPath,
      sysPath,
      result
    });
  }
}

export const ximDebugLogger = new XIMDebugLogger();
