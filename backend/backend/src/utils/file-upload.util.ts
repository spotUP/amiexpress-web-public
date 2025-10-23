/**
 * File Upload Utilities
 * 1:1 port from AmiExpress express.e file upload functions
 */

import { db } from '../database';

// checkForFile() - express.e:18408-18453
// Returns true if file exists (duplicate), false if safe to upload
export async function checkForFile(filename: string, currentConf: number): Promise<boolean> {
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

  // TODO: Check LCFILES directory (express.e:18424-18428)
  // TODO: Check DLPATH.1, DLPATH.2, etc. from config (express.e:18431-18439)
  // TODO: Check ULPATH.1, ULPATH.2, etc. from config (express.e:18440-18448)

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

// Format file size as string with K suffix (express.e uses fsstr for this)
export function formatFileSize(bytes: number): string {
  const kb = Math.ceil(bytes / 1024);
  return `${kb}K`.padStart(6);
}

// Format upload date as DD-Mon-YY (like AmiExpress)
export function formatUploadDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
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
