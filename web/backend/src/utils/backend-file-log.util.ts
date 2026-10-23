/**
 * backend-file-log.util.ts
 *
 * Tee console output to `logs/backend.log`.
 *
 * WHY: the container runs `exec npx tsx src/index.ts`, so everything the board
 * logs goes to docker's stdout and NOWHERE ELSE. It dies with the container.
 * On 2026-09-08 a caller reported a failing upload, the container was recreated
 * before anyone looked, and the evidence was simply gone - twice.
 *
 * Worse, the admin's own log viewer (api/config-routes.ts) reads
 * `logs/backend.log`, and in production nothing had written that file since
 * 22 April. The sysop was looking at a frozen file and had no way to know.
 *
 * CAPPED ON PURPOSE. The same directory held an 8.1 GB `filehandle-debug.log`
 * - 10% of the live disk - because a debug write had no ceiling. This one
 * rotates at MAX_BYTES and keeps a single previous generation. Logging must
 * never be the thing that fills a disk, and must never throw into a caller.
 */

import * as fs from 'fs';
import * as path from 'path';
import { isLogGateNoop } from './log-level.util';

const MAX_BYTES = 32 * 1024 * 1024; // 32 MB, then rotate to .1
let logPath: string | null = null;
let installed = false;
let writtenSinceCheck = 0;

function rotateIfBig(): void {
  // Only stat every ~1 MB of writes: statting on every console.log would put a
  // syscall in front of every line the board prints.
  if (writtenSinceCheck < 1024 * 1024) return;
  writtenSinceCheck = 0;
  try {
    if (!logPath) return;
    const { size } = fs.statSync(logPath);
    if (size < MAX_BYTES) return;
    fs.renameSync(logPath, `${logPath}.1`); // one generation, not a pile
  } catch {
    /* rotation is best effort */
  }
}

function format(level: string, args: unknown[]): string {
  const text = args
    .map(a => {
      if (typeof a === 'string') return a;
      try {
        return typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  return `${new Date().toISOString()} ${level} ${text}\n`;
}

/**
 * Start teeing console output to `<dataDir>/logs/backend.log`.
 *
 * Idempotent. Never throws: a logging failure must not take the board down,
 * and console still works exactly as before either way.
 */
export function installBackendFileLog(dataDir: string): void {
  if (installed) return;
  try {
    const dir = path.join(dataDir, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, 'backend.log');
    // Prove the sink works before we claim it does.
    fs.appendFileSync(logPath, format('[INFO]', ['[backend-log] file logging started']));
  } catch {
    logPath = null;
    return; // no writable log dir: leave console untouched
  }

  installed = true;
  const levels: Array<['log' | 'info' | 'warn' | 'error', string]> = [
    ['log', '[LOG]'],
    ['info', '[INFO]'],
    ['warn', '[WARN]'],
    ['error', '[ERROR]'],
  ];

  for (const [method, label] of levels) {
    // A method the LOG_LEVEL gate silenced stays silent: its lines are never
    // written to backend.log either.
    if (isLogGateNoop(console[method])) continue;
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(...args); // stdout first: docker logs must not lose a line
      try {
        if (!logPath) return;
        const line = format(label, args);
        fs.appendFileSync(logPath, line);
        writtenSinceCheck += line.length;
        rotateIfBig();
      } catch {
        /* never let logging break the caller */
      }
    };
  }
}

/** Test seam: forget the installed state. */
export function __resetBackendFileLogForTests(): void {
  installed = false;
  logPath = null;
  writtenSinceCheck = 0;
}
