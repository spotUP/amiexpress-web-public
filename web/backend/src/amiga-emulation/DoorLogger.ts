/**
 * DoorLogger - Per-door logging for 68K door sessions
 *
 * Each door session gets its own log file:
 *   logs/door-68k-{DOORNAME}-{TIMESTAMP}.log
 *
 * This makes debugging much easier by separating logs per door.
 */

import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import * as path from 'path';

export class DoorLogger {
  private logPath: string;
  private doorName: string;
  private sessionId: string;
  private startTime: Date;
  private enabled: boolean = true;

  constructor(doorName: string, nodeId?: number | string) {
    console.log(`[DoorLogger] Creating logger for door: ${doorName} node: ${nodeId}`);
    this.doorName = doorName.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.startTime = new Date();

    // Create session ID: YYYYMMDD-HHMMSS-node#
    const ts = this.startTime.toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 15); // YYYYMMDDHHMMSS
    const node = nodeId !== undefined ? `-N${nodeId}` : '';
    this.sessionId = `${ts}${node}`;

    // Log file: logs/door-68k-{DOORNAME}-{SESSION}.log
    // Navigate from web/backend/src/amiga-emulation to project root (4 levels up)
    // __dirname = .../web/backend/src/amiga-emulation
    const projectRoot = path.resolve(__dirname, '../../../..');
    const logsDir = path.join(projectRoot, 'logs');
    console.log(`[DoorLogger] __dirname: ${__dirname}, projectRoot: ${projectRoot}, logs dir: ${logsDir}`);
    if (!amigafs.existsSync(logsDir)) {
      amigafs.mkdirSync(logsDir, { recursive: true });
    }

    this.logPath = path.join(logsDir, `door-68k-${this.doorName}-${this.sessionId}.log`);

    // Write header
    this.writeRaw(`=== 68K Door Session Log ===`);
    this.writeRaw(`Door: ${doorName}`);
    this.writeRaw(`Started: ${this.startTime.toISOString()}`);
    this.writeRaw(`Node: ${nodeId ?? 'N/A'}`);
    this.writeRaw(`Log: ${this.logPath}`);
    this.writeRaw(`${'='.repeat(50)}\n`);
  }

  /** Get the log file path */
  getLogPath(): string {
    return this.logPath;
  }

  /** Enable/disable logging */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Write raw text without timestamp */
  private writeRaw(message: string): void {
    if (!this.enabled) return;
    try {
      amigafs.appendFileSync(this.logPath, message + '\n', { encoding: 'utf8' });
    } catch {
      /* ignore write errors */
    }
  }

  /** Log with timestamp and tag */
  log(tag: string, message: string): void {
    if (!this.enabled) return;
    const elapsed = Date.now() - this.startTime.getTime();
    const ts = `+${(elapsed / 1000).toFixed(3).padStart(8, '0')}s`;
    const line = `[${ts}] [${tag}] ${message}`;
    this.writeRaw(line);
  }

  /** Log info level */
  info(message: string): void {
    this.log('INFO', message);
  }

  /** Log debug level */
  debug(message: string): void {
    this.log('DEBUG', message);
  }

  /** Log warning level */
  warn(message: string): void {
    this.log('WARN', message);
  }

  /** Log error level */
  error(message: string): void {
    this.log('ERROR', message);
  }

  /** Log CPU state */
  cpu(pc: number, d0: number, a0: number, sp: number, a4?: number, extra?: string): void {
    let msg = `PC=0x${pc.toString(16)} D0=0x${d0.toString(16)} A0=0x${a0.toString(16)} SP=0x${sp.toString(16)}`;
    if (a4 !== undefined) {
      msg += ` A4=0x${a4.toString(16)}`;
    }
    if (extra) {
      msg += ` ${extra}`;
    }
    this.log('CPU', msg);
  }

  /** Log library call */
  libCall(library: string, func: string, offset: number, args?: string): void {
    let msg = `${library}::${func} (offset -${Math.abs(offset)})`;
    if (args) {
      msg += ` ${args}`;
    }
    this.log('LIB', msg);
  }

  /** Log file operation */
  file(op: string, path: string, result?: string): void {
    let msg = `${op} "${path}"`;
    if (result) {
      msg += ` -> ${result}`;
    }
    this.log('FILE', msg);
  }

  /** Log XIM protocol message */
  xim(direction: 'TX' | 'RX', cmd: number | string, data?: string): void {
    let msg = `${direction} cmd=${cmd}`;
    if (data) {
      msg += ` ${data}`;
    }
    this.log('XIM', msg);
  }

  /** Log memory operation */
  mem(op: string, addr: number, size?: number, value?: number | string): void {
    let msg = `${op} 0x${addr.toString(16)}`;
    if (size !== undefined) {
      msg += ` size=${size}`;
    }
    if (value !== undefined) {
      msg += ` val=${typeof value === 'number' ? '0x' + value.toString(16) : value}`;
    }
    this.log('MEM', msg);
  }

  /** Log with hex dump of buffer */
  hexDump(tag: string, label: string, data: Buffer | Uint8Array, maxBytes: number = 64): void {
    const bytes = Array.from(data.slice(0, maxBytes));
    const hex = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = bytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    this.log(tag, `${label} [${data.length} bytes]: ${hex}${data.length > maxBytes ? '...' : ''}`);
    this.log(tag, `${label} ASCII: ${ascii}${data.length > maxBytes ? '...' : ''}`);
  }

  /** Mark end of session */
  end(exitCode?: number, reason?: string): void {
    const elapsed = Date.now() - this.startTime.getTime();
    this.writeRaw(`\n${'='.repeat(50)}`);
    this.writeRaw(`Session ended after ${(elapsed / 1000).toFixed(2)}s`);
    if (exitCode !== undefined) {
      this.writeRaw(`Exit code: ${exitCode} (D0)`);
    }
    if (reason) {
      this.writeRaw(`Reason: ${reason}`);
    }
    this.writeRaw(`${'='.repeat(50)}`);
  }
}

/** Global registry of active door loggers by session */
const activeLoggers = new Map<string, DoorLogger>();

/** Create or get a door logger for a session */
export function getDoorLogger(doorName: string, nodeId?: number | string): DoorLogger {
  const key = `${doorName}-${nodeId ?? 'default'}`;
  let logger = activeLoggers.get(key);
  if (!logger) {
    logger = new DoorLogger(doorName, nodeId);
    activeLoggers.set(key, logger);
  }
  return logger;
}

/** Remove a door logger from registry */
export function removeDoorLogger(doorName: string, nodeId?: number | string): void {
  const key = `${doorName}-${nodeId ?? 'default'}`;
  activeLoggers.delete(key);
}

/** Get all active loggers */
export function getActiveLoggers(): Map<string, DoorLogger> {
  return new Map(activeLoggers);
}
