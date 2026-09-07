/**
 * What an FTP caller sees when he asks for a directory.
 *
 * Phase 3 of `thoughts/shared/plans/2026-09-07-ftp-server.md`. There is no
 * filesystem to expose: the board's files are DIR-file entries, one text file
 * per file area, and the "directories" a caller walks are conferences he has
 * access to. So this layer answers three questions and nothing else - what is
 * at the root, what is inside a conference, and where does a path land - and
 * every fact it uses comes from the module that already owns it:
 *
 *   - which conferences exist, and their names   `db.getConferenceConfigs()`
 *   - whether this caller may see one            `checkConfAccess` (express.e:8499)
 *   - where a conference's files live            `conferences/conference-paths`
 *   - what is in a file area                     `utils/dir-file-reader.util`
 *
 * Nothing here reads `Conf<N>` by hand: a renumbered board keeps its files in
 * LOCATION.n, which is why `conferenceDir` exists.
 */
import * as fs from 'fs';
import * as path from 'path';

import { conferenceDir } from '../conferences/conference-paths';
import { getDirFiles } from '../utils/max-dirs.util';
import { parseDirFile, type DirFileEntry } from '../utils/dir-file-reader.util';

/**
 * How far back a conference listing reaches when the sysop has not said.
 *
 * ftpd.e:1160 - `IF dayOffset=-1 THEN dayOffset:=10`.
 */
export const DEFAULT_LISTING_DAYS = 10;

/** One row of a listing, whatever it turns out to be underneath. */
export interface FtpEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
  /** The DIR entry this row came from, for SIZE/MDTM and later RETR. */
  source?: DirFileEntry;
  /**
   * Where the bytes are, when this row came from walking a directory rather
   * than reading the catalogue. `RETR` uses it directly - the file was found
   * on disk, so there is nothing left to resolve.
   */
  hostPath?: string;
}

/** The conference facts this layer needs; the shape `getConferenceConfigs` returns. */
export interface FtpConference {
  conference_id: number;
  name: string;
  exclude_ftp?: boolean;
  ndirs?: number;
}

export interface FtpFilesystemDeps {
  /** Every conference the board has, in whatever order the repository gives them. */
  conferences(): FtpConference[];
  /**
   * `FTP_DIR_DAYS` for a conference - how far back a listing reaches.
   *
   * ftpd.e:1157-1163: the tooltype, defaulting to TEN days, and
   * `makeList` emits a row only when its date is newer. An express listing is
   * the conference's recent files, not its whole history, and a board that
   * lists everything shows entries whose bytes left years ago.
   */
  listingDays?(conferenceId: number): number;
  /**
   * The conference's `DLPATH.n` directories, resolved to host paths.
   *
   * ftpd.e:1010-1058 walks these and de-duplicates any DLPATH that is a
   * prefix of another, so a parent and its child do not list the same files
   * twice.
   */
  downloadDirs?(conferenceId: number): string[];
  /**
   * `FTP_NO_DIRLIST` (ftpd.e:1170): list the DIRECTORIES rather than the DIR
   * files. The catalogue is the default; this is the sysop saying his
   * conference is better described by what is on disk.
   */
  listsDirectories?(conferenceId: number): boolean;
  /** express.e's own access check, per caller and conference. */
  canAccess(user: unknown, conferenceId: number): boolean;
  /** The board root, for `conferenceDir`. */
  bbsRoot: string;
}

/**
 * `001-General`. Fixed-width number first so a client sorts them the way the
 * board numbers them, and the name is stripped of anything that would look
 * like another path segment (express.e:28946-28952 does the same).
 */
export function conferenceDirectoryName(conf: FtpConference): string {
  const number = String(conf.conference_id).padStart(3, '0');
  const name = (conf.name || `Conference ${conf.conference_id}`)
    .replace(/[/\\]/g, '')
    .trim();
  return `${number}-${name}`;
}

/** Split a path into segments, tolerating `//`, a trailing slash and `.`. */
export function pathSegments(input: string): string[] {
  return input
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.');
}

/**
 * Where a `CWD` argument lands, given where the caller is now.
 *
 * Returns the new absolute path, or null when the argument climbs above the
 * root - a caller must never be able to name anything outside his tree, and
 * `..` from the root is the obvious way to try.
 */
export function resolvePath(current: string, argument: string): string | null {
  const base = argument.startsWith('/') ? [] : pathSegments(current);
  for (const segment of pathSegments(argument)) {
    if (segment === '..') {
      if (base.length === 0) return null;
      base.pop();
      continue;
    }
    base.push(segment);
  }
  return `/${base.join('/')}`.replace(/\/+$/, '') || '/';
}

export class FtpFilesystem {
  private readonly deps: FtpFilesystemDeps;

  constructor(deps: FtpFilesystemDeps) {
    this.deps = deps;
  }

  /** The conferences this caller may see, excluding the ones marked off FTP. */
  visibleConferences(user: unknown): FtpConference[] {
    return this.deps
      .conferences()
      .filter((conf) => !conf.exclude_ftp)
      .filter((conf) => this.deps.canAccess(user, conf.conference_id))
      .sort((a, b) => a.conference_id - b.conference_id);
  }

  /** The conference a path's first segment names, or null when it names none. */
  conferenceAt(user: unknown, absolutePath: string): FtpConference | null {
    const [first] = pathSegments(absolutePath);
    if (!first) return null;
    const wanted = first.toLowerCase();
    return (
      this.visibleConferences(user).find(
        (conf) => conferenceDirectoryName(conf).toLowerCase() === wanted
      ) ?? null
    );
  }

  /** Whether a caller may stand here. The root always exists; a conference must. */
  exists(user: unknown, absolutePath: string): boolean {
    const segments = pathSegments(absolutePath);
    if (segments.length === 0) return true;

    const conf = this.conferenceAt(user, `/${segments[0]}`);
    if (!conf) return false;
    if (segments.length === 1) return true;

    // Deeper: a real directory under one of the conference's DLPATHs -
    // ftpd.e's `subDirPath` (1232-1330). Checked on disk rather than assumed,
    // so `CWD nonsense` is still 550.
    const subPath = segments.slice(1).join('/');
    return (this.deps.downloadDirs?.(conf.conference_id) ?? []).some((root) => {
      try {
        return fs.statSync(path.join(root, subPath)).isDirectory();
      } catch {
        return false;
      }
    });
  }

  /**
   * The rows for a path: conferences at the root, files inside one.
   *
   * A conference whose DIR files cannot be read lists empty rather than
   * failing - an unreadable area is a sysop problem, not a reason to refuse
   * the caller the rest of the board.
   */
  async list(user: unknown, absolutePath: string): Promise<FtpEntry[]> {
    const segments = pathSegments(absolutePath);
    if (segments.length === 0) {
      return this.visibleConferences(user).map((conf) => ({
        name: conferenceDirectoryName(conf),
        isDirectory: true,
        size: 0,
        modified: new Date(),
      }));
    }

    const conf = this.conferenceAt(user, absolutePath);
    if (!conf) return [];

    /*
     * ftpd.e:1166-1174 - WHICH SOURCE.
     *
     *   inside a subdirectory        -> the DLPATH directories
     *   FTP_NO_DIRLIST on the conf   -> the DLPATH directories
     *   otherwise                    -> the DIR files, the catalogue
     *
     * The catalogue is the default and stays it. Walking the directories is
     * what a sysop asks for when the conference's real contents describe it
     * better than its DIR files do - and it is the only thing that CAN
     * describe a subdirectory, which the catalogue has no notion of.
     */
    const subPath = pathSegments(absolutePath).slice(1).join('/');
    if (subPath || this.deps.listsDirectories?.(conf.conference_id)) {
      return this.listFromDownloadDirs(conf, subPath);
    }

    const dirFiles = await getDirFiles(conf.conference_id, this.deps.bbsRoot).catch(() => []);
    const entries: FtpEntry[] = [];
    const seen = new Set<string>();
    // ftpd.e:1157-1163 - FTP_DIR_DAYS, ten days when the tooltype is absent.
    // A listing is what arrived recently, not everything the conference ever
    // held: the sysop's client showed `-D-CALC.LHA`, an entry whose bytes had
    // long gone, because ours was unbounded.
    const days = this.deps.listingDays?.(conf.conference_id) ?? DEFAULT_LISTING_DAYS;
    const oldest = days > 0 ? Date.now() - days * 86_400_000 : 0;
    for (const dirFile of dirFiles) {
      let content: string;
      try {
        content = fs.readFileSync(dirFile.path, 'latin1');
      } catch {
        continue;
      }
      for (const parsed of parseDirFile(content)) {
        const name = parsed.filename.trim();
        // A file can be listed in more than one area; a caller wants it once.
        if (!name || seen.has(name.toLowerCase())) continue;
        // The date bound. An entry with no usable date is KEPT: a listing that
        // silently drops rows because a DIR line is malformed is worse than
        // one that shows an old file.
        const when = parsed.uploadDate?.getTime?.();
        if (oldest > 0 && typeof when === 'number' && !Number.isNaN(when) && when < oldest) {
          continue;
        }
        seen.add(name.toLowerCase());
        entries.push({
          name,
          isDirectory: false,
          size: parsed.fileSize,
          modified: parsed.uploadDate,
          source: parsed,
        });
      }
    }
    return entries;
  }

  /**
   * The conference's DLPATH directories, walked - ftpd.e:1010 and 910.
   *
   * Directories are listed as well as files, because that is what makes a
   * subdirectory reachable: a client can only enter what a listing showed it.
   * A name seen in more than one DLPATH is listed once, and the date bound
   * applies here exactly as it does to the catalogue.
   */
  private async listFromDownloadDirs(conf: FtpConference, subPath: string): Promise<FtpEntry[]> {
    const roots = this.deps.downloadDirs?.(conf.conference_id) ?? [];
    if (roots.length === 0) return [];

    const days = this.deps.listingDays?.(conf.conference_id) ?? DEFAULT_LISTING_DAYS;
    const oldest = days > 0 ? Date.now() - days * 86_400_000 : 0;

    const entries: FtpEntry[] = [];
    const seen = new Set<string>();

    for (const root of roots) {
      const dir = subPath ? path.join(root, subPath) : root;
      let names: string[];
      try {
        names = fs.readdirSync(dir);
      } catch {
        // A DLPATH that is not there, or a subdirectory this one does not
        // have: the next DLPATH may still have it.
        continue;
      }

      for (const name of names) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;

        let stats: fs.Stats;
        try {
          stats = fs.statSync(path.join(dir, name));
        } catch {
          continue;
        }

        // A DIRECTORY is always listed: the date bound is about files
        // arriving, and hiding a directory hides everything under it.
        if (!stats.isDirectory() && oldest > 0 && stats.mtimeMs < oldest) continue;

        seen.add(key);
        entries.push({
          name,
          isDirectory: stats.isDirectory(),
          size: stats.isDirectory() ? 0 : stats.size,
          modified: stats.mtime,
          hostPath: path.join(dir, name),
        });
      }
    }

    return entries;
  }

  /**
   * One entry by path - a FILE inside a conference, or the conference itself.
   *
   * `SIZE`, `MDTM` and `MLST` all ask about a single name, and until now the
   * tree could only answer about directories: `MLST 1oo-olsk.txt` came back
   * `550 no such directory` for a file that was right there in the listing.
   */
  async find(user: unknown, absolutePath: string): Promise<FtpEntry | null> {
    const segments = pathSegments(absolutePath);
    if (segments.length === 0) {
      return { name: '/', isDirectory: true, size: 0, modified: new Date() };
    }

    const conferencePath = `/${segments[0]}`;
    const conf = this.conferenceAt(user, conferencePath);
    if (!conf) return null;

    if (segments.length === 1) {
      return {
        name: conferenceDirectoryName(conf),
        isDirectory: true,
        size: 0,
        modified: new Date(),
      };
    }
    // Anything deeper resolves by listing the PARENT and matching the last
    // segment - one code path for SIZE, MDTM, MLST and RETR, whether the row
    // came from the catalogue or from a directory walk.
    const wanted = segments[segments.length - 1].toLowerCase();
    const parent = segments.length === 2 ? conferencePath : `/${segments.slice(0, -1).join('/')}`;
    const entries = await this.list(user, parent);
    return entries.find((entry) => entry.name.toLowerCase() === wanted) ?? null;
  }

  /** The conference directory on disk, for the phases that read bytes. */
  conferencePath(conf: FtpConference): string {
    return conferenceDir(this.deps.bbsRoot, conf.conference_id);
  }
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `YYYYMMDDHHMMSS` in UTC - the only time format RFC 3659 allows. */
export function machineTimestamp(when: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return (
    `${pad(when.getUTCFullYear(), 4)}${pad(when.getUTCMonth() + 1)}${pad(when.getUTCDate())}` +
    `${pad(when.getUTCHours())}${pad(when.getUTCMinutes())}${pad(when.getUTCSeconds())}`
  );
}

/**
 * One row of `MLSD`: facts, then a space, then the name.
 *
 * This is the listing a modern client actually prefers - Transmit asks for
 * `MLSD` as soon as `FEAT` advertises `MLST`, and ours advertised it while
 * answering 502, so the client was told the board could do machine listings
 * and then refused one. The facts are the ones named in that FEAT line:
 * type, size, modify, perm.
 *
 * `perm` is deliberately narrow. `el` on a directory is enter + list; `r` on a
 * file is retrieve, which is phase 4 - until then a file says nothing about
 * being readable rather than promising something the server would refuse.
 */
export function machineListLine(entry: FtpEntry): string {
  // ftpd.e:878-891:
  //   `Type=dir;Modify=<ts>;Perm=r; <name>`
  //   `Type=file;Size=<n>;Modify=<ts>;Perm=r; <name>`
  //
  // `Perm=r` on both: this server hands out reads. An earlier version said
  // `perm=el` on a directory and nothing on a file, which promised a client
  // less than the board actually offers.
  const modify = machineTimestamp(entry.modified);
  return entry.isDirectory
    ? `Type=dir;Modify=${modify};Perm=r; ${entry.name}`
    : `Type=file;Size=${entry.size};Modify=${modify};Perm=r; ${entry.name}`;
}


/**
 * One row of `LIST` in the Unix long format every client parses.
 *
 * The format is a de-facto standard rather than a specification, and clients
 * are strict about the column count: permissions, links, owner, group, size,
 * month, day, time-or-year, name. The owner and group are constants because
 * the board has no such thing - what matters is that the field is there.
 *
 * A date inside the last six months shows a time; an older one shows the year.
 * That is what `ls` does, and a client that guesses the year from a missing
 * field gets it right for both.
 */
export function longListLine(entry: FtpEntry, _now: Date = new Date()): string {
  // ftpd.e:885-897, exactly:
  //   `dr--r--r--   1 root  root %10d %s %s`  for a directory
  //   `-r--r--r--   1 root  root %10d %s %s`  for a file
  //
  // Read-only permissions and a `root root` owner because that is what the
  // board tells a caller: nothing here is his to change. The date is
  // `formatFileDate` (ftpd.e:647) - `MMM-DD-YYYY HH:MM`, one field, not the
  // Unix "recent or year" pair.
  const permissions = entry.isDirectory ? 'dr--r--r--' : '-r--r--r--';
  const size = String(entry.isDirectory ? 0 : entry.size).padStart(10, ' ');
  return `${permissions}   1 root  root ${size} ${listDate(entry.modified)} ${entry.name}`;
}

/** `Sep-07-2026 19:45` - ftpd.e:660, the date a LIST row carries. */
export function listDate(when: Date): string {
  const month = MONTHS[when.getMonth()] ?? 'Jan';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${month}-${pad(when.getDate())}-${when.getFullYear()} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

