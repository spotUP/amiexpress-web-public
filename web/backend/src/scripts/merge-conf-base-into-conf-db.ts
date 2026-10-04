/**
 * Merge the `conf_base` SQL table into the callers' Conf.DB records, once.
 *
 * Until 2026-10-04 the board kept a caller's message pointers and scan flags
 * in `conf_base` and treated each conference's Conf.DB as a best-effort copy.
 * From then on the board reads and writes Conf.DB, as express.e does
 * (loadMsgPointers / saveMsgPointers, express.e:4882-4973), and `conf_base`
 * only mirrors it. On the live board the two copies had drifted apart in BOTH
 * directions, so switching the reader alone would have moved callers'
 * pointers back and turned scans off. This carries the SQL side across
 * without losing anything the disk side has:
 *
 *   confRead (scan pointer)  := max(SQL last_new_read_conf, disk)
 *   confYM   (read pointer)  := max(SQL last_msg_read_conf, disk)
 *   handle[0]                := disk | (SQL scan_flags & (MAIL|FILE|ZOOM))
 *
 * Nothing else in the record is touched. Only the scan masks of axconsts.e:
 * 45-47 are taken from SQL: the port's CM once wrote 128 and 64 for mail and
 * file scan into `scan_flags`, and 128 on disk means MAILSCAN_ALL.
 *
 * Rows are skipped when the account has no slot, or when the row's message
 * base belongs to another conference (stray rows the old code inserted).
 * Every write goes through MessagePointerFileManager - the LOCATION and
 * CONFDB_SHARED aware path to the 74-byte record - and each Conf.DB is
 * copied to `<file>.pre-merge-<date>.backup` before its first change.
 * A second run finds nothing to change.
 *
 *     npx tsx src/scripts/merge-conf-base-into-conf-db.ts --dry-run
 *         Print what would change per conference, write nothing.
 *
 *     npx tsx src/scripts/merge-conf-base-into-conf-db.ts
 *         Do it.
 *
 *     --root <path>    the board (default: BBS_DATA_DIR, as the board uses)
 *     --db <file>      the SQLite file (default: DATABASE_DIR/DATABASE_FILE, as the board opens it)
 *     --date <stamp>   the date in the backup names (default: today)
 */
import * as fs from 'fs';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';

import {
  MessagePointerFileManager,
  scanFlagsOf,
  withScanFlags,
} from '../services/MessagePointerFileManager';
import { boardRoot } from '../utils/board-root.util';

/** axconsts.e:45-47 - ZOOM_SCAN_MASK | MAIL_SCAN_MASK | FILE_SCAN_MASK. */
export const SQL_SCAN_BITS = 2 | 4 | 8;
const BIT_NAMES: Array<[number, string]> = [[4, 'mail'], [8, 'file'], [2, 'zoom']];

export interface MergeOptions {
  root?: string;
  db?: string;
  dryRun: boolean;
  date?: string;
}

export function parseMergeArgs(argv: string[]): MergeOptions {
  const opts: MergeOptions = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') opts.dryRun = true;
    else if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--db') opts.db = argv[++i];
    else if (argv[i] === '--date') opts.date = argv[++i];
  }
  return opts;
}

/** The SQLite file the board opens (database.ts: DATABASE_DIR / DATABASE_FILE). */
export function defaultDbPath(): string {
  const dir = process.env.DATABASE_DIR || path.join(process.cwd(), 'data');
  return path.join(dir, process.env.DATABASE_FILE || 'amiexpress.db');
}

/** What SQL says for one caller in one conference, all of his rows there combined. */
interface SqlSide {
  conf: number;
  slot: number;
  name: string;
  scan: number;
  read: number;
  bits: number;
}

/** One record's change. */
export interface RecordChange {
  conf: number;
  slot: number;
  name: string;
  scan: { from: number; to: number };
  read: { from: number; to: number };
  flags: { from: number; to: number };
}

export function readSqlSide(dbFile: string): { rows: SqlSide[]; skipped: { noSlot: number; stray: number } } {
  const db = new BetterSqlite3(dbFile, { readonly: true, fileMustExist: true });
  try {
    const users = new Map<string, { slot: number; name: string }>();
    for (const u of db.prepare('SELECT id, slotnumber, username FROM users').all() as Array<{ id: string; slotnumber: number | null; username: string }>) {
      users.set(String(u.id), { slot: Number(u.slotnumber) || 0, name: u.username });
    }
    const baseConf = new Map<number, number>();
    for (const b of db.prepare('SELECT id, conferenceid FROM message_bases').all() as Array<{ id: number; conferenceid: number }>) {
      baseConf.set(Number(b.id), Number(b.conferenceid));
    }

    const merged = new Map<string, SqlSide>();
    const skipped = { noSlot: 0, stray: 0 };
    const rows = db.prepare(
      'SELECT user_id, conference_id, message_base_id, last_new_read_conf, last_msg_read_conf, scan_flags FROM conf_base',
    ).all() as Array<{ user_id: string; conference_id: number; message_base_id: number; last_new_read_conf: number | null; last_msg_read_conf: number | null; scan_flags: number | null }>;
    for (const r of rows) {
      const conf = Number(r.conference_id);
      if (baseConf.get(Number(r.message_base_id)) !== conf) { skipped.stray++; continue; }
      const user = users.get(String(r.user_id));
      if (!user || user.slot < 1) { skipped.noSlot++; continue; }
      const key = `${conf}:${user.slot}`;
      const prev = merged.get(key);
      const scan = Number(r.last_new_read_conf) || 0;
      const read = Number(r.last_msg_read_conf) || 0;
      const bits = (Number(r.scan_flags) || 0) & SQL_SCAN_BITS;
      merged.set(key, prev
        ? { ...prev, scan: Math.max(prev.scan, scan), read: Math.max(prev.read, read), bits: prev.bits | bits }
        : { conf, slot: user.slot, name: user.name, scan, read, bits });
    }
    return { rows: [...merged.values()].sort((a, b) => a.conf - b.conf || a.slot - b.slot), skipped };
  } finally {
    db.close();
  }
}

/** The changes the merge rule makes against the records on disk now. Empty = nothing to do. */
export function planMerge(mgr: MessagePointerFileManager, sql: SqlSide[]): RecordChange[] {
  const changes: RecordChange[] = [];
  for (const s of sql) {
    const rec = mgr.readRecordOrZero(s.conf, s.slot);
    const flags = scanFlagsOf(rec);
    const change: RecordChange = {
      conf: s.conf, slot: s.slot, name: s.name,
      scan: { from: rec.confRead, to: Math.max(rec.confRead, s.scan) },
      read: { from: rec.confYM, to: Math.max(rec.confYM, s.read) },
      flags: { from: flags, to: flags | s.bits },
    };
    if (change.scan.to !== change.scan.from || change.read.to !== change.read.from || change.flags.to !== change.flags.from) {
      changes.push(change);
    }
  }
  return changes;
}

/** Back each touched Conf.DB up once, then write the changes through the manager. */
export function applyMerge(mgr: MessagePointerFileManager, changes: RecordChange[], date: string): string[] {
  const backups: string[] = [];
  const backedUp = new Set<string>();
  for (const c of changes) {
    const file = mgr.getConfDbPath(c.conf);
    if (!backedUp.has(file)) {
      backedUp.add(file);
      const backup = `${file}.pre-merge-${date}.backup`;
      // The first copy of the day is the one taken before any change; a
      // later run that same day must not overwrite it with a merged file.
      if (fs.existsSync(file) && !fs.existsSync(backup)) {
        fs.copyFileSync(file, backup);
        backups.push(backup);
      }
    }
    const rec = mgr.readRecordOrZero(c.conf, c.slot);
    mgr.patchRecord(c.conf, c.slot, {
      confRead: c.scan.to,
      confYM: c.read.to,
      handle: withScanFlags(rec, c.flags.to),
    });
  }
  return backups;
}

/** The per-conference summary the dry run prints. */
export function summarise(changes: RecordChange[]): string[] {
  const byConf = new Map<number, RecordChange[]>();
  for (const c of changes) byConf.set(c.conf, [...(byConf.get(c.conf) ?? []), c]);
  const lines: string[] = [];
  for (const [conf, list] of [...byConf.entries()].sort((a, b) => a[0] - b[0])) {
    const scanDelta = list.reduce((sum, c) => sum + (c.scan.to - c.scan.from), 0);
    const readDelta = list.reduce((sum, c) => sum + (c.read.to - c.read.from), 0);
    const bits = BIT_NAMES
      .map(([mask, label]) => [label, list.filter(c => (c.flags.to & mask) && !(c.flags.from & mask)).length] as const)
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${label} +${n}`);
    const callers = [...new Set(list.map(c => c.name))].sort((a, b) => a.localeCompare(b));
    lines.push(`Conference ${conf}: ${list.length} record(s) changed, ${callers.length} caller(s)`);
    lines.push(`  scan pointer delta total: +${scanDelta}   read pointer delta total: +${readDelta}`);
    lines.push(`  scan bits added: ${bits.length ? bits.join(', ') : 'none'}`);
    lines.push(`  callers: ${callers.join(', ')}`);
    for (const c of list) {
      const parts: string[] = [];
      if (c.scan.to !== c.scan.from) parts.push(`scan ${c.scan.from}->${c.scan.to}`);
      if (c.read.to !== c.read.from) parts.push(`read ${c.read.from}->${c.read.to}`);
      if (c.flags.to !== c.flags.from) parts.push(`flags ${c.flags.from}->${c.flags.to}`);
      lines.push(`    slot ${c.slot} ${c.name}: ${parts.join(', ')}`);
    }
  }
  return lines;
}

/**
 * The whole script, as a function, so a test can drive it without a process.
 * @returns the exit code.
 */
export function runMerge(argv: string[], out: (line: string) => void): number {
  const opts = parseMergeArgs(argv);
  const root = path.resolve(opts.root ?? boardRoot());
  const dbFile = path.resolve(opts.db ?? defaultDbPath());
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  out(`Board: ${root}`);
  out(`Database: ${dbFile}${opts.dryRun ? '   (dry run - nothing is changed)' : ''}`);
  if (!fs.existsSync(dbFile)) { out(`No database at ${dbFile}`); return 1; }

  const { rows, skipped } = readSqlSide(dbFile);
  out(`conf_base: ${rows.length} caller/conference record(s) to compare; skipped ${skipped.noSlot} without a slot, ${skipped.stray} whose message base is another conference's`);

  const mgr = new MessagePointerFileManager(root);
  const changes = planMerge(mgr, rows);
  out('');
  if (changes.length === 0) {
    out('Nothing to change: every Conf.DB record already holds what conf_base holds.');
    return 0;
  }
  for (const line of summarise(changes)) out(line);

  if (opts.dryRun) {
    out('');
    out('Nothing was changed. Re-run without --dry-run to do it.');
    return 0;
  }
  const backups = applyMerge(mgr, changes, date);
  out('');
  for (const b of backups) out(`backup: ${b}`);
  out(`Wrote ${changes.length} record(s).`);
  return 0;
}

if (require.main === module) {
  process.exit(runMerge(process.argv.slice(2), (line: string) => console.log(line)));
}
