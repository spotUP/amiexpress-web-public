/**
 * Where a file a caller may download is: the conference's download
 * directories, then the storage pool. Used by FTP and the download routes;
 * flagged files download through D (handlers/file/download.handler.ts), as
 * in express.e.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { getConferenceDir } from '../../utils/file-hold.util';
import { materialiseRemoteFile } from '../../storage/remote-download';
import { getStorageContext, type StorageContext } from '../../storage/storage-context';
import { conferenceDownloadDirs } from '../../conferences/conference-paths';

/** A file this handler is prepared to send: always a real path on local disk. */
export interface ResolvedFile {
  name: string;
  size: number;
  confNum: number;
  dirNum: number;
  fullPath: string;
  /** Set only for a pooled file: which drive holds it, and under what key. */
  driveNumber?: number;
  objectKey?: string;
  comment?: string;
  description?: string;
  isFree?: boolean;
}

/**
 * The file behind a caller's spelling, materialised if it lives in the pool.
 *
 * A pooled area is asked FIRST, and a pooled HIT wins outright: a conference
 * whose files went to a bucket can still have a stale copy of one of them in
 * its old `Files/` directory, and serving those bytes would hand the caller a
 * version the board no longer considers current. A pooled MISS still falls
 * through to the local walk, and that local copy is then served - which is
 * deliberate, because a part-migrated conference holds some of its files in
 * each place and both have to be reachable.
 *
 * A volume that cannot answer does not stop the local walk. Putting a
 * directory on a drive (STORAGEDRIVE.n - the storage wizard's last step, or
 * the Conferences form) moves nothing, so the files already in it stay on
 * this server's disk, and the bucket's health has nothing to say about them.
 * The `D` command's `findFilesInConference` already served them through an
 * outage; this did not, so FTP, the flagged batch and the web route (all of
 * which come here) refused a file sitting right there with "unavailable".
 *
 * Throws `StorageUnavailableError` when the volume cannot answer AND the file
 * is not on local disk either. It must not be turned into null: null means
 * "no such file", and a caller shown "not found" for a file that is fine is
 * how a sysop deletes its catalog row. `resolveFlaggedFile` is where that
 * error becomes a line on a screen.
 */
export async function resolveFile(
  dataDir: string,
  confNum: number,
  filename: string,
  storage: StorageContext | null = getStorageContext()
): Promise<ResolvedFile | null> {
  let storageError: unknown;
  if (storage) {
    try {
      const remote = await materialiseRemoteFile(filename, confNum, storage);
      if (remote) {
        return {
          name: remote.name,
          size: remote.size,
          confNum,
          dirNum: 1,
          fullPath: remote.fullPath,
          // Kept so a transfer can fetch the object again if the cache evicted
          // it between resolution and send.
          driveNumber: remote.driveNumber,
          objectKey: remote.key,
        };
      }
    } catch (error) {
      storageError = error;
    }
  }

  const local = findOnLocalDisk(dataDir, confNum, filename);
  if (local) return local;
  if (storageError !== undefined) throw storageError;
  return null;
}

/** The conference's own download directories on this server's disk. */
function findOnLocalDisk(dataDir: string, confNum: number, filename: string): ResolvedFile | null {
  const confPath = getConferenceDir(confNum, dataDir);

  // Files live in Files/ or Upload/ — Dir1..DirN are AmiExpress
  // metadata text files, not directories containing downloadable files.
  //
  // DLPATH FIRST, and this is not a nicety. `moveToFiles` writes an upload
  // into the area's DLPATH (express.e:15264) while this searched only
  // `<confDir>/Files` and `<confDir>/Upload` - so on a board whose DLPATH
  // points elsewhere, a file uploaded through the BBS could never be
  // downloaded again. The live board is exactly that: `Conf2.info` says
  // `DLPATH.1=BBS:Conf3/Files`, `Conf3.info` says `BBS:Conf5/Files`.
  // Reported over FTP on 2026-09-07 as "the board lists it, but its bytes are
  // not here"; the `D` command had the same blind spot and said "not found".
  const searchDirs = [
    ...conferenceDownloadDirs(dataDir, confNum),
    path.join(confPath, 'Files'),
    path.join(confPath, 'Upload'),
  ];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    const filePath = path.join(dir, filename);
    const resolved = amigafs.resolvePath(filePath); // case-insensitive
    if (!resolved) continue;

    const stats = fs.statSync(resolved);
    if (!stats.isFile()) continue;

    return {
      name: path.basename(resolved), // actual on-disk case
      size: stats.size,
      confNum,
      dirNum: 1,
      fullPath: resolved,
    };
  }

  return null;
}

