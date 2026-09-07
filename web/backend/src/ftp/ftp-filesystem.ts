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

import { conferenceDir } from '../conferences/conference-paths';
import { getDirFiles } from '../utils/max-dirs.util';
import { parseDirFile, type DirFileEntry } from '../utils/dir-file-reader.util';

/** One row of a listing, whatever it turns out to be underneath. */
export interface FtpEntry {
  name: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
  /** The DIR entry this row came from, for SIZE/MDTM and later RETR. */
  source?: DirFileEntry;
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
    if (segments.length > 1) return false; // one level below the root, for now
    return this.conferenceAt(user, absolutePath) !== null;
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

    const dirFiles = await getDirFiles(conf.conference_id, this.deps.bbsRoot).catch(() => []);
    const entries: FtpEntry[] = [];
    const seen = new Set<string>();
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
    if (segments.length > 2) return null;

    const wanted = segments[1].toLowerCase();
    const entries = await this.list(user, conferencePath);
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
  const type = entry.isDirectory ? 'dir' : 'file';
  const perm = entry.isDirectory ? 'el' : '';
  return (
    `type=${type};size=${entry.size};modify=${machineTimestamp(entry.modified)};perm=${perm}; ` +
    entry.name
  );
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
export function longListLine(entry: FtpEntry, now: Date = new Date()): string {
  const permissions = entry.isDirectory ? 'drwxr-xr-x' : '-rw-r--r--';
  const size = String(entry.size).padStart(12, ' ');
  const month = MONTHS[entry.modified.getMonth()] ?? 'Jan';
  const day = String(entry.modified.getDate()).padStart(2, ' ');
  const sixMonths = 183 * 24 * 60 * 60 * 1000;
  const stamp =
    now.getTime() - entry.modified.getTime() > sixMonths
      ? String(entry.modified.getFullYear()).padStart(5, ' ')
      : `${String(entry.modified.getHours()).padStart(2, '0')}:${String(
          entry.modified.getMinutes()
        ).padStart(2, '0')}`.padStart(5, ' ');
  return `${permissions}    1 bbs      bbs  ${size} ${month} ${day} ${stamp} ${entry.name}`;
}
