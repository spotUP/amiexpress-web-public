/**
 * XIM Structured Logger
 *
 * Provides structured JSON logging for XIM protocol debugging.
 * Outputs to both console (human-readable) and JSON file (machine-readable).
 *
 * Environment variables:
 *   XIM_DEBUG=1          - Enable XIM logging (legacy format)
 *   XIM_DEBUG_JSON=1     - Enable structured JSON logging
 *   XIM_DEBUG_AMIGA=1    - Enable Amiga CONSOLE_DEBUG compatible format
 *   XIM_LOG_FILE=path    - Custom log file path (default: logs/xim-debug.json)
 *   XIM_AMIGA_LOG=path   - Amiga format log file (default: logs/xim-amiga.log)
 *
 * Amiga CONSOLE_DEBUG format (for direct comparison with real Amiga logs):
 *   <timestamp> execute syscmd: <command>
 *   <timestamp> setenvmsg: <envmsg>
 *   <timestamp> run door: <door_path>
 *   <timestamp> msg request: <command_number>
 *   <timestamp> data: <value>
 *   <timestamp> string: <value>
 */

import * as fs from 'fs';
import * as path from 'path';

export type XIMMessageType =
  | 'JH_INIT' | 'JH_STAT' | 'JH_TERMINATE' | 'JH_HK' | 'JH_SM'
  | 'JH_GNS' | 'JH_PROMPT' | 'JH_MORE' | 'JH_REQUEST' | 'JH_IGNORE';

export type XIMDirection = 'send' | 'receive';

export interface XIMLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  direction: XIMDirection;
  door: string;
  node: number;
  message: {
    type: XIMMessageType | string;
    typeCode: number;
    param?: number;
    dataLen?: number;
    data?: string | Buffer;
    dataHex?: string;
    dataText?: string;
  };
  port?: string;
  duration?: number;
  error?: string;
  context?: Record<string, any>;
}

export class XIMLogger {
  private static instance: XIMLogger;
  private enabled: boolean;
  private jsonEnabled: boolean;
  private amigaEnabled: boolean;
  private logFile: string;
  private amigaLogFile: string;
  private logStream: fs.WriteStream | null = null;
  private amigaLogStream: fs.WriteStream | null = null;
  private messageCount = 0;
  private errorCount = 0;
  private startTime = Date.now();

  private constructor() {
    this.enabled = process.env.XIM_DEBUG === '1';
    this.jsonEnabled = process.env.XIM_DEBUG_JSON === '1';
    this.amigaEnabled = process.env.XIM_DEBUG_AMIGA === '1';

    // Use BBS_DATA_DIR or project root for log file path
    const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../../..');
    this.logFile = process.env.XIM_LOG_FILE || path.join(bbsRoot, 'logs', 'xim-debug.json');
    this.amigaLogFile = process.env.XIM_AMIGA_LOG || path.join(bbsRoot, 'logs', 'xim-amiga.log');

    if (this.jsonEnabled) {
console.log(`[XIMLogger] JSON logging enabled, writing to: ${this.logFile}`);
      this.initLogStream();
    }

    if (this.amigaEnabled) {
console.log(`[XIMLogger] Amiga CONSOLE_DEBUG format enabled, writing to: ${this.amigaLogFile}`);
      this.initAmigaLogStream();
    }
  }

  static getInstance(): XIMLogger {
    if (!XIMLogger.instance) {
      XIMLogger.instance = new XIMLogger();
    }
    return XIMLogger.instance;
  }

  private initLogStream() {
    try {
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Rotate log if it's too large (>10MB)
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > 10 * 1024 * 1024) {
          const backup = `${this.logFile}.${Date.now()}.old`;
          fs.renameSync(this.logFile, backup);
        }
      }

      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.log('info', 'send', 'SYSTEM', 0, {
        type: 'LOG_START',
        typeCode: 0,
      }, { message: 'XIM structured logging initialized' });
    } catch (err) {
console.error('[XIMLogger] Failed to initialize log stream:', err);
    }
  }

  private initAmigaLogStream() {
    try {
      const dir = path.dirname(this.amigaLogFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Rotate log if it's too large (>10MB)
      if (fs.existsSync(this.amigaLogFile)) {
        const stats = fs.statSync(this.amigaLogFile);
        if (stats.size > 10 * 1024 * 1024) {
          const backup = `${this.amigaLogFile}.${Date.now()}.old`;
          fs.renameSync(this.amigaLogFile, backup);
        }
      }

      this.amigaLogStream = fs.createWriteStream(this.amigaLogFile, { flags: 'a' });
    } catch (err) {
console.error('[XIMLogger] Failed to initialize Amiga log stream:', err);
    }
  }

  /**
   * Get Unix timestamp in seconds (matches Amiga DateStamp format)
   */
  private getAmigaTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Write a line in Amiga CONSOLE_DEBUG format
   */
  private writeAmigaLog(line: string) {
    if (this.amigaEnabled && this.amigaLogStream) {
      this.amigaLogStream.write(line + '\n');
    }
  }

  /**
   * Log syscmd execution (Amiga format)
   * Format: <timestamp> execute syscmd: <command>
   */
  logExecuteSysCmd(command: string) {
    const ts = this.getAmigaTimestamp();
    this.writeAmigaLog(`${ts} execute syscmd: ${command}`);
  }

  /**
   * Log environment message set (Amiga format)
   * Format: <timestamp> setenvmsg: <envmsg>
   */
  logSetEnvMsg(envmsg: string) {
    const ts = this.getAmigaTimestamp();
    this.writeAmigaLog(`${ts} setenvmsg: ${envmsg}`);
  }

  /**
   * Log door execution (Amiga format)
   * Format: <timestamp> run door: <door_path>
   */
  logRunDoor(doorPath: string) {
    const ts = this.getAmigaTimestamp();
    this.writeAmigaLog(`${ts} run door: ${doorPath}`);
  }

  /**
   * Log XIM message request in Amiga CONSOLE_DEBUG format
   * Format:
   *   <timestamp> msg request: <command_number>
   *   <timestamp> data: <value>
   *   <timestamp> string: <value>
   *
   * For multi-line strings, the content appears on subsequent lines after "string:"
   */
  logAmigaMessage(command: number, data: number, stringValue: string) {
    const ts = this.getAmigaTimestamp();
    this.writeAmigaLog(`${ts} msg request: ${command}`);
    this.writeAmigaLog(`${ts} data: ${data}`);

    // Handle multi-line strings like Amiga does:
    // Short strings on same line, long/multi-line on next line
    if (stringValue.includes('\n') || stringValue.length > 60) {
      this.writeAmigaLog(`${ts} string: `);
      this.writeAmigaLog(stringValue);
    } else {
      this.writeAmigaLog(`${ts} string: ${stringValue}`);
    }
  }

  /**
   * Check if Amiga logging is enabled
   */
  isAmigaEnabled(): boolean {
    return this.amigaEnabled;
  }

  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    direction: XIMDirection,
    door: string,
    node: number,
    message: {
      type: XIMMessageType | string;
      typeCode: number;
      param?: number;
      dataLen?: number;
      data?: string | Buffer;
    },
    context?: Record<string, any>
  ) {
    this.messageCount++;
    if (level === 'error') this.errorCount++;

    const entry: XIMLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      direction,
      door,
      node,
      message: {
        type: message.type,
        typeCode: message.typeCode,
        param: message.param,
        dataLen: message.dataLen,
      },
      context,
    };

    // Add data fields if present
    if (message.data !== undefined) {
      if (Buffer.isBuffer(message.data)) {
        entry.message.dataHex = message.data.toString('hex');
        entry.message.dataText = message.data.toString('utf-8', 0, Math.min(100, message.data.length));
      } else {
        entry.message.dataText = message.data;
      }
    }

    // Write to JSON log
    if (this.jsonEnabled) {
      this.ensureJsonLogStream();
    }
    if (this.jsonEnabled && this.logStream) {
      this.logStream.write(JSON.stringify(entry) + '\n');
    } else if (message.type !== 'LOG_START' && message.type !== 'LOG_END') {
      // Debug: log why XIM messages aren't being written
console.log(`[XIMLogger] NOT writing to JSON: jsonEnabled=${this.jsonEnabled} logStream=${!!this.logStream} type=${message.type}`);
    }

    // Write to console (human-readable)
    if (this.enabled || this.jsonEnabled) {
      this.logToConsole(entry);
    }
  }

  private ensureJsonLogStream() {
    if (!this.jsonEnabled) {
      return;
    }
    const logMissing = !fs.existsSync(this.logFile);
    if (!this.logStream || logMissing) {
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }
      this.initLogStream();
    }
  }

  private logToConsole(entry: XIMLogEntry) {
    const arrow = entry.direction === 'send' ? '→' : '←';
    const color = this.getColor(entry.level, entry.direction);
    const reset = '\x1b[0m';

    let output = `${color}[${this.formatTime(entry.timestamp)}] `;
    output += `${arrow} ${entry.message.type.padEnd(12)} `;
    output += `| ${entry.door.padEnd(15)} `;
    output += `| Node${entry.node}`;

    if (entry.message.param !== undefined) {
      output += ` | param=${entry.message.param}`;
    }

    if (entry.message.dataLen !== undefined) {
      output += ` | len=${entry.message.dataLen}`;
    }

    if (entry.message.dataText) {
      const preview = entry.message.dataText.substring(0, 50);
      output += ` | "${preview}${entry.message.dataText.length > 50 ? '...' : ''}"`;
    }

    if (entry.error) {
      output += ` | ERROR: ${entry.error}`;
    }

    if (entry.context?.message) {
      output += ` | ${entry.context.message}`;
    }

    output += reset;
console.log(output);
  }

  private getColor(level: string, direction: XIMDirection): string {
    if (level === 'error') return '\x1b[0;31m'; // Red
    if (level === 'warn') return '\x1b[0;33m'; // Yellow
    if (direction === 'send') return '\x1b[0;36m'; // Cyan
    return '\x1b[0;32m'; // Green
  }

  private formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toTimeString().split(' ')[0] + '.' + date.getMilliseconds().toString().padStart(3, '0');
  }

  logError(door: string, node: number, error: string, context?: Record<string, any>) {
    this.log('error', 'receive', door, node, {
      type: 'ERROR',
      typeCode: -1,
    }, { ...context, error });
  }

  logWarning(door: string, node: number, message: string, context?: Record<string, any>) {
    this.log('warn', 'receive', door, node, {
      type: 'WARNING',
      typeCode: -1,
    }, { ...context, message });
  }

  logTimeout(door: string, node: number, waitingFor: string, duration: number) {
    this.log('warn', 'receive', door, node, {
      type: 'TIMEOUT',
      typeCode: -1,
    }, {
      message: `No response for ${duration}ms (waiting for ${waitingFor})`,
      duration,
      waitingFor,
    });
  }

  logStats() {
    const uptime = Date.now() - this.startTime;
console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    XIM Protocol Statistics                    ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log(`  Total Messages: ${this.messageCount}`);
console.log(`  Errors: ${this.errorCount}`);
console.log(`  Uptime: ${Math.floor(uptime / 1000)}s`);
console.log(`  Log File: ${this.logFile}`);
console.log('');
  }

  close() {
    if (this.logStream) {
      this.log('info', 'send', 'SYSTEM', 0, {
        type: 'LOG_END',
        typeCode: 0,
      }, {
        message: 'XIM structured logging shutdown',
        stats: {
          messageCount: this.messageCount,
          errorCount: this.errorCount,
          uptime: Date.now() - this.startTime,
        }
      });
      this.logStream.end();
      this.logStream = null;
    }
    if (this.amigaLogStream) {
      this.amigaLogStream.end();
      this.amigaLogStream = null;
    }
  }
}

// Singleton instance
export const ximLogger = XIMLogger.getInstance();

// Cleanup on process exit
process.on('exit', () => {
  ximLogger.close();
});

process.on('SIGINT', () => {
  ximLogger.close();
  process.exit(0);
});
