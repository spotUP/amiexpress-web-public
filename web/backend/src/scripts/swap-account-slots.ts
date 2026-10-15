/**
 * MOVE AN ACCOUNT INTO ANOTHER SLOT, swapping it with the account there.
 *
 * Why: express.e treats slot 1 as the sysop. C (comment to sysop) is mail to
 * slot 1 (express.e:10717 `tempUser.slotNumber=1`), and slot 1 gates sysop
 * paths elsewhere (18722, 21408, 21460). On the live board slot 1 is
 * '-TCB!-' and the sysop's account is in another slot, so this puts it where
 * express.e expects it (sysop's decision, 2026-10-04).
 *
 * WHAT MOVES - everything the board keys by slot, so each caller keeps his own:
 *
 *   user.data / user.keys / user.misc   the records, byte for byte, with the
 *                                       record's slotNumber and the keys
 *                                       record's number set to the new slot
 *                                       (UserFileManager.moveRecordsToSlot)
 *   every Conf.DB                       the two 74-byte confBase records -
 *                                       pointers, scan flags and votes,
 *                                       per-conference accounting - in every
 *                                       file getConfDbFileName can name
 *                                       (confDbFiles: LOCATION, each message
 *                                       base) and every file the board reads
 *                                       (MessagePointerFileManager: LOCATION,
 *                                       CONFDB_SHARED), through its raw
 *                                       record reader and writer
 *   Doors/AquaScan/AquaScan.UserData    the two 16-byte last-scan records
 *   Partdownload/flagged<n>, dump<n>    flagged files (express.e:2757-2814),
 *                                       and the <node>-<n> form
 *   <conf>/PartUpload/<file>@<n>        part uploads (express.e:14574), and
 *   Node<k>/PartUpload/<file>@<n>       the @<node>-<n> form
 *   <conf>/LCFILES/<n>.lc               lost-carrier lists (express.e:17485)
 *   userNotes/<n>                       the sysop's notes (express.e:21701)
 *   SQL users.slotnumber                of both rows
 *
 * Mail is addressed by NAME and the SQL tables by users.id, so neither moves.
 *
 * SAFETY
 *
 *   --dry-run prints every change and writes nothing.
 *   Refuses while either account is online (a node<n>.user naming it, or a
 *   live node_sessions row).
 *   Every file is copied to <file>.pre-slot-swap-<stamp>.backup before it is
 *   touched, and a journal (<board>/swap-account-slots.journal.json) lists
 *   them. A run that died half way is rolled back from that journal when the
 *   script is run again, and then done whole. An account already in the slot
 *   asked for is nothing to do, so re-running a finished swap changes nothing.
 *
 * Usage (from web/backend, with the board's BBS_DATA_DIR / DATABASE_DIR):
 *
 *   npx tsx src/scripts/swap-account-slots.ts --account spot --to-slot 1 --dry-run
 *   npx tsx src/scripts/swap-account-slots.ts --account spot --to-slot 1
 */
import * as fs from 'fs';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';

import { boardRoot } from '../utils/board-root.util';
import { UserFileManager } from '../services/UserFileManager';
import { MessagePointerFileManager, CONFBASE_RECORD_SIZE } from '../services/MessagePointerFileManager';
import { confDbFiles } from '../services/delete-conf-access';
import { conferenceDir, conferenceNumbers } from '../conferences/conference-paths';
import { userAlreadyOnNode, boardNodeIds } from '../services/user-already-online';
import { NodeFileManager } from '../services/NodeFileManager';
import { getUserNotesFolder } from '../utils/user-notes.util';

export interface SwapOptions {
  /** The account to move, by name (case-insensitive). */
  account: string;
  /** The slot it goes to; that slot's account goes to the one it leaves. */
  toSlot: number;
  dryRun: boolean;
  /** The board's root (Conf1, user.data, ...). */
  bbsRoot?: string;
  /** The SQL database file. */
  dbPath?: string;
  /** The userNotes folder (express.e USERNOTES). */
  notesDir?: string;
  /** Backup suffix stamp; the time of the run by default. */
  stamp?: string;
  /** Where the report goes. */
  log?: (line: string) => void;
}

export type SwapOutcome = 'swapped' | 'dry-run' | 'nothing-to-do' | 'refused';

interface JournalEntry {
  file: string;
  /** The copy taken before the change, or null when the file did not exist. */
  backup: string | null;
}

interface Journal {
  account: string;
  toSlot: number;
  fromSlot: number;
  started: string;
  entries: JournalEntry[];
}

const JOURNAL = 'swap-account-slots.journal.json';

/** The default SQL file, resolved as database.ts resolves it. */
export function defaultDbPath(): string {
  const dir = process.env.DATABASE_DIR || path.join(process.cwd(), 'data');
  return path.join(dir, process.env.DATABASE_FILE || 'amiexpress.db');
}

function nameOf(ufm: UserFileManager, slot: number): string {
  const { user } = ufm.readSlotRecords(slot);
  return (ufm.deserializeUserStruct(user, 0).name ?? '').replace(/\0/g, '').trim();
}

function slotField(ufm: UserFileManager, slot: number): number {
  const { user } = ufm.readSlotRecords(slot);
  return user.readInt16BE(ufm.recordLayout().slotNumberOffset);
}

/** Every slot whose record carries this name. */
function slotsNamed(ufm: UserFileManager, name: string): number[] {
  const dataPath = ufm.userFilePaths().data;
  if (!fs.existsSync(dataPath)) return [];
  const count = Math.floor(fs.statSync(dataPath).size / ufm.USER_STRUCT_SIZE);
  const wanted = name.trim().toLowerCase();
  const found: number[] = [];
  for (let slot = 1; slot <= count; slot++) {
    if (nameOf(ufm, slot).toLowerCase() === wanted) found.push(slot);
  }
  return found;
}

/**
 * The files keyed by slot BY NAME, as pairs to exchange: each file named for
 * one of the two slots, and the name it takes for the other.
 */
function renames(root: string, notesDir: string, a: number, b: number): Array<{ from: string; to: string }> {
  const other = (n: number) => (n === a ? b : a);
  const out: Array<{ from: string; to: string }> = [];
  const scan = (dir: string, pattern: RegExp, rename: (m: RegExpMatchArray, slot: number) => string) => {
    let entries: string[];
    try {
      if (!fs.statSync(dir).isDirectory()) return;
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const m = entry.match(pattern);
      if (!m) continue;
      const slot = Number(m[m.length - 1]);
      if (slot !== a && slot !== b) continue;
      out.push({ from: path.join(dir, entry), to: path.join(dir, rename(m, other(slot))) });
    }
  };
  // A directory name as the board spells it, on a case-folding Amiga disk.
  const child = (dir: string, name: string): string => {
    try {
      const hit = fs.readdirSync(dir).find((e) => e.toLowerCase() === name.toLowerCase());
      return path.join(dir, hit ?? name);
    } catch {
      return path.join(dir, name);
    }
  };

  // Partdownload/flagged<n>, dump<n>, and <node>-<n> (express.e:2757-2814).
  scan(child(root, 'Partdownload'), /^(flagged|dump)((?:\d+-)?)(\d+)$/i, (m, s) => `${m[1]}${m[2]}${s}`);

  // PartUpload/<file>@<n> and @<node>-<n>, in every conference and node.
  const partUploadParents = new Set<string>();
  for (const conf of conferenceNumbers(root)) partUploadParents.add(conferenceDir(root, conf));
  for (const node of boardNodeIds(root)) partUploadParents.add(child(root, `Node${node}`));
  for (const parent of partUploadParents) {
    scan(child(parent, 'PartUpload'), /^(.+@)((?:\d+-)?)(\d+)$/, (m, s) => `${m[1]}${m[2]}${s}`);
  }

  // <conf>/LCFILES/<n>.lc (express.e:17485-17486).
  for (const conf of conferenceNumbers(root)) {
    scan(child(conferenceDir(root, conf), 'LCFILES'), /^()()(\d+)\.lc$/i, (_m, s) => `${s}.lc`);
  }

  // userNotes/<n> (express.e:21701).
  scan(notesDir, /^()()(\d+)$/, (_m, s) => `${s}`);
  return out;
}

/**
 * Run the swap. Returns what it did; `log` gets one line per change.
 */
export function swapAccountSlots(opts: SwapOptions): SwapOutcome {
  const log = opts.log ?? ((line: string) => console.log(line));
  const root = path.resolve(opts.bbsRoot ?? boardRoot());
  const dbPath = opts.dbPath ?? defaultDbPath();
  const notesDir = opts.notesDir ?? getUserNotesFolder();
  const stamp = opts.stamp ?? new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');
  const ufm = new UserFileManager(root);
  const mpf = new MessagePointerFileManager(root);
  const journalPath = path.join(root, JOURNAL);
  const say = (line: string) => log(opts.dryRun ? `[DRY RUN] ${line}` : line);

  // A run that died half way: put every file back first.
  if (fs.existsSync(journalPath)) {
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
    if (opts.dryRun) {
      say(`[INFO] An unfinished run (${journal.started}) left ${journalPath}; the real run rolls its ${journal.entries.length} file(s) back first.`);
    } else {
      log(`[INFO] Rolling back the unfinished run of ${journal.started} (${journal.entries.length} file(s))`);
      for (const entry of [...journal.entries].reverse()) {
        if (entry.backup) {
          fs.copyFileSync(entry.backup, entry.file);
          log(`  restored ${entry.file}`);
        } else if (fs.existsSync(entry.file)) {
          fs.unlinkSync(entry.file);
          log(`  removed ${entry.file} (did not exist before)`);
        }
      }
      fs.unlinkSync(journalPath);
    }
  }

  // --- who is where ---------------------------------------------------------
  const found = slotsNamed(ufm, opts.account);
  if (found.length !== 1) {
    log(`[ERROR] ${found.length === 0 ? 'No' : found.length} account(s) named '${opts.account}' in user.data${found.length > 1 ? ` (slots ${found.join(', ')})` : ''}`);
    return 'refused';
  }
  const fromSlot = found[0];
  const toSlot = opts.toSlot;
  if (fromSlot === toSlot) {
    say(`[OK] '${opts.account}' is already in slot ${toSlot} - nothing to do`);
    return 'nothing-to-do';
  }
  const occupant = nameOf(ufm, toSlot);
  if (!occupant) {
    log(`[ERROR] Slot ${toSlot} holds no account; this tool swaps two accounts`);
    return 'refused';
  }
  for (const slot of [fromSlot, toSlot]) {
    const field = slotField(ufm, slot);
    if (field !== slot) {
      log(`[ERROR] The record at slot ${slot} says slotNumber ${field}: deleted or out of place - refusing`);
      return 'refused';
    }
  }
  say(`'${opts.account}' slot ${fromSlot} -> ${toSlot}; '${occupant}' slot ${toSlot} -> ${fromSlot}`);

  // --- online? -----------------------------------------------------------------
  if (!fs.existsSync(dbPath)) {
    log(`[ERROR] No database at ${dbPath}`);
    return 'refused';
  }
  const sql = new BetterSqlite3(dbPath, { readonly: opts.dryRun, fileMustExist: true });
  try {
    const rowFor = (name: string) => sql
      .prepare('SELECT id, username, slotnumber FROM users WHERE username = ? COLLATE NOCASE')
      .get(name) as { id: string; username: string; slotnumber: number } | undefined;
    const rowA = rowFor(opts.account);
    const rowB = rowFor(occupant);
    if (!rowA || !rowB) {
      log(`[ERROR] No users row for '${rowA ? occupant : opts.account}'`);
      return 'refused';
    }

    const nodeFiles = new NodeFileManager(root);
    for (const name of [opts.account, occupant]) {
      const node = userAlreadyOnNode(root, name, -1, undefined, undefined, nodeFiles);
      if (node !== null) {
        log(`[ERROR] '${name}' is online on node ${node} (node${node}.user) - refusing; run again when he is off`);
        return 'refused';
      }
    }
    const live = sql
      .prepare("SELECT nodeid, userid FROM node_sessions WHERE userid IN (?, ?) AND status <> 'disconnected'")
      .all(rowA.id, rowB.id) as Array<{ nodeid: number; userid: string }>;
    if (live.length > 0) {
      log(`[ERROR] Online in node_sessions: ${live.map((r) => `node ${r.nodeid}`).join(', ')} - refusing`);
      return 'refused';
    }

    // --- the plan ------------------------------------------------------------------
    type Step = { describe: string; files: string[]; apply: () => void };
    const steps: Step[] = [];

    // Conf.DB: every file the board or express can name, once each.
    const confFiles = new Set<string>();
    for (const file of confDbFiles(root)) confFiles.add(path.resolve(file));
    for (const conf of conferenceNumbers(root)) confFiles.add(path.resolve(mpf.getConfDbPath(conf)));
    for (const file of [...confFiles].sort()) {
      if (!fs.existsSync(file)) continue;
      const size = fs.statSync(file).size;
      const has = (slot: number) => size >= slot * CONFBASE_RECORD_SIZE;
      if (!has(fromSlot) && !has(toSlot)) continue;
      const recFrom = mpf.readRawAt(file, fromSlot);
      const recTo = mpf.readRawAt(file, toSlot);
      if (recFrom.equals(recTo)) continue;
      steps.push({
        describe: `${path.relative(root, file)}: confBase records ${fromSlot} <-> ${toSlot}`,
        files: [file],
        apply: () => {
          mpf.writeRawAt(file, toSlot, recFrom);
          mpf.writeRawAt(file, fromSlot, recTo);
        },
      });
    }

    // AquaScan.UserData: 16 bytes per slot (message-scan.handler's writer).
    const aqua = path.join(root, 'Doors', 'AquaScan', 'AquaScan.UserData');
    if (fs.existsSync(aqua)) {
      const buf = fs.readFileSync(aqua);
      const rec = (slot: number) => {
        const out = Buffer.alloc(16);
        buf.copy(out, 0, (slot - 1) * 16, Math.min(buf.length, slot * 16));
        return out;
      };
      const recFrom = rec(fromSlot);
      const recTo = rec(toSlot);
      if (!recFrom.equals(recTo)) {
        steps.push({
          describe: `Doors/AquaScan/AquaScan.UserData: records ${fromSlot} <-> ${toSlot}`,
          files: [aqua],
          apply: () => {
            const now = fs.readFileSync(aqua);
            const size = Math.max(now.length, Math.max(fromSlot, toSlot) * 16);
            const out = Buffer.alloc(size);
            now.copy(out);
            recFrom.copy(out, (toSlot - 1) * 16);
            recTo.copy(out, (fromSlot - 1) * 16);
            fs.writeFileSync(aqua, out);
          },
        });
      }
    }

    // Files named by slot: exchanged through temporary names.
    const moves = renames(root, notesDir, fromSlot, toSlot);
    if (moves.length > 0) {
      // The temporary names too: a run that dies between the two renames
      // leaves them, and the roll-back removes what did not exist before.
      const touched = [...new Set(moves.flatMap((m) => [m.from, m.to, `${m.to}.slot-swap-tmp`]))];
      steps.push({
        describe: moves.map((m) => `rename ${path.relative(root, m.from)} -> ${path.basename(m.to)}`).join('\n  '),
        files: touched,
        apply: () => {
          const tmp = moves.map((m) => ({ ...m, tmp: `${m.to}.slot-swap-tmp` }));
          for (const m of tmp) fs.renameSync(m.from, m.tmp);
          for (const m of tmp) fs.renameSync(m.tmp, m.to);
        },
      });
    }

    // The account records, last: until they move, a re-run finds the
    // accounts where they were.
    const paths = ufm.userFilePaths();
    steps.push({
      describe: `user.data / user.keys / user.misc: records ${fromSlot} <-> ${toSlot} (slotNumber and keys number renumbered)`,
      files: [paths.data, paths.keys, paths.misc],
      apply: () => {
        const recFrom = ufm.readSlotRecords(fromSlot);
        const recTo = ufm.readSlotRecords(toSlot);
        ufm.moveRecordsToSlot(recFrom, toSlot);
        ufm.moveRecordsToSlot(recTo, fromSlot);
      },
    });

    const sqlChange = `SQL users.slotnumber: ${rowA.username} ${rowA.slotnumber} -> ${toSlot}, ${rowB.username} ${rowB.slotnumber} -> ${fromSlot}`;

    for (const step of steps) say(step.describe);
    say(sqlChange);
    if (opts.dryRun) {
      const files = [...new Set(steps.flatMap((s) => s.files))].filter((f) => fs.existsSync(f));
      say(`${files.length} file(s) would be backed up as <file>.pre-slot-swap-${stamp}.backup`);
      return 'dry-run';
    }

    // --- the run --------------------------------------------------------------------
    const journal: Journal = { account: opts.account, toSlot, fromSlot, started: stamp, entries: [] };
    const writeJournal = () => fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
    writeJournal();
    const backedUp = new Set<string>();
    for (const step of steps) {
      for (const file of step.files) {
        if (backedUp.has(file)) continue;
        backedUp.add(file);
        let backup: string | null = null;
        if (fs.existsSync(file)) {
          backup = `${file}.pre-slot-swap-${stamp}.backup`;
          fs.copyFileSync(file, backup);
          // The live volume is the board's user's; keep the copy his too.
          try {
            const st = fs.statSync(file);
            fs.chownSync(backup, st.uid, st.gid);
          } catch { /* not ours to chown: a local copy */ }
        }
        journal.entries.push({ file, backup });
        writeJournal();
      }
      step.apply();
      log(`[OK] ${step.describe}`);
    }

    sql.transaction(() => {
      const set = sql.prepare('UPDATE users SET slotnumber = ? WHERE id = ?');
      set.run(toSlot, rowA.id);
      set.run(fromSlot, rowB.id);
    })();
    log(`[OK] ${sqlChange}`);

    fs.unlinkSync(journalPath);
    log(`[OK] Done. Backups: <file>.pre-slot-swap-${stamp}.backup (${journal.entries.filter((e) => e.backup).length} file(s))`);
    return 'swapped';
  } finally {
    sql.close();
  }
}

function main(argv: string[]): number {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const account = arg('--account');
  const toSlot = Number(arg('--to-slot'));
  if (!account || !Number.isInteger(toSlot) || toSlot < 1) {
    console.error('usage: swap-account-slots.ts --account <name> --to-slot <n> [--dry-run]');
    return 2;
  }
  const outcome = swapAccountSlots({ account, toSlot, dryRun: argv.includes('--dry-run') });
  return outcome === 'refused' ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
