/**
 * File Upload Utilities
 * 1:1 port from AmiExpress express.e file upload functions
 */

import { db } from '../database';
import { getRootConferenceDir } from './file-hold.util';

// checkForFile() - express.e:18408-18453
// Returns true if file exists (duplicate), false if safe to upload
export async function checkForFile(
  filename: string,
  currentConf: number,
  bbsDataPath?: string
): Promise<boolean> {
  const fs = require('fs/promises');
  const path = require('path');

  // Check for illegal characters (express.e:18410-18411)
  const illegalChars = ['%', '#', '?', ' ', '/', '(', ')', ':', '*'];
  for (const char of illegalChars) {
    if (filename.includes(char)) {
      return true; // File not allowed (has illegal chars)
    }
  }

  // Check if file already exists in database for this conference
  // This checks all file areas in the current conference
  const existingFile = await db.query(
    `SELECT f.id
     FROM file_entries f
     JOIN file_areas fa ON f.areaid = fa.id
     WHERE fa.conferenceid = $1
     AND LOWER(f.filename) = LOWER($2)
     LIMIT 1`,
    [currentConf, filename]
  );

  if (existingFile.rows.length > 0) {
    return true; // Duplicate found
  }

  // Check LCFILES directory (express.e:18424-18428)
  if (bbsDataPath) {
    const confNum = currentConf.toString().padStart(2, '0');
    const rootLcfilesPath = path.join(
      getRootConferenceDir(currentConf, bbsDataPath),
      'LCFILES',
      filename
    );
    const fallbackLcfilesPath = path.join(
      bbsDataPath,
      'BBS',
      `Conf${confNum}`,
      'LCFILES',
      filename
    );
    const lcfilesPaths = [rootLcfilesPath];
    if (fallbackLcfilesPath !== rootLcfilesPath) {
      lcfilesPaths.push(fallbackLcfilesPath);
    }

    for (const candidatePath of lcfilesPaths) {
      try {
        await fs.access(candidatePath);
console.log(`[checkForFile] Duplicate found in LCFILES: ${filename}`);
        return true; // File exists in LCFILES
      } catch {
        // File doesn't exist in this LCFILES candidate, continue checking
      }
    }

    // Check DLPATH.1, DLPATH.2, etc. from config (express.e:18431-18439)
    // Get download paths from system config
    const dlPathConfig = await db.query(
      `SELECT value FROM system_config WHERE key LIKE 'DLPATH.%'`
    );
    for (const row of dlPathConfig.rows) {
      const dlPath = path.join(bbsDataPath, row.value, filename);
      try {
        await fs.access(dlPath);
console.log(`[checkForFile] Duplicate found in DLPATH: ${filename}`);
        return true; // File exists in download path
      } catch {
        // File doesn't exist in this path, continue
      }
    }

    // Check ULPATH.1, ULPATH.2, etc. from config (express.e:18440-18448)
    // Get upload paths from system config
    const ulPathConfig = await db.query(
      `SELECT value FROM system_config WHERE key LIKE 'ULPATH.%'`
    );
    for (const row of ulPathConfig.rows) {
      const ulPath = path.join(bbsDataPath, row.value, filename);
      try {
        await fs.access(ulPath);
console.log(`[checkForFile] Duplicate found in ULPATH: ${filename}`);
        return true; // File exists in upload path
      } catch {
        // File doesn't exist in this path, continue
      }
    }
  }

  return false; // File is safe to upload
}

// Validate filename for upload (express.e:19218-19231)
export function validateFilename(filename: string): { valid: boolean; error?: string } {
  // Check for RZ filename (express.e:19212-19215)
  if (filename.toUpperCase() === 'RZ' || (filename.toUpperCase().startsWith('RZ') && filename.length < 4)) {
    return { valid: false, error: 'RZ is an invalid name for a file' };
  }

  // Check for illegal characters (express.e:19218-19226)
  const illegalChars = [':', '/', '*', ' ', '#', '+', '?'];
  for (let i = 0; i < filename.length; i++) {
    if (illegalChars.includes(filename[i])) {
      return { valid: false, error: 'You may not include any special symbols' };
    }
  }

  // Check filename length (already checked elsewhere but good to validate)
  if (filename.length > 12) {
    return { valid: false, error: 'Files longer than 12 characters are not allowed' };
  }

  if (filename.length === 0) {
    return { valid: false, error: 'Filename cannot be empty' };
  }

  return { valid: true };
}

// File status markers (express.e:19410-19419)
export enum FileStatus {
  PASSED = 'P',        // Tested OK
  FAILED = 'F',        // Failed test (bad format/virus)
  NOT_TESTED = 'N',    // Not tested yet
  DUPLICATE = 'D',     // Duplicate file
  PRIVATE = '/',       // Private upload (sysop only)
  HOLD = 'H',          // In HOLD directory
  LCFILES = 'L'        // Lost carrier file
}

// Get file status marker
export function getFileStatusMarker(
  isDuplicate: boolean,
  testStatus: 'success' | 'failure' | 'not_tested',
  isPrivate: boolean
): string {
  if (isDuplicate) return FileStatus.DUPLICATE;
  if (isPrivate) return FileStatus.PRIVATE;
  if (testStatus === 'failure') return FileStatus.FAILED;
  if (testStatus === 'success') return FileStatus.PASSED;
  return FileStatus.NOT_TESTED;
}

/**
 * Format file size for DIR entries - express.e:18918-18942
 *
 * AmiExpress has two modes controlled by TOGGLES_CREDITBYKB:
 * 1. TOGGLES_CREDITBYKB=TRUE: Uses "K" suffix (e.g., "   123K") - 7 chars total
 * 2. TOGGLES_CREDITBYKB=FALSE (DEFAULT): Raw bytes (e.g., "  89749") - 7 chars
 *
 * Most 68K doors (AquaScan/FR, etc.) expect raw bytes to parse size for filtering.
 * Using "K" suffix causes Val("11K") = 0, which filters out the file.
 *
 * @param bytes File size in bytes
 * @param useKB Whether to use KB suffix (TOGGLES_CREDITBYKB=TRUE)
 * @returns Formatted size string (7 chars, right-aligned)
 */
export function formatFileSize(bytes: number, useKB: boolean = false): string {
  if (useKB) {
    // Mode 1: TOGGLES_CREDITBYKB=TRUE - express.e:18920-18930
    // StringF(fsstr,'\r\d[6]K',tmpSize) - right-align in 6 chars + K = 7 total
    const tmpSize = bytes >>> 10;  // Shr(fsize,10) - convert to KB
    if (tmpSize <= 999999) {
      return `${tmpSize}K`.padStart(7);  // e.g., "   123K"
    } else {
      // For very large files (>999999K), just use raw KB
      return `${tmpSize}K`;
    }
  } else {
    // Mode 2: TOGGLES_CREDITBYKB=FALSE (DEFAULT) - express.e:18931-18940
    // StringF(fsstr,'\r\d[7]',fsize) - right-align raw bytes in 7 chars
    // This is what AquaScan and other 68K doors expect for size filtering
    if (bytes <= 9999999) {
      return String(bytes).padStart(7);  // e.g., "  89749"
    } else {
      // For files >9,999,999 bytes, just use raw bytes (no padding limit)
      return String(bytes);
    }
  }
}

/**
 * Format upload date for DIR entries - express.e:19165 uses formatLongDate()
 *
 * AmiExpress uses MM-DD-YY numeric format for DIR files (e.g., "12-10-25")
 * This is critical for 68K doors like AquaScan/FR that parse dates for filtering.
 *
 * Evidence from real Amiga DIR files: "12-26-17", "01-25-18", "01-27-18"
 *
 * @param date Date to format
 * @returns Formatted date string in MM-DD-YY format
 */
export function formatUploadDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');  // 1-12 -> "01"-"12"
  const day = String(date.getDate()).padStart(2, '0');         // 1-31 -> "01"-"31"
  const year = String(date.getFullYear()).slice(-2);           // 2026 -> "26"
  return `${month}-${day}-${year}`;  // "01-21-26"
}

// Check if description starts with / (private upload marker) - express.e:19344
export function isPrivateUpload(description: string): boolean {
  return description.startsWith('/');
}

// Capitalize filename if configured (express.e:19257)
export function capitalizeFilename(filename: string, capitalize: boolean): string {
  return capitalize ? filename.toUpperCase() : filename;
}

// Build DIR file entry line (express.e:19425-19431)
export function buildDirFileEntry(
  filename: string,
  sizeStr: string,
  dateStr: string,
  description: string,
  statusMarker: string
): string {
  // Format: filename     sizeK datestr description
  // Position 13 has the status marker (P/F/N/D)
  const filenamePadded = filename.padEnd(13);
  let line = filenamePadded;

  // Insert status marker at position 13 (express.e:19413-19416)
  if (filename.length < 13) {
    line = filename.padEnd(12) + statusMarker;
  }

  line += ` ${sizeStr}  ${dateStr}  ${description}`;
  return line;
}

// Add "Sent by:" line to description (express.e:19470-19473)
export function addSentByLine(description: string[], username: string, addSentBy: boolean): string[] {
  if (addSentBy) {
    return [...description, `Sent by: ${username}`];
  }
  return description;
}
