/**
 * Max Dirs Utility
 * Utility for determining maximum directory numbers for conferences
 * Port from express.e - maxDirs variable usage
 */

import * as fs from 'fs';
import * as path from 'path';
import { getConferenceDir } from './file-hold.util';

/**
 * Get maximum directory number for a conference
 * Port from express.e maxDirs usage
 *
 * Scans for DIR files (DIR1, DIR2, DIR3, ...) to determine max
 *
 * @param confNum Conference number
 * @param bbsDataPath BBS data directory path
 * @returns Maximum directory number (0 if no directories exist)
 */
export async function getMaxDirs(confNum: number, bbsDataPath: string): Promise<number> {
  const conferencePath = getConferenceDir(confNum, bbsDataPath);

  // Scan for DIR files (DIR1, DIR2, DIR3, ...)
  let maxDirs = 0;
  for (let i = 1; i <= 20; i++) {
    const dirPath = path.join(conferencePath, `DIR${i}`);
    if (fs.existsSync(dirPath)) {
      maxDirs = i;
    } else {
      break;
    }
  }

  return maxDirs;
}

/**
 * Get DIR file path for a directory number
 */
export function getDirFilePath(conferencePath: string, dirNum: number): string {
  return path.join(conferencePath, `DIR${dirNum}`);
}
