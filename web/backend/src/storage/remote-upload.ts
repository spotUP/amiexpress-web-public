/**
 * Putting a finished upload into the pool, and saying how much room the pool
 * has for the next one.
 *
 * The mirror of `remote-download.ts`, and deliberately the same shape: the
 * handlers ask "is this area pooled" and "put this file", and every rule about
 * WHICH drive and WHAT key lives here rather than in the upload handler.
 *
 * THE PLAYPEN COMES FIRST, ALWAYS. Zmodem writes into the node playpen, the
 * archive is tested there and FILE_ID.DIZ is read there; only the finished
 * file goes up. A truncated temp file is recoverable - express.e offers it
 * back through resumeStuff - and a truncated object is not.
 *
 * AND THE PLAYPEN COPY OUTLIVES A FAILED PUT. `putUploadIntoPool` does not
 * remove anything; it returns the location and lets the caller unlink, so a
 * volume that refuses the put leaves the caller holding the only copy of the
 * file, exactly where the caller left it.
 *
 * THE OBJECT GOES ON THE AREA'S OWN DRIVE, NOT WHEREVER `VolumeSet.place`
 * WOULD PUT IT. This is the one place the design brief and the built code
 * disagree, and the built code wins: every read path resolves a pooled file
 * through `names.forArea(area.storageVolume, objectPrefixFor(area))` - one
 * index, over ONE drive's listing of ONE prefix. An object placed on a
 * different drive of the pool is invisible to `materialiseRemoteFile` and to
 * `listRemoteMatches`, which are what the D command uses, and no catalog row
 * would save it: those paths deliberately never consult the catalog, because
 * on this board a file's listing is the DIR file on disk and SQL is a mirror.
 * So a full or degraded drive fails the upload rather than silently filing it
 * where the board cannot find it again.
 */
import * as fs from 'fs';
import { objectPrefixFor, type RemoteArea, type RemoteLocation } from './remote-areas';
import type { StorageContext } from './storage-context';
import { usableAreasFor } from './usable-areas';

/** All an area needs to be recognised in the storage context's own list. */
export interface UploadAreaRef {
  id: number;
  conferenceId: number;
}

/**
 * The pooled area this upload belongs to, or null when it lands on local disk.
 *
 * Resolved through `usableAreasFor` - the SAME filter the download side uses -
 * so an area whose STORAGEDRIVE names a drive Drives.info does not have, or
 * whose prefix collides with another area's, is treated as local by both
 * halves. An upload that used a looser rule than the download would file the
 * object in a bucket the reader has been told to ignore.
 */
export function pooledUploadArea(area: UploadAreaRef, storage: StorageContext | null): RemoteArea | null {
  if (!storage) return null;
  return usableAreasFor(area.conferenceId, storage).find(candidate => candidate.id === area.id) ?? null;
}

/**
 * The pool's free space for uploads into this area, or null when the figure a
 * caller should be shown is still the local disk's.
 *
 * express.e:19012-19014 prints freeDiskSpace() - the total across every
 * configured drive - and with a pool that is once again a real sum rather than
 * a stat of one filesystem.
 *
 * Null, not 0, for every board without a bucket: `VolumeSet.freeBytes()`
 * counts only s3 volumes, so a board whose Drives.info holds two LOCAL drives
 * - which is this board's own Drives.info - sums to 0, and a caller shown 0
 * free is a caller refused every upload. `hasPool()` is the question that
 * separates "no bucket configured" from "the bucket is full"; an area parked
 * on a local DRIVE.n gets the same treatment, since its room is that
 * filesystem's and not the pool's.
 */
export function poolFreeBytesFor(area: UploadAreaRef, storage: StorageContext | null): number | null {
  if (!storage || !storage.volumes.hasPool()) return null;
  const pooled = pooledUploadArea(area, storage);
  if (!pooled || pooled.storageVolume === undefined) return null;
  const state = storage.volumes.byNumber(pooled.storageVolume);
  if (!state || state.volume.kind !== 's3') return null;
  return storage.volumes.freeBytes();
}

/** The key a file uploaded into this area takes - the download prefix, always. */
export function uploadObjectKey(area: RemoteArea, filename: string): string {
  return `${objectPrefixFor(area)}${filename}`;
}

/**
 * Puts the finished local file into the pool and returns where it went.
 *
 * Order is the behaviour:
 *   1. `writeBack` marks the bytes owed and puts them. It throws on failure,
 *      and this function catches nothing - a caller that cannot tell an
 *      outage from a success would unlink the only copy of the file.
 *   2. the name index is told, WITH the size, so the next `D` listing prints
 *      the real byte count instead of fetching the body to learn it.
 * The source file is still there when this returns; removing it is the
 * caller's step, and only after this one has succeeded.
 */
export async function putUploadIntoPool(
  sourcePath: string,
  filename: string,
  area: RemoteArea,
  storage: StorageContext
): Promise<RemoteLocation> {
  const driveNumber = area.storageVolume;
  if (driveNumber === undefined) {
    throw new Error(`putUploadIntoPool: area ${area.id} is not pooled`);
  }

  const prefix = objectPrefixFor(area);
  const key = `${prefix}${filename}`;
  const size = fs.statSync(sourcePath).size;

  await storage.cache.writeBack(driveNumber, key, sourcePath);
  storage.names.forArea(driveNumber, prefix).note(key, size);

  return { driveNumber, key };
}
