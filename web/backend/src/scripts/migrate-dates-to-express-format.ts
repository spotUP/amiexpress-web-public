/**
 * Rewrite the dates this port stored as Unix seconds into the value express.e
 * stores, once.
 *
 * express.e stores getSystemTime() in every date field of its files
 * (MiscFuncs.e:463-469): the Amiga's local wall clock, in seconds from 1970,
 * plus 21600 - see utils/date-time.util.ts toAmigaTime, the one conversion
 * the board itself now uses. Until 2026-10-04 the port wrote plain Unix UTC
 * instead, so an AmiExpress reader showed the port's dates 6 hours plus the
 * zone offset early. The board now writes and reads express.e's value; this
 * converts what it wrote before, and nothing else.
 *
 * The fields, from axobjects.e: user.data newSinceDate@96, accountDate@128,
 * timeLastOn@154, creditStartDate@204, creditTotalDate@212; user.misc
 * pwdLastUpdated@150; Conf<n>/Conf.DB newSinceDate@32; MsgBase/HeaderFile
 * msgDate@100 and recv@104 (98/102 in a record still in the port's own
 * layout, services/msgheader-layout.ts).
 *
 * WHICH VALUES THE PORT WROTE. A Unix value and an express.e value of the
 * same moment are 25200-28800 apart and look alike, so the value alone cannot
 * say. The rules:
 *
 *   - Nothing before PORT_START (2026-01-01) is the port's: the board files
 *     imported from the original Amiga board (Conf.DB records from 2017-2020,
 *     the reference-board message bases) are older than the port, and stay as they
 *     are.
 *   - Nothing after the CUTOVER is Unix: the new code writes express.e's
 *     value, which for any moment after the deploy is at least 25200 past the
 *     deploy itself. The cutover defaults to now, which is right for a run
 *     within seven hours of the deploy; pass --cutover with the container's
 *     start time otherwise.
 *   - A HeaderFile msgDate is the port's only when the message body was
 *     written in the same two minutes (its file time). 68K doors running in
 *     the emulator (Conftop, request.rexx) wrote express.e's own value, which
 *     sits 21600 or more past its body's time; those are left. A record
 *     whose body was rewritten later says nothing either way and is
 *     REPORTED, not guessed at.
 *   - Every other date field in range is the port's: express.e never ran on
 *     this board's user files or pointers, and no 68K door sets these
 *     fields with a time of its own.
 *
 * Each changed file is copied to `<file>.pre-date-migration-<date>.backup`
 * first, and only the four bytes of each changed field are written. A file
 * that already has such a backup beside it has been migrated and is skipped,
 * so a second run changes nothing.
 *
 *     npx tsx src/scripts/migrate-dates-to-express-format.ts --dry-run
 *     npx tsx src/scripts/migrate-dates-to-express-format.ts
 *
 *     --root <path>      the board (default: BBS_DATA_DIR, as the board uses)
 *     --cutover <when>   ISO time or Unix seconds; default now
 *     --date <stamp>     the date in the backup names (default: today)
 *     --convert-msg <conf>/<msg>   convert this message's msgDate even though
 *                        its body time cannot vouch for it (repeatable) -
 *                        for a record the dry run reported, once the sysop
 *                        has decided it is the port's
 *
 * Runs in the board's time zone (TZ) - the same clock the board converts
 * with. Run it inside the container.
 */
import * as fs from 'fs';
import * as path from 'path';

import { boardRoot } from '../utils/board-root.util';
import { conferenceConfDbPath, conferenceDir, conferenceNumbers } from '../conferences/conference-paths';
import { classifyHeaderFile, portRecordToAmiga } from '../services/msgheader-layout';
import { AMIGA_MSGHEADER_SIZE, parseAmigaMsgHeader } from '../services/amiga-msgheader';
import { encodeAmigaDate, fromAmigaTime } from '../utils/date-time.util';

/** 2026-01-01T00:00:00Z. The original Amiga board's files are all older. */
export const PORT_START = 1767225600;

/** How far apart a message's date and its body's file time may be when the port wrote both. */
export const SAME_WRITE_SECONDS = 120;

const USER_RECORD = 232;
const MISC_RECORD = 248;
const CONFDB_RECORD = 74;
const USER_FIELDS: Array<[string, number]> = [
  ['newSinceDate', 96], ['accountDate', 128], ['timeLastOn', 154],
  ['creditStartDate', 204], ['creditTotalDate', 212],
];

export interface FieldChange {
  /** Byte offset of the 4-byte field in the file. */
  offset: number;
  /** Which record and field, for the report. */
  where: string;
  before: number;
  after: number;
}

export interface FilePlan {
  file: string;
  /** Already migrated: a pre-date-migration backup is beside it. */
  skipped?: string;
  changes: FieldChange[];
  /** Values in the port's time range that were left, and why. */
  leftExpress: number;
  unidentified: string[];
}

export interface MigrateOptions {
  root?: string;
  dryRun: boolean;
  cutover?: number;
  date?: string;
  /** "<conf>/<msgNumb>" records whose msgDate the sysop says the port wrote. */
  convertMsgs: string[];
}

export function parseMigrateArgs(argv: string[]): MigrateOptions {
  const opts: MigrateOptions = { dryRun: false, convertMsgs: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') opts.dryRun = true;
    else if (argv[i] === '--root') opts.root = argv[++i];
    else if (argv[i] === '--date') opts.date = argv[++i];
    else if (argv[i] === '--convert-msg') opts.convertMsgs.push(argv[++i] ?? '');
    else if (argv[i] === '--cutover') {
      const raw = argv[++i] ?? '';
      opts.cutover = /^\d+$/.test(raw) ? Number(raw) : Math.floor(new Date(raw).getTime() / 1000);
      if (!Number.isFinite(opts.cutover)) throw new Error(`--cutover: not a time: ${raw}`);
    }
  }
  return opts;
}

function backupOf(file: string): string | undefined {
  const dir = path.dirname(file);
  const prefix = `${path.basename(file)}.pre-date-migration-`;
  try {
    const found = fs.readdirSync(dir).find((n) => n.startsWith(prefix) && n.endsWith('.backup'));
    return found ? path.join(dir, found) : undefined;
  } catch {
    return undefined;
  }
}

function inPortRange(value: number, cutover: number): boolean {
  return value >= PORT_START && value <= cutover;
}

function convert(value: number): number {
  return encodeAmigaDate(value);
}

/** A plan with nothing in it yet, or the reason the file is not looked at. */
function startPlan(file: string): FilePlan | null {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) return null;
  const plan: FilePlan = { file, changes: [], leftExpress: 0, unidentified: [] };
  const done = backupOf(file);
  if (done) plan.skipped = `already migrated (${path.basename(done)})`;
  return plan;
}

/** A plain date field: the port's if it is in the port's range. */
function planPlainField(plan: FilePlan, buf: Buffer, offset: number, where: string, cutover: number): void {
  const before = buf.readInt32BE(offset);
  if (!inPortRange(before, cutover)) return;
  plan.changes.push({ offset, where, before, after: convert(before) });
}

function recordName(buf: Buffer, at: number): string {
  const raw = buf.subarray(at, at + 31);
  const nul = raw.indexOf(0);
  return raw.subarray(0, nul < 0 ? 31 : nul).toString('latin1');
}

export function planUserData(file: string, cutover: number): FilePlan | null {
  const plan = startPlan(file);
  if (!plan || plan.skipped) return plan;
  const buf = fs.readFileSync(file);
  for (let slot = 1; slot * USER_RECORD <= buf.length; slot++) {
    const at = (slot - 1) * USER_RECORD;
    const name = recordName(buf, at);
    for (const [field, off] of USER_FIELDS) {
      planPlainField(plan, buf, at + off, `slot ${slot} ${name} ${field}`, cutover);
    }
  }
  return plan;
}

export function planUserMisc(file: string, cutover: number, names: string[]): FilePlan | null {
  const plan = startPlan(file);
  if (!plan || plan.skipped) return plan;
  const buf = fs.readFileSync(file);
  for (let slot = 1; slot * MISC_RECORD <= buf.length; slot++) {
    planPlainField(plan, buf, (slot - 1) * MISC_RECORD + 150, `slot ${slot} ${names[slot - 1] ?? ''} pwdLastUpdated`, cutover);
  }
  return plan;
}

export function planConfDb(file: string, cutover: number): FilePlan | null {
  const plan = startPlan(file);
  if (!plan || plan.skipped) return plan;
  const buf = fs.readFileSync(file);
  for (let slot = 1; slot * CONFDB_RECORD <= buf.length; slot++) {
    planPlainField(plan, buf, (slot - 1) * CONFDB_RECORD + 32, `slot ${slot} newSinceDate`, cutover);
  }
  return plan;
}

/** The second at which a message's body file was last written, or null. */
function bodyTime(msgBaseDir: string, msgNumb: number): number | null {
  try {
    return Math.floor(fs.statSync(path.join(msgBaseDir, String(msgNumb))).mtimeMs / 1000);
  } catch {
    return null;
  }
}

export function planHeaderFile(file: string, cutover: number, forced: Set<number> = new Set()): FilePlan | null {
  const plan = startPlan(file);
  if (!plan || plan.skipped) return plan;
  const buf = fs.readFileSync(file);
  const layouts = classifyHeaderFile(buf);
  const msgBaseDir = path.dirname(file);
  for (let i = 0; i * AMIGA_MSGHEADER_SIZE + AMIGA_MSGHEADER_SIZE <= buf.length; i++) {
    const at = i * AMIGA_MSGHEADER_SIZE;
    const layout = layouts[i];
    if (layout !== 'amiga' && layout !== 'port') {
      plan.unidentified.push(`record ${i}: layout unknown, not read`);
      continue;
    }
    const dateAt = at + (layout === 'port' ? 98 : 100);
    const recvAt = at + (layout === 'port' ? 102 : 104);
    const header = parseAmigaMsgHeader(layout === 'port' ? portRecordToAmiga(buf, at) : buf.subarray(at, at + AMIGA_MSGHEADER_SIZE), 0);
    const tag = `msg ${header.msgNumb} from ${header.fromName}`;

    const msgDate = buf.readUInt32BE(dateAt);
    if (inPortRange(msgDate, cutover)) {
      const written = bodyTime(msgBaseDir, header.msgNumb);
      const gap = written === null ? null : msgDate - written;
      if ((gap !== null && Math.abs(gap) <= SAME_WRITE_SECONDS) || forced.has(header.msgNumb)) {
        plan.changes.push({ offset: dateAt, where: `${tag} msgDate`, before: msgDate, after: convert(msgDate) });
      } else if (gap !== null && gap >= 21600 - SAME_WRITE_SECONDS && gap <= 21600 + 7200 + SAME_WRITE_SECONDS) {
        plan.leftExpress++;
      } else {
        plan.unidentified.push(`${tag} msgDate ${msgDate}: body ${written === null ? 'missing' : `written ${gap}s from it`}`);
      }
    }

    const recv = buf.readUInt32BE(recvAt);
    if (inPortRange(recv, cutover)) {
      plan.changes.push({ offset: recvAt, where: `${tag} recv`, before: recv, after: convert(recv) });
    }
  }
  return plan;
}

/** Every file the board keeps dates in, by the board's own paths. */
export function planBoard(root: string, cutover: number, convertMsgs: string[] = []): FilePlan[] {
  const plans: FilePlan[] = [];
  const userData = path.join(root, 'user.data');
  const names: string[] = [];
  if (fs.existsSync(userData)) {
    const buf = fs.readFileSync(userData);
    for (let at = 0; at + USER_RECORD <= buf.length; at += USER_RECORD) names.push(recordName(buf, at));
  }
  const push = (p: FilePlan | null) => { if (p) plans.push(p); };
  push(planUserData(userData, cutover));
  push(planUserMisc(path.join(root, 'user.misc'), cutover, names));

  const confDbs = new Set<string>();
  for (const n of conferenceNumbers(root)) confDbs.add(conferenceConfDbPath(root, n));
  for (const f of confDbs) push(planConfDb(f, cutover));
  for (const n of conferenceNumbers(root)) {
    const forced = new Set(convertMsgs
      .map((s) => s.split('/').map(Number))
      .filter(([c, m]) => c === n && Number.isInteger(m))
      .map(([, m]) => m));
    push(planHeaderFile(path.join(conferenceDir(root, n), 'MsgBase', 'HeaderFile'), cutover, forced));
  }
  return plans;
}

function hex(v: number): string {
  return (v >>> 0).toString(16).padStart(8, '0');
}

/** What AmiExpress shows for a stored value: the board-clock wall time. */
function shown(v: number): string {
  const d = fromAmigaTime(v);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function describePlans(plans: FilePlan[], root: string, samples = 3): string[] {
  const lines: string[] = [];
  for (const p of plans) {
    const rel = path.relative(root, p.file) || p.file;
    if (p.skipped) { lines.push(`${rel}: skipped - ${p.skipped}`); continue; }
    lines.push(`${rel}: ${p.changes.length} field(s) to convert, ${p.leftExpress} already in express.e's form, ${p.unidentified.length} unidentified`);
    for (const c of p.changes.slice(0, samples)) {
      lines.push(`    ${c.where}: ${hex(c.before)} -> ${hex(c.after)}  AmiExpress showed ${shown(c.before)}, now ${shown(c.after)} (${new Date(c.before * 1000).toISOString()})`);
    }
    if (p.changes.length > samples) lines.push(`    ... and ${p.changes.length - samples} more`);
    for (const u of p.unidentified) lines.push(`    left as is (unidentified): ${u}`);
  }
  return lines;
}

/** Back each changed file up, then write only the changed fields. @returns the backups. */
export function applyPlans(plans: FilePlan[], date: string): string[] {
  const backups: string[] = [];
  for (const p of plans) {
    if (p.skipped || p.changes.length === 0) continue;
    const backup = `${p.file}.pre-date-migration-${date}.backup`;
    fs.copyFileSync(p.file, backup);
    backups.push(backup);
    const fd = fs.openSync(p.file, 'r+');
    try {
      const four = Buffer.alloc(4);
      for (const c of p.changes) {
        four.writeUInt32BE(c.after >>> 0, 0);
        fs.writeSync(fd, four, 0, 4, c.offset);
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  return backups;
}

/**
 * The whole script, as a function, so a test can drive it without a process.
 * @returns the exit code.
 */
export function runDateMigration(argv: string[], out: (line: string) => void): number {
  const opts = parseMigrateArgs(argv);
  const root = path.resolve(opts.root ?? boardRoot());
  const cutover = opts.cutover ?? Math.floor(Date.now() / 1000);
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  out(`Board: ${root}${opts.dryRun ? '   (dry run - nothing is changed)' : ''}`);
  out(`Time zone: ${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  out(`Port-written range: ${new Date(PORT_START * 1000).toISOString()} .. ${new Date(cutover * 1000).toISOString()} (cutover)`);
  out('');

  const plans = planBoard(root, cutover, opts.convertMsgs);
  for (const line of describePlans(plans, root)) out(line);
  const total = plans.reduce((n, p) => n + p.changes.length, 0);
  out('');
  if (total === 0) { out('Nothing to change.'); return 0; }
  if (opts.dryRun) { out(`${total} field(s) would change. Re-run without --dry-run to do it.`); return 0; }

  for (const b of applyPlans(plans, date)) out(`backup: ${b}`);
  out(`Wrote ${total} field(s).`);
  return 0;
}

if (require.main === module) {
  process.exit(runDateMigration(process.argv.slice(2), (line: string) => console.log(line)));
}
