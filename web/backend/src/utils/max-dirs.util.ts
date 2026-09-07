/**
 * Max Dirs Utility
 * Utility for determining maximum directory numbers for conferences
 * Port from express.e - maxDirs variable usage
 *
 * EXPRESS.E: DIR files are ALWAYS numbered DIR1, DIR2, DIR3, etc.
 * Uploads go to DIR{maxDirs} (the highest numbered directory)
 */

import * as fs from 'fs';
import * as path from 'path';
// The SAME resolver `F` and `FR` use (dir-file-reader), aliased because this
// file still exports a deprecated `getDirFilePath` of its own that builds
// `DIR<n>` blindly and cannot see a `Dir<n>` beside it.
import { getDirFilePath as resolveDirFile } from './dir-file-reader.util';
import { getConferenceDir } from './file-hold.util';

export interface DirFileInfo {
  index: number;      // Directory number (1-based)
  name: string;       // Display name (e.g., "Directory 1")
  path: string;       // Full path to DIR file
  filename: string;   // Filename (e.g., "DIR1")
}

/**
 * Get list of DIR files for a conference
 * Port from express.e - ONLY numbered DIR files (DIR1, DIR2, etc.)
 *
 * @param confNum Conference number
 * @param bbsDataPath BBS data directory path
 * @returns Array of DirFileInfo objects sorted by directory number
 */
export async function getDirFiles(confNum: number, bbsDataPath: string): Promise<DirFileInfo[]> {
  const conferencePath = getConferenceDir(confNum, bbsDataPath);
  const dirFiles: DirFileInfo[] = [];

  try {
    const entries = await fs.promises.readdir(conferencePath);

    // ONE DIRECTORY PER NUMBER, however many files ext4 is willing to hold.
    //
    // AmigaDOS is case-insensitive, so a board can only ever have one DIR1 -
    // but the Linux volume under this port can and does hold `DIR1` AND
    // `Dir1` side by side. Conference 2 on the live board has both, and the
    // walker returned two entries with index 1: the file scan announced
    // "Scanning directory 1" twice and read one of them twice (sysop, in a
    // PETSCII session, 2026-09-07). Same collision class as `Doors/GWall` vs
    // `Doors/Gwall` and `OLM.info` vs `Olm.info`.
    //
    // The winner is whatever `findCaseInsensitive` picks, because that is
    // what `getDirFilePath` hands `F` and `FR` - if this walker chose
    // differently, `N` would list a different file from the one `F` shows.
    const byNumber = new Map<number, DirFileInfo>();

    for (const entry of entries) {
      // Express.e: Only numbered DIR files (DIR1, DIR2, etc.)
      const numberedMatch = entry.match(/^[Dd][Ii][Rr](\d+)$/i);
      if (numberedMatch) {
        const dirNum = parseInt(numberedMatch[1], 10);
        if (!Number.isNaN(dirNum) && dirNum > 0 && !byNumber.has(dirNum)) {
          // `DIR<n>` is the name express.e opens, so that is the file to
          // serve when it is there under any casing. A padded `DIR01` is not
          // a name express.e ever writes; it only reaches this map when it is
          // the ONLY candidate, in which case reading it beats reading
          // nothing.
          const canonical = resolveDirFile(conferencePath, dirNum);
          const usable = fs.existsSync(canonical) ? canonical : path.join(conferencePath, entry);
          byNumber.set(dirNum, {
            index: dirNum,
            name: `Directory ${dirNum}`,
            path: usable,
            filename: path.basename(usable),
          });
        }
      }
    }

    dirFiles.push(...byNumber.values());

    // Sort by directory number
    dirFiles.sort((a, b) => a.index - b.index);

    return dirFiles;
  } catch (error) {
    return [];
  }
}

/**
 * Get maximum directory number for a conference
 * Port from express.e maxDirs usage
 *
 * Scans for DIR files (DIR1, DIR2, DIR3, ...) and named .dir files to determine count
 *
 * @param confNum Conference number
 * @param bbsDataPath BBS data directory path
 * @returns Maximum directory number (0 if no directories exist)
 */
export async function getMaxDirs(confNum: number, bbsDataPath: string): Promise<number> {
  const dirFiles = await getDirFiles(confNum, bbsDataPath);
  return dirFiles.length;
}

/**
 * Get DIR file path for a directory number
 * @deprecated Use getDirFiles() and access path directly
 */
export function getDirFilePath(conferencePath: string, dirNum: number): string {
  return path.join(conferencePath, `DIR${dirNum}`);
}
