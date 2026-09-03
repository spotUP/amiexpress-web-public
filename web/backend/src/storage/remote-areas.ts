/**
 * Which file areas live in the pool, and where an object for one of them sits.
 *
 * WHERE THE REMOTE MARKER LIVES, AND WHY IT IS NOT THE DATABASE COLUMN.
 *
 * Task 5 added `file_areas.storage_volume`, and the running board never reads
 * it. The area list the live F/D paths use is built by
 * `services/file-areas-loader.ts` from each `Conf<N>.info` - NDIRS, DLPATH.n,
 * ULPATH.n - and injected at `server/initialization.ts:385`. SQL is a mirror
 * of disk on this board (users, access, file listings all read disk first), so
 * a marker that only exists in SQL is a marker the download path cannot see.
 *
 * So the RUNTIME marker is a tooltype beside the paths it qualifies:
 *
 *     NDIRS=2
 *     DLPATH.1=BBS:Conf1/Files/
 *     STORAGEDRIVE.1=2          the files of dir 1 live on DRIVE.2
 *     STORAGEDRIVE=2            (or: every dir in this conference does)
 *
 * which a real AmiExpress binary ignores exactly as it ignores any tooltype it
 * does not know. The DB column stays as the admin-page mirror Task 11 reports
 * from; nothing branches on it.
 *
 * This module is deliberately I/O free - `remote-download.ts` does the
 * fetching - so the upload path, the download path and DosLibrary all decide
 * "is this remote, and under what key" from the same few pure functions rather
 * than each growing its own answer.
 */
import * as path from 'path';
import { getConferenceDir } from '../utils/file-hold.util';

/** One object: the drive that holds it and its key on that drive. */
export interface RemoteLocation {
  driveNumber: number;
  key: string;
}

/**
 * A file area, reduced to what a storage decision needs.
 *
 * `path` is the area's own directory - the loader's `dlPath`
 * (`BBS:Conf1/Files/`) or the catalog row's `path`. Only its LAST component
 * is used; see `objectPrefixFor`.
 */
export interface RemoteArea {
  id: number;
  conferenceId: number;
  dirNumber: number;
  path: string;
  /** The drive this area's files live on. Undefined means local disk. */
  storageVolume?: number;
  /** Which class of pooled volume new files here prefer. Task 9 reads it. */
  volumeClassPref?: 'FREE' | 'PAID';
}

/** The disk loader's shape, which is what the running board actually has. */
export interface DiskFileArea {
  id: number;
  conferenceId: number;
  dirNumber: number;
  dlPath: string;
  ulPath: string;
  storageVolume?: number;
  volumeClassPref?: 'FREE' | 'PAID';
}

/**
 * A catalog row, in either of the two shapes this codebase hands around: the
 * mapped `FileEntry` (`storageVolume`) and a raw `SELECT fe.*` row
 * (`storage_volume`).
 *
 * Both are accepted on purpose. `server/file-socket-handlers.ts` looks a
 * download up by id through the repository but by NAME through a raw SELECT,
 * so the same file arrives here camelCase down one path and snake_case down
 * the other. A reader that knew only one shape would decide "local disk" for
 * every by-name download of a pooled file - silently, since undefined is
 * exactly what a genuinely local row looks like.
 */
export interface CatalogLocationRow {
  storageVolume?: number | null;
  objectKey?: string | null;
  storage_volume?: number | null;
  object_key?: string | null;
}

/** Where the pool keeps an area's objects when the area names no directory. */
const DEFAULT_AREA_LEAF = 'Files';

/** `BBS:` and friends - an AmigaDOS volume name, which is not a path segment. */
const AMIGA_VOLUME = /^[^/:]*:/;

/**
 * The object this catalog row names, or null when it is on local disk.
 *
 * Both halves are required. Half a location (a drive with no key, a key with
 * no drive) is a row mid-write or mid-migration, and guessing the other half
 * would send a fetch at the wrong bucket or at the wrong name.
 */
export function remoteLocationFor(entry: CatalogLocationRow): RemoteLocation | null {
  const driveNumber = entry.storageVolume ?? entry.storage_volume ?? undefined;
  const key = entry.objectKey ?? entry.object_key ?? undefined;
  if (driveNumber === null || driveNumber === undefined) return null;
  if (!key) return null;
  return { driveNumber, key };
}

export function isRemoteArea(area: { storageVolume?: number }): boolean {
  return area.storageVolume !== undefined;
}

/** The area's own directory name, with any Amiga volume and slashes removed. */
function leafOf(areaPath: string): string {
  const withoutVolume = areaPath.replace(AMIGA_VOLUME, '');
  const trimmed = withoutVolume.replace(/\/+$/, '');
  const leaf = trimmed.split('/').pop() ?? '';
  if (leaf === '' || /^Conf\d+$/i.test(leaf)) return DEFAULT_AREA_LEAF;
  return leaf;
}

/**
 * `Conf1/Files/` - the key prefix for an area.
 *
 * The conference number comes from the AREA, never from its path: a DLPATH
 * pointing at another conference's directory is a misconfiguration, and
 * letting it choose the prefix would file the objects where the other
 * conference's name index looks for them.
 */
export function objectPrefixFor(area: { conferenceId: number; path: string }): string {
  return `Conf${area.conferenceId}/${leafOf(area.path)}/`;
}

/** Where this area's files would sit on local disk, remote or not. */
export function areaLocalRoot(area: { conferenceId: number; path: string }, dataDir: string): string {
  return path.join(getConferenceDir(area.conferenceId, dataDir), leafOf(area.path));
}

export function remoteAreaFromDisk(area: DiskFileArea): RemoteArea {
  return {
    id: area.id,
    conferenceId: area.conferenceId,
    dirNumber: area.dirNumber,
    path: area.dlPath,
    storageVolume: area.storageVolume,
    volumeClassPref: area.volumeClassPref,
  };
}

/** The pooled areas of one conference, in the order the board declared them. */
export function remoteAreasFor(conferenceId: number, areas: readonly RemoteArea[]): RemoteArea[] {
  return areas.filter(area => area.conferenceId === conferenceId && isRemoteArea(area));
}

/**
 * True when `child` is a file INSIDE `root` - a path question, not a string
 * one. `<root>Files2/X` starts with `<root>Files`, and answering yes to that
 * would put another area's files under this area's key prefix.
 */
function containedIn(root: string, child: string): string | null {
  const relative = path.relative(root, child);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative;
}

/**
 * The drive and key behind a path that has already been resolved on disk.
 *
 * DosLibrary works in resolved local paths - by the time a door has opened
 * `BBS:Conf1/Files/DOOR.DAT` the emulator holds one - so Task 10 needs the
 * inverse of `objectPrefixFor`. The longest matching area wins, so an area
 * nested inside another's directory takes its own files with it.
 */
export function locateByRealPath(
  realPath: string,
  areas: readonly RemoteArea[],
  dataDir: string
): RemoteLocation | null {
  const resolved = path.resolve(realPath);

  let best: { area: RemoteArea; relative: string; rootLength: number } | null = null;
  for (const area of areas) {
    if (!isRemoteArea(area)) continue;
    const root = path.resolve(areaLocalRoot(area, dataDir));
    const relative = containedIn(root, resolved);
    if (relative === null) continue;
    if (!best || root.length > best.rootLength) {
      best = { area, relative, rootLength: root.length };
    }
  }

  if (!best) return null;
  const driveNumber = best.area.storageVolume;
  if (driveNumber === undefined) return null;
  return {
    driveNumber,
    key: `${objectPrefixFor(best.area)}${best.relative.split(path.sep).join('/')}`,
  };
}
