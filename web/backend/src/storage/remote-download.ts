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
import { objectPrefixFor, remoteAreasFor, remoteLocationFor, type CatalogLocationRow } from './remote-areas';
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
  for (const area of remoteAreasFor(conferenceId, storage.areas)) {
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
