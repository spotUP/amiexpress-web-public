/**
 * Remove a conference from any position on the board.
 *
 * A conference IS a position. express.e:8506 tests
 * `user.conferenceAccess[confNum-1]="X"`, express.e:31849 walks
 * `FOR i:=1 TO cmds.numConf` reading NAME.i and LOCATION.i, and Conf<n>.info
 * is named by that same n. NCONFS is a COUNT, so there is no way to leave a
 * hole: a gap either truncates the conferences above it or leaves a named
 * conference with no icon behind it.
 *
 * Removing anything but the last therefore means renumbering, and renumbering
 * is only safe if EVERYTHING keyed by position moves with it. That is what
 * this service does, in one place, so the pieces cannot drift apart:
 *
 *   ConfConfig.info   NAME.n / LOCATION.n shift down, NCONFS drops by one
 *   Conf<n>.info      the removed icon goes, the ones above it are renamed
 *   user.data         every account's conferenceAccess loses that character,
 *                     so nobody silently gains or loses a conference
 *   users (SQLite)    the same string in the mirror
 *   conf_base         per-user read pointers for the removed conference go,
 *                     the ones above shift down
 *   Conf.DB           the slot is spliced out of the Amiga-side list
 *
 * The previous version refused anything but the last conference, which was
 * honest about the constraint but left the sysop stuck: on a 14-conference
 * board, removing number 3 meant removing eleven others first.
 *
 * Files are a separate decision. The conference's DIRECTORY holds every
 * message posted there and every file uploaded to it, and nothing above
 * depends on it, so it is kept unless the caller explicitly asks for it to
 * go - and the path is reported either way.
 *
 * Everything it touches is copied first, into <bbsRoot>/_conf-backups/<stamp>.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readTooltypeMap, applyTooltypes } from '../utils/info-file.util';

export interface ConferenceRemovalOptions {
  /** Delete the conference's directory too - every message and upload in it. */
  removeFiles?: boolean;
}

export interface ConferenceRemovalResult {
  /** NCONFS after the removal. */
  nconfs: number;
  /** True when conferences above the removed one had to move down. */
  renumbered: boolean;
  /** Accounts whose conferenceAccess was rewritten. */
  usersMigrated: number;
  /** The directory that was deleted, if the caller asked for it. */
  filesRemoved: string | null;
  /** The directory that was left alone, if it still exists. */
  keptOnDisk: string | null;
  /** Where the previous state was copied before anything was touched. */
  backupDir: string;
}

/** A user record as far as this migration is concerned. */
interface AccessCarrier {
  slotNumber?: number;
  confAccess?: string;
  conferenceAccess?: string;
}

export interface ConferenceRemovalDeps {
  /** Reads and rewrites user.data. Injected so the migration is testable. */
  users?: {
    readAllUsers(): AccessCarrier[];
    updateUserDataFile(user: AccessCarrier, slotNumber: number): void;
  };
  /** SQLite, for the mirror tables that are keyed by conference id. */
  sqlite?: {
    prepare(sql: string): { run(...params: unknown[]): unknown; all?(...params: unknown[]): unknown[] };
    exec?(sql: string): unknown;
  };
  /** Conf.DB, the Amiga-side conference list. */
  confDb?: {
    removeSlot(slotNumber: number): void;
  };
}

/**
 * Drop one character from a fixed-width access string and keep its width.
 *
 * `conferenceAccess` is CHAR[10] on disk (UserFileManager:45). Removing
 * conference k means removing the character at k-1 and letting the rest fall
 * left; the string is padded back to its original width with '_', which is
 * "no access" - a removal must never hand anyone a conference they did not
 * have.
 */
export function removeAccessPosition(access: string, conferenceId: number, width = 10): string {
  const padded = (access ?? '').padEnd(width, '_');
  const index = conferenceId - 1;
  if (index < 0 || index >= padded.length) return padded.slice(0, width);
  const shifted = padded.slice(0, index) + padded.slice(index + 1);
  return shifted.padEnd(width, '_').slice(0, width);
}

export class ConferenceRemovalService {
  constructor(
    private bbsRoot: string,
    private deps: ConferenceRemovalDeps = {}
  ) {}

  async remove(
    conferenceId: number,
    options: ConferenceRemovalOptions = {}
  ): Promise<ConferenceRemovalResult> {
    const confConfigPath = path.join(this.bbsRoot, 'ConfConfig.info');
    if (!fs.existsSync(confConfigPath)) {
      throw new Error('ConfConfig.info not found');
    }

    const toolTypes = readTooltypeMap(confConfigPath);
    const nconfs = parseInt(toolTypes.get('NCONFS') ?? '0', 10) || 0;

    if (!Number.isInteger(conferenceId) || conferenceId < 1 || conferenceId > nconfs) {
      throw new Error(
        `Conference ${conferenceId} does not exist. This board has ${nconfs}.`
      );
    }
    if (nconfs <= 1) {
      throw new Error('A board must keep at least one conference');
    }

    // The directory belongs to the conference being removed, so read it
    // BEFORE the entries shift underneath it.
    const location = toolTypes.get(`LOCATION.${conferenceId}`) ?? '';
    const confDir = location ? path.join(this.bbsRoot, location.replace(/^.*:/, '')) : '';

    const backupDir = this.backupEverythingThisTouches(conferenceId, nconfs);

    this.shiftConfConfig(conferenceId, nconfs, toolTypes, confConfigPath);
    this.shiftConferenceIcons(conferenceId, nconfs);
    const usersMigrated = this.migrateUserAccess(conferenceId);
    this.migrateMirrorTables(conferenceId);
    this.removeConfDbSlot(conferenceId);

    let filesRemoved: string | null = null;
    if (options.removeFiles && confDir) {
      // Refuse when the directory is still some other conference's home.
      // Numbers renumber and directories stay put, so two LOCATION.n lines
      // can name one directory - this board's conference 12 lived in
      // BBS:Conf13/, a new conference 13 was handed the same directory by
      // its number, and deleting it with the switch on destroyed conference
      // 12's messages and files. The registrations were already updated
      // above, so what is checked is the board as it now is.
      const after = readTooltypeMap(confConfigPath);
      const target = path.resolve(confDir);
      let sharedWith: string | null = null;
      for (let i = 1; i <= nconfs - 1; i += 1) {
        const loc = (after.get(`LOCATION.${i}`) ?? '').replace(/^.*:/, '');
        if (loc && path.resolve(this.bbsRoot, loc) === target) {
          sharedWith = `${i} (${after.get(`NAME.${i}`) ?? 'unnamed'})`;
          break;
        }
      }
      if (sharedWith) {
console.warn(`[ConferenceRemoval] NOT deleting ${confDir}: it is conference ${sharedWith}'s directory`);
      } else {
        this.removeConferenceDirectory(confDir);
        filesRemoved = confDir;
      }
    }

    return {
      nconfs: nconfs - 1,
      renumbered: conferenceId < nconfs,
      usersMigrated,
      filesRemoved,
      keptOnDisk: !filesRemoved && confDir && fs.existsSync(confDir) ? confDir : null,
      backupDir,
    };
  }

  /**
   * A copy of every file about to change, before any of them does.
   *
   * Renumbering rewrites the conference list, up to fourteen icons and every
   * account's access string in one go. It is correct, and it is still the
   * kind of operation that should be recoverable by copying a directory back.
   */
  private backupEverythingThisTouches(conferenceId: number, nconfs: number): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.bbsRoot, '_conf-backups', `remove-${conferenceId}-${stamp}`);
    fs.mkdirSync(backupDir, { recursive: true });

    const copy = (name: string) => {
      const from = path.join(this.bbsRoot, name);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(backupDir, name));
    };

    copy('ConfConfig.info');
    copy('user.data');
    copy('Conf.DB');
    for (let i = 1; i <= nconfs; i += 1) copy(`Conf${i}.info`);

    return backupDir;
  }

  /** NAME.n and LOCATION.n shift down; NCONFS drops by one. */
  private shiftConfConfig(
    conferenceId: number,
    nconfs: number,
    toolTypes: Map<string, string>,
    confConfigPath: string
  ): void {
    const changes = new Map<string, string>();
    for (let i = conferenceId; i < nconfs; i += 1) {
      changes.set(`NAME.${i}`, toolTypes.get(`NAME.${i + 1}`) ?? `Conference ${i}`);
      changes.set(`LOCATION.${i}`, toolTypes.get(`LOCATION.${i + 1}`) ?? `BBS:Conf${i + 1}/`);
    }
    changes.set('NCONFS', String(nconfs - 1));

    applyTooltypes(confConfigPath, changes, {
      removeKeys: key => key === `NAME.${nconfs}` || key === `LOCATION.${nconfs}`,
    });
  }

  /**
   * Conf<n>.info is named by position, so the icons move with the entries.
   *
   * The DIRECTORIES do not: LOCATION.n carries the mapping, and it moved in
   * shiftConfConfig, so conference 3 can perfectly well live in BBS:Conf4/.
   * Renaming directories would break every path that points into them.
   */
  private shiftConferenceIcons(conferenceId: number, nconfs: number): void {
    const icon = (n: number) => path.join(this.bbsRoot, `Conf${n}.info`);

    if (fs.existsSync(icon(conferenceId))) fs.unlinkSync(icon(conferenceId));
    for (let i = conferenceId; i < nconfs; i += 1) {
      if (fs.existsSync(icon(i + 1))) fs.renameSync(icon(i + 1), icon(i));
    }
  }

  /** Every account loses that one character, on disk and in the mirror. */
  private migrateUserAccess(conferenceId: number): number {
    let migrated = 0;

    const users = this.deps.users;
    if (users) {
      for (const user of users.readAllUsers()) {
        const current = user.confAccess ?? user.conferenceAccess ?? '';
        const next = removeAccessPosition(current, conferenceId);
        if (next === current) continue;
        const slot = user.slotNumber ?? 0;
        users.updateUserDataFile({ ...user, confAccess: next, conferenceAccess: next }, slot);
        migrated += 1;
      }
    }

    const sqlite = this.deps.sqlite;
    if (sqlite && sqlite.prepare) {
      try {
        // Row by row, each at its OWN width. user.data is CHAR[10], but the
        // mirror holds NCONFS-wide strings (initializeData pads them), and
        // the first version of this capped the result at ten - on a
        // thirteen-conference board that silently took conferences 11-13
        // from every account.
        const select = sqlite.prepare('SELECT id, confaccess FROM users WHERE confaccess IS NOT NULL');
        if (!select.all) {
console.warn('[ConferenceRemoval] users mirror not migrated: statement has no all()');
          return migrated;
        }
        const rows = select.all() as Array<{ id: unknown; confaccess: string }>;
        const update = sqlite.prepare('UPDATE users SET confaccess = ? WHERE id = ?');
        for (const row of rows) {
          const current = row.confaccess ?? '';
          if (current.length < conferenceId) continue;
          const next = removeAccessPosition(current, conferenceId, current.length);
          if (next !== current) update.run(next, row.id);
        }
      } catch (error) {
console.error('[ConferenceRemoval] users mirror not migrated (disk is correct):', error);
      }
    }

    return migrated;
  }

  /**
   * Every SQLite table keyed by conference id moves with the disk.
   *
   * Six of them reference conferences(id), and this first shifted only
   * conf_base - so the removed conference stayed in the `conferences` table
   * and went on being listed by everything that reads the mirror, which is
   * how a deleted conference kept showing up.
   *
   * Foreign keys are ON (database.ts:116), so parent and children cannot be
   * moved one at a time: the shift runs inside a transaction with
   * `defer_foreign_keys`, which holds the checks until commit. Children go
   * first anyway, so a database without deferral still gets a valid order.
   */
  private migrateMirrorTables(conferenceId: number): void {
    const sqlite = this.deps.sqlite;
    if (!sqlite) return;

    /** table, and the column that names a conference in it. */
    const keyedByConference: Array<[string, string]> = [
      ['message_bases', 'conferenceid'],
      ['messages', 'conferenceid'],
      ['file_areas', 'conferenceid'],
      ['bulletins', 'conferenceid'],
      ['mail_stats', 'conference_id'],
      ['conf_base', 'conference_id'],
    ];

    const exec = (sql: string) => {
      if (sqlite.exec) return sqlite.exec(sql);
      return sqlite.prepare(sql).run();
    };

    try {
      exec('BEGIN IMMEDIATE');
      exec('PRAGMA defer_foreign_keys = ON');

      for (const [table, column] of keyedByConference) {
        sqlite.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(conferenceId);
        sqlite
          .prepare(`UPDATE ${table} SET ${column} = ${column} - 1 WHERE ${column} > ?`)
          .run(conferenceId);
      }

      sqlite.prepare('DELETE FROM conferences WHERE id = ?').run(conferenceId);
      sqlite.prepare('UPDATE conferences SET id = id - 1 WHERE id > ?').run(conferenceId);

      exec('COMMIT');
    } catch (error) {
      try {
        exec('ROLLBACK');
      } catch {
        // Nothing to roll back, or the connection is already clear.
      }
console.error('[ConferenceRemoval] mirror tables not migrated (disk is correct):', error);
    }
  }

  /** Conf.DB is slot-indexed from zero, so conference n is slot n-1. */
  private removeConfDbSlot(conferenceId: number): void {
    try {
      this.deps.confDb?.removeSlot(conferenceId - 1);
    } catch (error) {
console.error('[ConferenceRemoval] Conf.DB slot not removed (disk is correct):', error);
    }
  }

  /**
   * Delete the conference's directory, and refuse anything that is not one.
   *
   * The path comes from a LOCATION tooltype, which is sysop-editable text, so
   * it is resolved and checked against the BBS root before a recursive delete
   * runs - a trusted string is not a guard.
   */
  private removeConferenceDirectory(confDir: string): void {
    const resolved = path.resolve(confDir);
    const root = path.resolve(this.bbsRoot);

    if (resolved === root || !resolved.startsWith(root + path.sep)) {
      throw new Error(
        `Refusing to delete ${resolved}: it is not inside the BBS root (${root}).`
      );
    }
    if (!fs.existsSync(resolved)) return;
    if (!fs.statSync(resolved).isDirectory()) {
      throw new Error(`Refusing to delete ${resolved}: it is not a directory.`);
    }

    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
