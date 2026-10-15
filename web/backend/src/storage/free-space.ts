/**
 * How much room the board has: express.e's rFreeSpace() and freeDiskSpace().
 *
 *   rFreeSpace(path)   express.e:17437 - Lock + Info on one volume. Here, a
 *                      statfs of the filesystem the path lives on.
 *   freeDiskSpace()    express.e:17400-17432 - rFreeSpace of every DRIVE.n in
 *                      Drives.info, summed. The first number on the upload
 *                      screen ("N available for uploading").
 *
 * The pool's s3 drives are not measured here: a bucket has no filesystem, and
 * its room is `VolumeSet.freeBytes()` (volume-set.ts), which the upload screen
 * already uses for a pooled area. This module is the LOCAL half.
 */
import * as path from 'path';
import { BBSPaths } from '../utils/bbs-paths.util';
import { readDriveTargets, resolveLocalDrive } from './volume-config';

/**
 * Free bytes on the filesystem holding `dirPath`, or 0 when it cannot be
 * measured. express.e:17437 rFreeSpace.
 *
 * Amiga assigns (BBS:, NODE0:, DOORS:, ...) are resolved to host paths first -
 * statfs fails on a virtual path. statfs answers for a filesystem, not for a
 * directory entry, so a path that does not exist yet is not "0 bytes free":
 * the nearest ancestor that exists is the same filesystem and the real answer.
 * The node playpen in particular is created when a transfer starts, so on a
 * quiet node it is routinely absent, and 0 here would refuse every upload.
 *
 * fs is reached through require() so a test can spy on `statfsSync` - the
 * sentinel that proves which path was measured.
 */
export function readFreeBytes(dirPath: string, bbsRoot: string): number {
  let resolvedPath = dirPath;
  if (/^[A-Z]+:/i.test(dirPath)) {
    resolvedPath = new BBSPaths(bbsRoot).resolveAmigaPath(dirPath);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fsMod = require('fs') as typeof import('fs');
  try {
    let probe = resolvedPath;
    for (let i = 0; i < 64 && !fsMod.existsSync(probe); i++) {
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    resolvedPath = probe;
  } catch { /* probe the original path */ }

  try {
    if (typeof fsMod.statfsSync === 'function') {
      const st = fsMod.statfsSync(resolvedPath);
      return st.bfree * st.bsize;
    }
    // df -k: 1K blocks; column 4 is "Available"
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execSync } = require('child_process') as typeof import('child_process');
    const out: string = execSync(`df -k "${resolvedPath}"`, { encoding: 'utf-8' });
    const line = out.trim().split('\n').pop() || '';
    const avail = parseInt(line.trim().split(/\s+/)[3], 10);
    return isNaN(avail) ? 0 : avail * 1024;
  } catch {
    return 0;
  }
}

export interface LocalDriveSpace {
  /** The sum across every local DRIVE.n that resolved. */
  bytes: number;
  /**
   * The DRIVE.n targets that name no volume on this host, in order. express.e
   * prints "Can not find free space for <path>" for each one (express.e:17460)
   * and counts it as 0.
   */
  unresolved: string[];
}

/**
 * express.e:17400-17432 freeDiskSpace(), over the LOCAL drives.
 *
 * Null when Drives.info is absent or lists no local drive at all - the board
 * then has no declared local volume to sum, and the caller measures where the
 * bytes will actually land instead (the node playpen). express.e treats an
 * absent file as fatal ("DRIVES.info is missing!!!") and refuses the upload;
 * this port ships the file in its template, so the case is a board under
 * construction rather than a misconfiguration worth refusing a caller over.
 */
export function freeDiskSpace(bbsRoot: string): LocalDriveSpace | null {
  const { targets } = readDriveTargets(bbsRoot);
  const local = targets.filter(({ target }) => !target.toLowerCase().startsWith('s3://'));
  if (local.length === 0) return null;

  let bytes = 0;
  const unresolved: string[] = [];
  for (const { target } of local) {
    const dir = resolveLocalDrive(target, bbsRoot);
    if (dir === null) {
      unresolved.push(target);
      continue;
    }
    bytes += readFreeBytes(dir, bbsRoot);
  }
  return { bytes, unresolved };
}
