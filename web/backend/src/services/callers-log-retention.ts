/**
 * CallersLog retention - the lines that say where a caller connected from,
 * and the password he typed, go after `maxAgeDays` (the sysop's decision of
 * 2026-10-04: 90 days). Everything else in the log stays, byte for byte.
 *
 * The lines it removes:
 *
 *   `\tTelnet login address: <host> (<ip>)`   express.e:16048 (LOG_HOST),
 *                                              services/login-post.service.ts
 *   `\tFTP Command >: PORT|EPRT ...`          the FTP command log carries the
 *                                              client's address in these two
 *   `\tPassword Failure (<typed>)`            express.e:30030 with SHOWPWFAIL
 *                                              (command.handler.ts login,
 *                                              new-user.handler.ts) - only when
 *                                              it holds what was typed: the
 *                                              masked `(xxxx)` and
 *                                              `\t* Password Failure *`
 *                                              (express.e:29264) carry nothing
 *                                              and stay, as GLCUpdater and
 *                                              SAmiLog count them.
 *
 * A CallersLog line carries no date of its own (express.e:9493 callersLog
 * adds nothing): it belongs to the call it is in, and the call is dated by
 * its logon line (express.e:16034-16042, `MM-DD-YY (HH:MM:SS) [slot] ...`),
 * the first line after the divider. A call block without a logon line is
 * dated by its first dated line (a logoff line, or the `DD-Mon-YY HH:MM `
 * stamp this port once put in front of every line, which such a line keeps
 * as its own date). A block with no date at all takes the NEXT dated block's
 * date - the log is appended in time order, so that is the latest the block
 * can be, and a line is only removed when even that is too old. Nothing
 * dated after it either: the line is kept.
 *
 * The file is read and written as Latin-1, so every byte a door or an Amiga
 * wrote round-trips unchanged; only whole lines (with their own terminator)
 * are dropped.
 */

import * as fs from 'fs';
import * as path from 'path';

export const DEFAULT_CALLERS_LOG_MAX_AGE_DAYS = 90;

/** express.e's divider (CallersLogManager.CALLERS_LOG_DIVIDER), any length of stars. */
const DIVIDER = /^\*{20,}\s*$/;
/** The logon line (express.e:16034-16042) - and logoffLog's (9467-9471): MM-DD-YY (HH:MM:SS). */
const EXPRESS_DATE = /^(\d\d)-(\d\d)-(\d\d) \(\d\d:\d\d:\d\d\) /;
const LOGON_LINE = /^\d\d-\d\d-\d\d \(\d\d:\d\d:\d\d\) (NEW )?\[\d+\] /;
/** The port's old per-line stamp, `04-Oct-26 17:37 `. */
const LEGACY_STAMP = /^(\d\d)-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d\d) \d\d:\d\d /;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ADDRESS_LINE = /\tTelnet login address: |\tFTP Command >: (PORT|EPRT)\b/i;
const PASSWORD_LINE = /\tPassword Failure \((.*)\)\s*$/;

export type RetentionKind = 'address' | 'password';

/** Which retention rule a line falls under, or null for a line that always stays. */
export function retentionKind(line: string): RetentionKind | null {
  const text = line.replace(/\r?\n$/, '');
  if (ADDRESS_LINE.test(text)) return 'address';
  const pw = PASSWORD_LINE.exec(text);
  if (pw && pw[1] !== 'xxxx') return 'password';
  return null;
}

function year(yy: string): number {
  const n = parseInt(yy, 10);
  // AmigaDOS dates start in 1978.
  return n < 78 ? 2000 + n : 1900 + n;
}

/** The day a line names, at local midnight, or null when it names none. */
function lineDate(text: string): number | null {
  const e = EXPRESS_DATE.exec(text);
  if (e) return new Date(year(e[3]), parseInt(e[1], 10) - 1, parseInt(e[2], 10)).getTime();
  const l = LEGACY_STAMP.exec(text);
  if (l) return new Date(year(l[3]), MONTHS.indexOf(l[2]), parseInt(l[1], 10)).getTime();
  return null;
}

export interface PruneCounts {
  address: number;
  password: number;
  /** Lines a rule matched that could not be dated, and so were kept. */
  undatedKept: number;
}

export interface PruneResult extends PruneCounts {
  bytes: Buffer;
  changed: boolean;
}

/**
 * The log without its address and typed-password lines older than
 * `maxAgeDays` before `now` (by calendar day).
 */
export function pruneCallersLog(input: Buffer, now: Date, maxAgeDays: number = DEFAULT_CALLERS_LOG_MAX_AGE_DAYS): PruneResult {
  const text = input.toString('latin1');
  // Each line with its own terminator, so what is kept is the bytes it was.
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - maxAgeDays).getTime();

  // Call blocks: a divider starts one.
  const blockOf: number[] = [];
  const blockDates: Array<number | null> = [];
  const blockHasLogon: boolean[] = [];
  let block = 0;
  blockDates.push(null);
  blockHasLogon.push(false);
  for (const raw of lines) {
    const t = raw.replace(/\r?\n$/, '');
    if (DIVIDER.test(t)) {
      block++;
      blockDates.push(null);
      blockHasLogon.push(false);
    }
    blockOf.push(block);
    const d = lineDate(t);
    if (d === null) continue;
    if (LOGON_LINE.test(t) && !blockHasLogon[block]) {
      blockDates[block] = d;
      blockHasLogon[block] = true;
    } else if (blockDates[block] === null) {
      blockDates[block] = d;
    }
  }
  // An undated block takes the next dated block's date: the latest it can be.
  for (let b = blockDates.length - 2; b >= 0; b--) {
    if (blockDates[b] === null) blockDates[b] = blockDates[b + 1];
  }

  const counts: PruneCounts = { address: 0, password: 0, undatedKept: 0 };
  const kept: string[] = [];
  lines.forEach((raw, i) => {
    const kind = retentionKind(raw);
    if (!kind) { kept.push(raw); return; }
    const date = lineDate(raw.replace(/\r?\n$/, '')) ?? blockDates[blockOf[i]];
    if (date === null) { counts.undatedKept++; kept.push(raw); return; }
    if (date < cutoff) { counts[kind]++; return; }
    kept.push(raw);
  });

  const changed = counts.address + counts.password > 0;
  return { ...counts, changed, bytes: changed ? Buffer.from(kept.join(''), 'latin1') : input };
}

export interface FileRetentionReport extends PruneCounts {
  path: string;
  beforeBytes: number;
  afterBytes: number;
  error?: string;
}

/**
 * Every Node<n>/CallersLog and Node<n>/CLogBackup under `dataDir`, whatever
 * their case (a node directory can hold both `CallersLog` and `callerslog`).
 */
export function callersLogFiles(dataDir: string): string[] {
  const found: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dataDir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const node of entries) {
    if (!node.isDirectory() || !/^node\d+$/i.test(node.name)) continue;
    const nodeDir = path.join(dataDir, node.name);
    let files: fs.Dirent[] = [];
    try {
      files = fs.readdirSync(nodeDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.isFile() && /^(callerslog|clogbackup)$/i.test(f.name)) found.push(path.join(nodeDir, f.name));
    }
  }
  return found.sort();
}

/**
 * One retention pass over the board's CallersLogs. `dryRun` reports what it
 * would remove and writes nothing.
 */
export function runCallersLogRetention(
  dataDir: string,
  options: { now?: Date; maxAgeDays?: number; dryRun?: boolean } = {},
): FileRetentionReport[] {
  const now = options.now ?? new Date();
  const maxAgeDays = options.maxAgeDays ?? DEFAULT_CALLERS_LOG_MAX_AGE_DAYS;
  const reports: FileRetentionReport[] = [];
  for (const file of callersLogFiles(dataDir)) {
    try {
      const before = fs.readFileSync(file);
      const result = pruneCallersLog(before, now, maxAgeDays);
      let afterBytes = result.bytes.length;
      if (result.changed && !options.dryRun) {
        // Synchronous from read to write, so no line this process appends
        // lands in between; a line another writer appended since the read
        // is carried over as it is.
        const current = fs.readFileSync(file);
        const appended = current.length > before.length && current.subarray(0, before.length).equals(before)
          ? current.subarray(before.length)
          : Buffer.alloc(0);
        const out = Buffer.concat([result.bytes, appended]);
        // In place (truncate + write), so the file keeps its inode and owner.
        fs.writeFileSync(file, out);
        afterBytes = out.length;
      }
      reports.push({
        path: file,
        beforeBytes: before.length,
        afterBytes,
        address: result.address,
        password: result.password,
        undatedKept: result.undatedKept,
      });
    } catch (error) {
      reports.push({
        path: file, beforeBytes: 0, afterBytes: 0, address: 0, password: 0, undatedKept: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return reports;
}
