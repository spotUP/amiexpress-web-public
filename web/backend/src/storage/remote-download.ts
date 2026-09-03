/**
 * Turning a caller's filename into a real local file, when the area is pooled.
 *
 * Zmodem, the HTTP download route and every stat the board keeps all want a
 * path on local disk. So does a door. This module is the one place that turns
 * "DEMO.LHA in conference 1" into such a path when conference 1's files live
 * in a bucket, and it keeps the distinction the whole subsystem is built on:
 *
 *   - null              the area genuinely does not hold that name
 *   - throws Unavailable the volume could not answer; ask again later
 *
 * They must never collapse into one another. `NameIndex.resolve` already
 * guarantees this for the lookup half (it re-raises rather than answering null
 * while the backend is known down), and `FileCache.ensureLocal` for the fetch
 * half; this module's only job is not to undo it - so it catches nothing.
 */
import * as path from 'path';
import * as fs from 'fs';
import {
  objectPrefixFor,
  remoteLocationFor,
  usableRemoteAreasFor,
  type CatalogLocationRow,
  type RemoteArea,
} from './remote-areas';
import type { StorageContext } from './storage-context';
import { isStorageUnavailable } from './file-cache';

/** A pooled object, materialised. `fullPath` is a real file on local disk. */
export interface RemoteFile {
  name: string;
  size: number;
  fullPath: string;
  driveNumber: number;
  key: string;
}

/**
 * Fetch an object the caller named, or null if no pooled area of this
 * conference holds it.
 *
 * The catalog is not consulted. On this board the file listings a caller sees
 * are DIR files on disk and the SQL catalog is a mirror, so a pooled file may
 * have no row at all - which is exactly why Task 6 built a name index over the
 * bucket's own listing. `remoteLocationFor` remains the shortcut for the paths
 * that DO start from a catalog row (`materialiseCatalogEntry` below, and
 * DosLibrary in Task 10).
 */
export async function materialiseRemoteFile(
  filename: string,
  conferenceId: number,
  storage: StorageContext
): Promise<RemoteFile | null> {
  for (const area of usableAreas(conferenceId, storage)) {
    const driveNumber = area.storageVolume;
    if (driveNumber === undefined) continue;

    const index = storage.names.forArea(driveNumber, objectPrefixFor(area));
    const key = await index.resolve(filename);
    if (key === null) continue;

    return await materialise(driveNumber, key, storage);
  }
  return null;
}

/**
 * Every pooled file of this conference whose name the caller accepts - the
 * wildcard form of the lookup above. `D DEMO*.LHA` is ordinary BBS usage, and
 * a pooled area has no directory for `readdirSync` to walk.
 *
 * The matcher comes from the caller so the storage layer does not become a
 * third wildcard dialect; see `NameIndex.match`.
 */
export async function materialiseRemoteMatches(
  matches: (name: string) => boolean,
  conferenceId: number,
  storage: StorageContext
): Promise<RemoteFile[]> {
  const found: RemoteFile[] = [];
  for (const area of usableAreas(conferenceId, storage)) {
    const driveNumber = area.storageVolume;
    if (driveNumber === undefined) continue;

    const index = storage.names.forArea(driveNumber, objectPrefixFor(area));
    for (const key of await index.match(matches)) {
      found.push(await materialise(driveNumber, key, storage));
    }
  }
  return found;
}

/**
 * The local path for a file resolved earlier in this command, fetched again if
 * the cache has since evicted it.
 *
 * The gap is real: `D` resolves its files, prints them, waits at the "start
 * download?" prompt and only then hands paths to Zmodem, which existsSync-
 * checks every one and tells the caller "files not found" if any is missing.
 * Another node's fetch can evict a clean cached copy inside that window.
 *
 * Re-materialising at send time is the whole fix - deliberately NOT a pin API
 * on FileCache. Its pins exist for bytes that are the only copy of something
 * not yet uploaded; a transfer-scoped pin would be a second lifetime rule in a
 * module that just had one removed for being a second record, and a caller who
 * disconnects mid-transfer would leak it. A pooled object always has its copy
 * in the bucket, so fetching it again is correct and costs a request only in
 * the rare case it was actually evicted.
 */
export async function rematerialise(
  file: { fullPath: string; driveNumber?: number; objectKey?: string },
  storage: StorageContext | null
): Promise<string> {
  if (!storage || file.driveNumber === undefined || !file.objectKey) return file.fullPath;
  return await storage.cache.ensureLocal(file.driveNumber, file.objectKey);
}

/** Drives already reported as unconfigured - one line per drive, not per download. */
const warnedDrives = new Set<string>();

function usableAreas(conferenceId: number, storage: StorageContext): RemoteArea[] {
  return usableRemoteAreasFor(
    conferenceId,
    storage.areas,
    driveNumber => storage.volumes.byNumber(driveNumber) !== undefined,
    message => {
      if (warnedDrives.has(message)) return;
      warnedDrives.add(message);
      process.stdout.write(`${message}\n`);
    }
  );
}

/**
 * The same, for a caller that already holds a catalog row - `storageVolume` /
 * `object_key`, in either shape. Null means the row is on local disk.
 */
export async function materialiseCatalogEntry(
  entry: CatalogLocationRow,
  storage: StorageContext
): Promise<RemoteFile | null> {
  const location = remoteLocationFor(entry);
  if (!location) return null;
  return await materialise(location.driveNumber, location.key, storage);
}

async function materialise(driveNumber: number, key: string, storage: StorageContext): Promise<RemoteFile> {
  const fullPath = await storage.cache.ensureLocal(driveNumber, key);
  return {
    name: path.basename(key),
    size: fs.statSync(fullPath).size,
    fullPath,
    driveNumber,
    key,
  };
}

/**
 * What a caller is told when a download could not be served, in ASCII tokens.
 *
 * One sentence, one place. An unavailable volume says "try again later" and
 * names the drive so a sysop reading a caller's screenshot knows which bucket
 * to look at; anything else says a storage error happened. NEITHER says the
 * file is missing - the two answers are different and the whole subsystem
 * depends on them staying different.
 */
export function storageFailureText(error: unknown): string {
  if (isStorageUnavailable(error)) {
    return `DRIVE.${error.driveNumber} is unavailable - try again later`;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `storage error - ${detail}`;
}
