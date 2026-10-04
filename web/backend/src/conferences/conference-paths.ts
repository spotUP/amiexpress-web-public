/**
 * Where a conference's files actually live.
 *
 * A conference IS a position - express.e:8506 tests
 * `user.conferenceAccess[confNum-1]` - but its DIRECTORY is whatever
 * `LOCATION.n` in ConfConfig.info says, and express.e:31849 reads exactly
 * that: `FOR i:=1 TO cmds.numConf` walking NAME.i and LOCATION.i. The
 * directory is never derived from the number.
 *
 * That distinction only shows itself when a board is renumbered. Deleting a
 * conference shifts NAME.n/LOCATION.n down and renames the icons
 * (conference-removal.service.ts), and deliberately leaves the directories
 * alone, because the messages and uploads inside one belong to the conference
 * rather than to its position. So on the live board, after the sysop deleted
 * conference 1:
 *
 *   NAME.1=Amiga Warez!   LOCATION.1=BBS:Conf2/
 *
 * Any reader that builds `Conf<n>` from the number then reads the directory of
 * the conference that was DELETED - which is how file listing came back empty
 * for the conference that had moved into position 1.
 *
 * One resolver, so the writer and the readers cannot drift apart again.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfConfig } from '../services/conf-config.service';
import * as amigafs from '../utils/amigafs';
import { BBSPaths } from '../utils/bbs-paths.util';

/**
 * Which conferences the board HAS, as numbers - 1..NCONFS.
 *
 * Not the `Conf<n>` directories on disk. Deleting a conference shifts the
 * entries down and leaves the directories alone, so a board with five
 * conferences can carry fourteen directories, nine of them belonging to
 * conferences that no longer exist. Reading the disk instead of ConfConfig.info
 * invents those nine back: the screen manager listed fourteen conferences for
 * CONF_JOINMSGBASE on the live board, six through fourteen reading directories
 * nothing joins.
 *
 * Falls back to the directories only when there is no ConfConfig.info at all,
 * which is what a board that has never been configured looks like - the same
 * fallback conferenceDir() makes, for the same reason.
 */
export function conferenceNumbers(bbsRoot: string): number[] {
  try {
    const config = loadConfConfig(bbsRoot);
    if (config && config.confCount > 0) {
      return Array.from({ length: config.confCount }, (_, i) => i + 1);
    }
  } catch { /* fall through to the directories */ }

  try {
    return fs.readdirSync(bbsRoot)
      .filter(entry => /^Conf\d+$/.test(entry))
      .map(entry => parseInt(entry.slice(4), 10))
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * The conference's directory, absolute.
 *
 * Falls back to `<bbsRoot>/Conf<n>` when the board has no ConfConfig.info, the
 * entry carries no LOCATION, or the number is past NCONFS - which is what
 * express.e's own default amounts to, and what every board that has never been
 * renumbered looks like.
 */
export function conferenceDir(bbsRoot: string, conferenceNumber: number): string {
  const fallback = path.join(bbsRoot, `Conf${conferenceNumber}`);

  let location = '';
  try {
    const config = loadConfConfig(bbsRoot);
    location = config?.entries[conferenceNumber - 1]?.location?.trim() ?? '';
  } catch {
    return caseResolved(fallback);
  }

  if (!location) return caseResolved(fallback);

  // LOCATION is an Amiga path - `BBS:Conf2/` - with a trailing slash that
  // path.join would otherwise carry into the directory name.
  const cleaned = location.replace(/[\\/]+$/, '');
  const resolved = cleaned.includes(':')
    ? new BBSPaths(bbsRoot).resolveAmigaPath(cleaned)
    : path.resolve(bbsRoot, cleaned);

  return caseResolved(resolved || fallback);
}

/**
 * The last step every exit of conferenceDir() takes.
 *
 * AmigaDOS is case-insensitive; ext4 under the Linux container is not. A sysop
 * who writes `LOCATION.2=BBS:elitearea/` for a directory that sits on disk as
 * `EliteArea/` gets a path that exists on the macOS dev machine and ENOENTs on
 * the board. amigafs.resolveExistingAncestors() walks the deepest EXISTING
 * ancestor, so a directory that is not there yet still lands inside its
 * correctly-cased parent instead of minting a lowercase twin beside it.
 */
function caseResolved(hostPath: string): string {
  return amigafs.resolveExistingAncestors(hostPath);
}

/** A path inside the conference's directory - `Files`, `MsgBase`, `DIR3`. */
export function conferenceSubdir(bbsRoot: string, conferenceNumber: number, ...parts: string[]): string {
  return path.join(conferenceDir(bbsRoot, conferenceNumber), ...parts);
}

/**
 * The conference's location in the form a 68K door expects: `BBS:Conf2/`,
 * with the trailing slash a door concatenates onto.
 *
 * BB_CONFLOCAL, BB_PCONFLOCAL and MSGBASE_LOC all answer with this. Built from
 * the number instead, a door on a renumbered board is told to write into the
 * directory of the conference that was deleted.
 *
 * @param parts optional subdirectory, e.g. 'MsgBase' -> `BBS:Conf2/MsgBase/`
 */
export function conferenceAmigaPath(bbsRoot: string, conferenceNumber: number, ...parts: string[]): string {
  let location = '';
  try {
    const config = loadConfConfig(bbsRoot);
    location = config?.entries[conferenceNumber - 1]?.location?.trim() ?? '';
  } catch {
    location = '';
  }

  const base = location || `BBS:Conf${conferenceNumber}/`;
  const withoutTrailer = base.replace(/[\\/]+$/, '');
  const suffix = parts.length ? `/${parts.join('/')}` : '';

  return `${withoutTrailer}${suffix}/`;
}

/**
 * The directories a conference's DOWNLOADS actually live in.
 *
 * `DLPATH.1..16` in the conference's own icon - `<root>/Conf2.info`, the
 * SIBLING of the directory, which is AmiExpress's layout - and they routinely
 * point somewhere other than `<confDir>/Files`. On the live board
 * `Conf2.info` says `DLPATH.1=BBS:Conf3/Files` and `Conf3.info` says
 * `BBS:Conf5/Files`.
 *
 * This exists because the two halves disagreed: `moveToFiles` writes an
 * upload into DLPATH (express.e:15264), and `resolveFile` looked only in
 * `<confDir>/Files` and `<confDir>/Upload`. On a board configured like this
 * one, a file uploaded through the BBS could never be downloaded again - over
 * FTP or at the `D` prompt.
 *
 * Returns the resolved host paths in tooltype order, deduplicated, with
 * anything unreadable dropped: a sysop's typo in DLPATH.7 must not cost the
 * caller DLPATH.1.
 */
/**
 * The conference database a caller's per-conference record lives in -
 * express.e:2102-2111 getConfDbFileName.
 *
 * `CONFDB_SHARED=<n>` on the conference's icon points it at conference n's
 * file (2104-2105); otherwise it is the conference's own LOCATION directory
 * (2109) plus `Conf.DB` (confDBName, 31931). The record at
 * `(slot-1)*SIZEOF confBase` in it holds the caller's message pointers, scan
 * flags and - under ACS_CONFERENCE_ACCOUNTING - his upload, download and
 * ratio figures for that conference.
 *
 * Not ported: a conference with several message bases keeps one file per
 * base under each base's LOCATION.n (2106-2107); this port has no per-base
 * message locations anywhere yet, so every base of a conference resolves to
 * the conference's file. The node's `CONF_DB` tooltype (31932) renaming the
 * file is not read either.
 */
export function conferenceConfDbPath(bbsRoot: string, conferenceNumber: number): string {
  const owner = confDbSharedWith(bbsRoot, conferenceNumber) || conferenceNumber;
  return path.join(conferenceDir(bbsRoot, owner), 'Conf.DB');
}

/** express.e:4895/4930 - accounting is skipped in a conference whose database is shared. */
export function conferenceConfDbShared(bbsRoot: string, conferenceNumber: number): boolean {
  return confDbSharedWith(bbsRoot, conferenceNumber) > 0;
}

/** `CONFDB_SHARED` on the conference's icon, or 0 (readToolTypeInt's -1). */
function confDbSharedWith(bbsRoot: string, conferenceNumber: number): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readTooltypeMap } = require('../utils/info-file.util') as typeof import('../utils/info-file.util');
    const shared = parseInt(readTooltypeMap(`${conferenceDir(bbsRoot, conferenceNumber)}.info`).get('CONFDB_SHARED') ?? '', 10);
    return Number.isFinite(shared) && shared > 0 ? shared : 0;
  } catch {
    return 0;
  }
}

/**
 * How many file directories a conference has: `NDIRS` on its icon, the one
 * number express.e reads (5006, 15264 `maxDirs:=readToolTypeInt(...,'NDIRS')`)
 * and the bound on every directory it offers. No NDIRS - no file areas
 * (readToolTypeInt answers -1, and 1 <= n <= -1 never holds).
 *
 * The port had three answers: this tooltype in some places, a plain NDIRS
 * FILE in the screen index, and a count of the DIR files on disk in F, FR,
 * FM, Z, V and A - so a leftover DIR file became a directory the board
 * offered and express.e does not.
 */
export function conferenceNdirs(bbsRoot: string, conferenceNumber: number): number {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readTooltypeMap } = require('../utils/info-file.util') as typeof import('../utils/info-file.util');
    const count = parseInt(readTooltypeMap(`${conferenceDir(bbsRoot, conferenceNumber)}.info`).get('NDIRS') ?? '', 10);
    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch {
    return 0;
  }
}

export function conferenceDownloadDirs(bbsRoot: string, conferenceNumber: number): string[] {
  return conferencePathDirs(bbsRoot, conferenceNumber, 'DLPATH');
}

/**
 * The directories a conference's UPLOADS are staged into - `ULPATH.1..16` in
 * the same icon, read exactly as the download side reads `DLPATH`.
 *
 * express.e:18440-18447 walks these in `checkForFile`, which is why this
 * exists: a file already sitting in an upload directory is a duplicate, and
 * answering that question needs the same resolver downloads use rather than a
 * second guess at where a conference keeps its files.
 */
export function conferenceUploadDirs(bbsRoot: string, conferenceNumber: number): string[] {
  return conferencePathDirs(bbsRoot, conferenceNumber, 'ULPATH');
}

/**
 * The shared walk behind both.
 *
 * ONE DELIBERATE DIVERGENCE FROM express, recorded rather than hidden:
 * express stops at the first tooltype that does not read
 * (`WHILE readToolType(...)`, express.e:18432 and :18441), so a board with
 * `DLPATH.1` and `DLPATH.3` and no `DLPATH.2` loses the third directory. This
 * walks 1..16 and skips the gap, which is what the download and FTP sides of
 * this port have always done. A superset can only make a duplicate check
 * stricter, never looser, and one resolver beats two.
 */
function conferencePathDirs(bbsRoot: string, conferenceNumber: number, prefix: 'DLPATH' | 'ULPATH'): string[] {
  const iconPath = `${conferenceDir(bbsRoot, conferenceNumber)}.info`;

  let tooltypes: Map<string, string>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readTooltypeMap } = require('../utils/info-file.util') as typeof import('../utils/info-file.util');
    tooltypes = readTooltypeMap(iconPath);
  } catch {
    // No icon, or one this reader cannot parse. The caller falls back to the
    // conventional directories.
    return [];
  }

  const resolved: string[] = [];
  for (let index = 1; index <= 16; index++) {
    const value = tooltypes.get(`${prefix}.${index}`)?.trim();
    if (!value) continue;
    try {
      const host = value.includes(':')
        ? new BBSPaths(bbsRoot).resolveAmigaPath(value.replace(/\/+$/, ''))
        : path.resolve(bbsRoot, value.replace(/\/+$/, ''));
      const settled = amigafs.resolveExistingAncestors(host);
      if (settled && !resolved.includes(settled)) resolved.push(settled);
    } catch {
      // One bad tooltype does not spoil the rest.
    }
  }
  return resolved;
}
