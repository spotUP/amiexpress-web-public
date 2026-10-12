/**
 * UNDO ONE UPLOAD through the board's own services.
 *
 * A test upload (or a bad one) leaves its mark in a dozen stores. FM D
 * (file-list.service deleteEntry) clears the bytes, the DIR/HELD listing line,
 * the file_entries row and the FILES.BBS line. The upload also moved:
 *
 *   Conf<N>/NumULs                 +1 for a FILED upload (updateSysopUploadStats;
 *                                  a held one is not counted there)
 *   SysopStats/NumULs_<N>          +1 filed, NumULs_<N>HOLD +1 held
 *   Conf<N>/Conf.DB                every slot that saw the file (auto-rejoin
 *                                  sets uploadTracking:=NumULs, express.e
 *                                  18682-18711) now sits ABOVE the counter and
 *                                  would be told "N new file(s)" wrongly later
 *   Conf<N>/ctop.data              the uploader's record (ctop-updater, filed
 *                                  uploads only)
 *   users row, user_stats          uploads / bytes_upload (+ files_uploaded)
 *   user.data / user.misc          the same two fields, through the
 *                                  read-modify-write overlay (UserFileManager
 *                                  updateUserDataFile), never a whole record
 *
 * This script reverses each of them, once, and prints before -> after.
 * Nothing is reimplemented: deleteEntry, the stats directory resolver, the
 * Conf.DB reader/writer, the ctop-data layout (SDK) and the user overlay are
 * the board's.
 *
 * WHAT COUNTS AS "COUNTED": the file is listed. A filed upload is in DIR<n>,
 * a held one in HOLD/HELD, and the counters only move for the one it is in.
 * A file named in no listing was already removed (or never filed): the run
 * reports that and changes nothing, so it can be run twice.
 *
 * SAFETY
 *   --dry-run   prints every change, writes nothing.
 *   Refuses while any caller is online (a node<n>.user with a name, or a
 *   node_sessions row not 'disconnected') unless --force: an online caller
 *   writes his Conf.DB record and account back at logoff, over this work.
 *   Every file written is first copied to
 *   <file>.remove-<name>-<YYYYMMDD>.backup (an existing backup is kept: it is
 *   the older, truer copy); the SQL file goes through SQLite's online backup.
 *   The upload's own bytes are the exception: a copy beside them would sit in
 *   a file area callers and FTP can see, so they go next to the SQL backup,
 *   to <db dir>/remove-upload-backups/<name>-<YYYYMMDD>/<path under the board>.
 *
 * Usage (from web/backend, with the board's BBS_DATA_DIR / DATABASE_DIR):
 *
 *   npx tsx src/scripts/remove-upload.ts --conf 1 --file RGCLEAN3.LHA --uploader regress [--dir 1|hold] [--dry-run] [--force]
 */
import * as fs from 'fs';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';

import { boardRoot } from '../utils/board-root.util';
import { UserFileManager } from '../services/UserFileManager';
import { MessagePointerFileManager, CONFBASE_RECORD_SIZE } from '../services/MessagePointerFileManager';
import { FileRepository } from '../database/file-repository';
import {
  buildFileCandidates,
  conferenceListings,
  deleteEntry,
  findEntryLines,
  readDirLines,
  type FileListContext,
} from '../services/file-list.service';
import { getHoldDirFilePath, parseDirFile } from '../utils/dir-file-reader.util';
import { getConferenceDir } from '../utils/file-hold.util';
import { getFilesBBSPath } from '../utils/files-bbs.util';
import { resolveSysopStatsDir } from '../utils/upload-notify.util';
import { boardNodeIds } from '../services/user-already-online';
import { NodeFileManager } from '../services/NodeFileManager';
import { loadBBSConfig } from '../services/bbs-config-file.service';
import { ToggleFlags, togglesFromBoardConfig } from '../utils/acs.util';
import {
  CTOP_HEADER_SIZE,
  CTOP_RECORD_SIZE,
  decodeCtopRecords,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';
import { defaultDbPath } from './swap-account-slots';

export interface RemoveUploadOptions {
  conf: number;
  file: string;
  /** The uploader's account name; without it the uploader's credit and ctop record are left alone. */
  uploader?: string;
  /** Which listing, when the name is in more than one: a DIR number, or -1 for Hold. */
  dir?: number;
  dryRun: boolean;
  force: boolean;
  bbsRoot?: string;
  dbPath?: string;
  /** YYYYMMDD of the backup suffix; today by default. */
  stamp?: string;
  log?: (line: string) => void;
}

export type RemoveOutcome = 'removed' | 'dry-run' | 'nothing-to-do' | 'refused';

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
const dirLabel = (dir: number) => (dir === -1 ? 'HOLD/HELD' : `DIR${dir}`);

interface Located {
  dir: number;
  listing: string;
  size: number;
}

export async function removeUpload(opts: RemoveUploadOptions): Promise<RemoveOutcome> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const say = (line: string) => log(opts.dryRun ? `[DRY RUN] ${line}` : line);
  const root = path.resolve(opts.bbsRoot ?? boardRoot());
  const dbPath = opts.dbPath ?? defaultDbPath();
  const stamp = opts.stamp ?? today();
  const { conf, file } = opts;
  const ctx: FileListContext = { dataDir: root };
  const confDir = getConferenceDir(conf, root);
  const ufm = new UserFileManager(root);
  const mpf = new MessagePointerFileManager(root);

  // --- which listing names it ----------------------------------------------------
  const located: Located[] = [];
  for (const listing of conferenceListings(ctx, conf)) {
    try {
      if (!fs.existsSync(listing)) continue;
      const lines = readDirLines(listing);
      if (!findEntryLines(lines, file)) continue;
      const m = path.basename(listing).match(/^DIR(\d+)$/i);
      const dir = m ? Number(m[1]) : -1;
      const entry = parseDirFile(lines.join('\n')).find((e) => e.filename.trim().toUpperCase() === file.toUpperCase());
      located.push({ dir, listing, size: entry?.fileSize ?? 0 });
    } catch { /* an unreadable listing names nothing */ }
  }
  const picked = opts.dir === undefined ? located : located.filter((l) => l.dir === opts.dir);
  if (picked.length > 1) {
    log(`[ERROR] ${file} is named in ${picked.map((l) => dirLabel(l.dir)).join(', ')}: say which with --dir <n|hold>`);
    return 'refused';
  }

  if (!fs.existsSync(dbPath)) {
    log(`[ERROR] No database at ${dbPath}`);
    return 'refused';
  }
  const sql = new BetterSqlite3(dbPath, { readonly: opts.dryRun, fileMustExist: true });
  try {
    // --- online? -------------------------------------------------------------------
    if (!opts.force) {
      const nodeFiles = new NodeFileManager(root);
      const online: string[] = [];
      for (const node of boardNodeIds(root)) {
        const record = nodeFiles.readNodeUserFile(node);
        const name = String(record?.name ?? '').replace(/\0/g, '').trim();
        if (name) online.push(`${name} on node ${node} (node${node}.user)`);
      }
      const live = sql.prepare("SELECT nodeid FROM node_sessions WHERE status <> 'disconnected'")
        .all() as Array<{ nodeid: number }>;
      for (const row of live) online.push(`a session on node ${row.nodeid} (node_sessions)`);
      if (online.length > 0) {
        log(`[ERROR] Callers are online: ${online.join('; ')} - refusing (an online caller writes his records back at logoff). Run again when the board is empty, or pass --force.`);
        return 'refused';
      }
    }

    const fileRepo = new FileRepository(sql);
    ctx.db = fileRepo;
    const rowCount = () => (sql.prepare(
      `SELECT COUNT(*) AS n FROM file_entries
        WHERE LOWER(filename) = LOWER(?)
          AND areaid IN (SELECT id FROM file_areas WHERE conferenceid = ?)`
    ).get(file, conf) as { n: number }).n;
    const filesBbs = getFilesBBSPath(confDir);
    const filesBbsHas = () => {
      try { return fs.existsSync(filesBbs) && findEntryLines(readDirLines(filesBbs), file) !== null; } catch { return false; }
    };

    if (picked.length === 0) {
      say(`[OK] ${file} is named in no DIR or HOLD listing of Conf${conf}: nothing was counted, nothing to undo`);
      if (rowCount() > 0) say(`[WARN] ${rowCount()} file_entries row(s) still name it (the listing is the record; remove them by hand if wanted)`);
      if (filesBbsHas()) say(`[WARN] Upload/FILES.BBS still names it`);
      return 'nothing-to-do';
    }

    const target = picked[0];
    const held = target.dir === -1;
    const name = file.toUpperCase();
    log(`${opts.dryRun ? '[DRY RUN] ' : ''}Removing ${file} (${target.size} bytes) from Conf${conf} ${dirLabel(target.dir)} - ${held ? 'HELD' : 'FILED'}`);

    // --- the plan: everything read, nothing written -----------------------------------
    type Step = { describe: string; files: string[]; apply: () => void };
    const steps: Step[] = [];

    // The listing and the bytes: backed up here, removed by deleteEntry last.
    const writtenFiles = new Set<string>([target.listing]);
    const folders = (await buildFileCandidates(ctx, conf, file, target.dir)).filter((candidate) => {
      const holdDir = path.resolve(path.dirname(getHoldDirFilePath(confDir))).toLowerCase();
      const inHold = path.resolve(path.dirname(candidate)).toLowerCase() === holdDir;
      return held === inHold;
    });
    const byteFiles = folders.flatMap((candidate) => {
      try {
        const names = fs.readdirSync(path.dirname(candidate));
        const hit = names.find((n) => n.toLowerCase() === path.basename(candidate).toLowerCase());
        return hit ? [path.join(path.dirname(candidate), hit)] : [];
      } catch { return []; }
    });
    for (const f of byteFiles) writtenFiles.add(f);
    if (fs.existsSync(filesBbs)) writtenFiles.add(filesBbs);

    // Counters: only the one the file was counted in.
    const sysopDir = resolveSysopStatsDir(root);
    const statsFile = path.join(sysopDir, `NumULs_${conf}${held ? 'HOLD' : ''}`);
    const readCount = (p: string, mask: number): number | null => {
      try { return (parseInt(fs.readFileSync(p, 'utf-8').trim(), 10) || 0) & mask; } catch { return null; }
    };
    const numULsFile = path.join(confDir, 'NumULs');
    const oldNum = held ? null : readCount(numULsFile, 0xffff);
    const newNum = oldNum === null || oldNum === 0 ? null : oldNum - 1;
    if (!held) {
      if (newNum === null) {
        steps.push({ describe: `${path.relative(root, numULsFile)}: ${oldNum === null ? 'absent' : '0'} - nothing to decrement`, files: [], apply: () => {} });
      } else {
        steps.push({
          describe: `${path.relative(root, numULsFile)}: ${oldNum} -> ${newNum}`,
          files: [numULsFile],
          apply: () => fs.writeFileSync(numULsFile, `${newNum}\n`),
        });
      }
    }
    const oldStats = readCount(statsFile, 0x7fffffff);
    if (oldStats === null || oldStats === 0) {
      steps.push({ describe: `${path.relative(root, statsFile)}: ${oldStats === null ? 'absent' : '0'} - nothing to decrement`, files: [], apply: () => {} });
    } else {
      steps.push({
        describe: `${path.relative(root, statsFile)}: ${oldStats} -> ${oldStats - 1}`,
        files: [statsFile],
        apply: () => fs.writeFileSync(statsFile, `${oldStats - 1}\n`),
      });
    }

    // Conf.DB: slots that saw the file stand above the counter now.
    if (newNum !== null && oldNum !== null) {
      const confDb = mpf.getConfDbPath(conf);
      const slots: Array<{ slot: number; from: number }> = [];
      if (fs.existsSync(confDb)) {
        const count = Math.floor(fs.statSync(confDb).size / CONFBASE_RECORD_SIZE);
        for (let slot = 1; slot <= count; slot++) {
          const rec = mpf.readRecord(conf, slot);
          const seen = rec ? rec.uploadTracking & 0xffff : 0;
          if (rec && seen > newNum && seen <= oldNum) slots.push({ slot, from: seen });
        }
      }
      if (slots.length > 0) {
        steps.push({
          describe: `${path.relative(root, confDb)} uploadTracking: ${slots.map((s) => `slot ${s.slot} ${s.from} -> ${newNum}`).join(', ')}`,
          files: [confDb],
          apply: () => { for (const s of slots) mpf.patchRecord(conf, s.slot, { uploadTracking: newNum }); },
        });
      } else {
        steps.push({ describe: `${path.relative(root, confDb)} uploadTracking: no slot above ${newNum}`, files: [], apply: () => {} });
      }
    }

    // ctop.data: the uploader's last record of this size (filed uploads only).
    if (!held && opts.uploader) {
      const ctopPath = path.join(confDir, 'ctop.data');
      if (fs.existsSync(ctopPath)) {
        const buf = fs.readFileSync(ctopPath);
        const records = decodeCtopRecords(buf);
        let at = -1;
        records.forEach((r, i) => {
          if (r.userName.toLowerCase() === opts.uploader!.toLowerCase() && r.bytes === target.size) at = i;
        });
        if (at >= 0) {
          const from = CTOP_HEADER_SIZE + at * CTOP_RECORD_SIZE;
          steps.push({
            describe: `${path.relative(root, ctopPath)}: ${records.length} record(s) -> ${records.length - 1} (record ${at + 1}: ${opts.uploader}, ${target.size} bytes)`,
            files: [ctopPath],
            apply: () => fs.writeFileSync(ctopPath, Buffer.concat([buf.subarray(0, from), buf.subarray(from + CTOP_RECORD_SIZE)])),
          });
        } else {
          steps.push({ describe: `${path.relative(root, ctopPath)}: no record of ${opts.uploader} with ${target.size} bytes`, files: [], apply: () => {} });
        }
      }
    }

    // The uploader's credit: bookUploadCredit gave uploads+1 and the bytes
    // (kilobytes under CREDITBYKB) to the row, user_stats and the account
    // record (saved at logoff through the overlay).
    if (opts.uploader) {
      const row = sql.prepare('SELECT id, username, slotnumber, uploads, bytesupload FROM users WHERE username = ? COLLATE NOCASE')
        .get(opts.uploader) as { id: string; username: string; slotnumber: number; uploads: number; bytesupload: number } | undefined;
      if (!row) {
        log(`[WARN] No users row for '${opts.uploader}': his credit is left alone`);
      } else {
        const byKb = togglesFromBoardConfig(loadBBSConfig(root))[ToggleFlags.CREDITBYKB] === true;
        const booked = byKb ? Math.floor(target.size / 1024) & 0x003fffff : target.size;
        const less = (n: number, by: number) => Math.max(0, (n || 0) - by);
        const disk = row.slotnumber > 0 ? ufm.readUserBySlot(row.slotnumber) : null;
        const diskOk = disk && disk.username.trim().toLowerCase() === row.username.trim().toLowerCase();
        const rowTo = { uploads: less(row.uploads, 1), bytes: less(row.bytesupload, booked) };
        steps.push({
          describe: `users row ${row.username}: uploads ${row.uploads} -> ${rowTo.uploads}, bytesupload ${row.bytesupload} -> ${rowTo.bytes}`,
          files: [],
          apply: () => { sql.prepare('UPDATE users SET uploads = ?, bytesupload = ? WHERE id = ?').run(rowTo.uploads, rowTo.bytes, row.id); },
        });
        const stats = sql.prepare('SELECT files_uploaded, bytes_uploaded FROM user_stats WHERE user_id = ?')
          .get(row.id) as { files_uploaded: number; bytes_uploaded: number } | undefined;
        if (stats) {
          const to = { files: less(stats.files_uploaded, 1), bytes: less(stats.bytes_uploaded, target.size) };
          steps.push({
            describe: `user_stats ${row.username}: files_uploaded ${stats.files_uploaded} -> ${to.files}, bytes_uploaded ${stats.bytes_uploaded} -> ${to.bytes}`,
            files: [],
            apply: () => { sql.prepare('UPDATE user_stats SET files_uploaded = ?, bytes_uploaded = ? WHERE user_id = ?').run(to.files, to.bytes, row.id); },
          });
        }
        if (diskOk && disk) {
          const to = { uploads: less(disk.uploads, 1), bytes: less(disk.bytesUpload, booked) };
          const paths = ufm.userFilePaths();
          steps.push({
            describe: `user.data/user.misc slot ${row.slotnumber}: uploads ${disk.uploads} -> ${to.uploads}, bytesUpload ${disk.bytesUpload} -> ${to.bytes}`,
            files: [paths.data, paths.keys, paths.misc],
            apply: () => ufm.updateUserDataFile({ uploads: to.uploads, bytesUpload: to.bytes }, row.slotnumber),
          });
        } else {
          log(`[WARN] slot ${row.slotnumber} of user.data does not hold '${row.username}': the account record is left alone`);
        }
      }
    } else {
      log('[WARN] No --uploader: his upload credit and ctop.data record are left alone');
    }

    const stillOtherwiseListed = located.some((l) => l.listing !== target.listing);
    const rowsBefore = rowCount();
    const bbsBefore = filesBbsHas();
    const lineCount = readDirLines(target.listing).filter((l) => l !== '').length;

    for (const step of steps) say(step.describe);
    say(`${path.relative(root, target.listing)}: ${lineCount} line(s) -> entry removed (deleteEntry)`);
    say(`bytes: ${byteFiles.length === 0 ? 'none found on local disk' : byteFiles.map((f) => path.relative(root, f)).join(', ')} -> removed`);
    say(`file_entries rows: ${rowsBefore} -> ${stillOtherwiseListed ? rowsBefore : 0}${stillOtherwiseListed ? ' (another listing still names it)' : ''}`);
    say(`Upload/FILES.BBS line: ${bbsBefore ? 'present' : 'absent'} -> ${stillOtherwiseListed && bbsBefore ? 'present' : 'absent'}`);

    if (opts.dryRun) {
      const files = [...new Set([...steps.flatMap((s) => s.files), ...writtenFiles])].filter((f) => fs.existsSync(f));
      say(`${files.length} file(s) would be backed up as <file>.remove-${name}-${stamp}.backup (plus the SQL file; the upload's bytes under ${path.join(path.dirname(dbPath), 'remove-upload-backups')})`);
      return 'dry-run';
    }

    // --- the run ------------------------------------------------------------------------
    let backups = 0;
    const bytesBackupDir = path.join(path.dirname(dbPath), 'remove-upload-backups', `${name}-${stamp}`);
    const backupFile = (p: string) => {
      if (!fs.existsSync(p)) return;
      const underRoot = path.relative(root, p);
      const dest = byteFiles.includes(p)
        ? path.join(bytesBackupDir, underRoot.startsWith('..') || path.isAbsolute(underRoot) ? path.basename(p) : underRoot)
        : `${p}.remove-${name}-${stamp}.backup`;
      if (fs.existsSync(dest)) return; // the older copy is the truer one
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p, dest);
      try {
        const st = fs.statSync(p);
        fs.chownSync(dest, st.uid, st.gid);
      } catch { /* a local copy */ }
      backups++;
    };
    for (const f of new Set([...steps.flatMap((s) => s.files), ...writtenFiles])) backupFile(f);
    const sqlBackup = `${dbPath}.remove-${name}-${stamp}.backup`;
    if (!fs.existsSync(sqlBackup)) {
      await sql.backup(sqlBackup);
      backups++;
    }

    for (const step of steps) {
      step.apply();
      log(`[OK] ${step.describe}`);
    }

    // Last: the listing is the commit point. Until it goes, a re-run finds
    // the file where it was and does the rest again.
    const outcome = await deleteEntry(ctx, conf, target.dir, file);
    log(`[OK] ${path.relative(root, target.listing)}: entry removed`);
    if (outcome.bytesError) log(`[WARN] ${outcome.bytesError}`);
    if (outcome.retentionWarning) log(`[WARN] ${outcome.retentionWarning}`);
    log(`[OK] file_entries rows: ${rowsBefore} -> ${rowCount()}`);
    log(`[OK] Upload/FILES.BBS line: ${bbsBefore ? 'present' : 'absent'} -> ${filesBbsHas() ? 'present' : 'absent'}`);
    log(`[OK] Done. ${backups} backup(s) as <file>.remove-${name}-${stamp}.backup`);
    return 'removed';
  } finally {
    sql.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const arg = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const conf = Number(arg('--conf'));
  const file = arg('--file');
  const dirArg = arg('--dir');
  if (!Number.isInteger(conf) || conf < 1 || !file) {
    console.error('usage: remove-upload.ts --conf <n> --file <NAME> [--uploader <account>] [--dir <n|hold>] [--dry-run] [--force]');
    return 2;
  }
  const outcome = await removeUpload({
    conf,
    file,
    uploader: arg('--uploader'),
    dir: dirArg === undefined ? undefined : dirArg.toLowerCase() === 'hold' ? -1 : Number(dirArg),
    dryRun: argv.includes('--dry-run'),
    force: argv.includes('--force'),
  });
  return outcome === 'refused' ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error);
    process.exit(1);
  });
}
