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

    for (const entry of entries) {
      // Express.e: Only numbered DIR files (DIR1, DIR2, etc.)
      const numberedMatch = entry.match(/^[Dd][Ii][Rr](\d+)$/i);
      if (numberedMatch) {
        const dirNum = parseInt(numberedMatch[1], 10);
        if (!Number.isNaN(dirNum) && dirNum > 0) {
          dirFiles.push({
            index: dirNum,
            name: `Directory ${dirNum}`,
            path: path.join(conferencePath, entry),
            filename: entry
          });
        }
      }
    }

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
