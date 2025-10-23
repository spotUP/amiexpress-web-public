/**
 * DIR File Writing Utilities
 * 1:1 port from AmiExpress express.e:19447-19520
 *
 * Handles writing uploaded file entries to DIR files in classic BBS format
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { formatFileSize, formatUploadDate } from './file-upload.util';

/**
 * Get DIR file path based on upload status
 * Express.e:19473-19489
 *
 * @param conferencePath Path to conference directory (e.g., BBS/Conf01)
 * @param status File status (active, hold, lcfiles)
 * @param maxDirs Maximum DIR file number (for normal uploads)
 * @returns Full path to DIR file
 */
export function getDirFilePath(
  conferencePath: string,
  status: 'active' | 'hold' | 'lcfiles' | 'private',
  maxDirs: number = 1
): string {
  if (status === 'hold' || status === 'private') {
    // Express.e:19488 - StrAdd(ray,'HOLD/HELD')
    return path.join(conferencePath, 'HOLD', 'HELD');
  } else if (status === 'lcfiles') {
    // Express.e:19483-19487 - LCFILES/purgeScanNM.lc
    // For simplicity, use a default name
    return path.join(conferencePath, 'LCFILES', 'uploads.lc');
  } else {
    // Express.e:19475-19478 - currentConfDir/DIR#
    return path.join(conferencePath, `DIR${maxDirs}`);
  }
}

/**
 * Build DIR file entry line
 * Express.e:19447-19465
 *
 * Format: filename     P sizeK  datestr  description
 * Position 13 has the status marker (P/F/N/D)
 *
 * @param filename Filename (max 12 chars for proper formatting)
 * @param fileSize File size in bytes
 * @param uploadDate Upload date
 * @param description First line of description
 * @param statusMarker P=Passed, F=Failed, N=Not tested, D=Duplicate
 * @param isLCFile Whether this is a lost carrier file (affects formatting)
 * @returns Formatted DIR entry line
 */
export function buildDirEntryLine(
  filename: string,
  fileSize: number,
  uploadDate: Date,
  description: string,
  statusMarker: 'P' | 'F' | 'N' | 'D',
  isLCFile: boolean = false
): string {
  // Express.e:19447-19452 - Build format string
  const sizeStr = formatFileSize(fileSize);  // "  ###K"
  const dateStr = formatUploadDate(uploadDate);  // "DD-Mon-YY"

  let line: string;

  // Express.e:19447-19452
  if (isLCFile && filename.length > 12) {
    // Lost carrier with long filename - no padding
    line = `${filename} ${sizeStr}  ${dateStr}  ${description}\n`;
  } else {
    // Normal format with lowercase padding (\l)
    // \l\s[13] means left-align string in 13 character field (lowercase fills with spaces)
    const filenamePadded = filename.padEnd(13, ' ');
    line = `${filenamePadded}${sizeStr}  ${dateStr}  ${description}\n`;
  }

  // Express.e:19454-19465 - Insert status marker at position 13
  if (filename.length < 13) {
    // Convert string to array for character replacement
    const chars = line.split('');
    chars[13] = statusMarker;
    line = chars.join('');
  }

  return line;
}

/**
 * Build multi-line description lines
 * Express.e:19496-19505
 *
 * Additional description lines are indented with 33 spaces
 *
 * @param descriptionLines Array of description lines (excluding first line)
 * @returns Formatted multi-line description entries
 */
export function buildDescriptionLines(descriptionLines: string[]): string {
  // Express.e:19500 - StringF(tempstr,'                                 \s\n',scomment.item(x3))
  const indent = ' '.repeat(33);  // 33 spaces
  return descriptionLines
    .filter(line => line.length > 0)
    .map(line => `${indent}${line}\n`)
    .join('');
}

/**
 * Build 'Sent by:' line
 * Express.e:19506-19509
 *
 * @param username User's name
 * @returns Formatted 'Sent by:' line
 */
export function buildSentByLine(username: string): string {
  // Express.e:19507 - StringF(tempstr,'                                 Sent by: \s\n',loggedOnUser.name)
  const indent = ' '.repeat(33);
  return `${indent}Sent by: ${username}\n`;
}

/**
 * Write complete DIR file entry
 * Express.e:19447-19509
 *
 * @param dirFilePath Full path to DIR file
 * @param filename Filename
 * @param fileSize File size in bytes
 * @param uploadDate Upload date
 * @param description Full description (can be multi-line, separated by \n)
 * @param statusMarker P/F/N/D status
 * @param username Uploader's username
 * @param addSentBy Whether to add 'Sent by:' line (SENTBY_FILES config)
 * @param isLCFile Whether this is a lost carrier file
 */
export async function writeDirEntry(
  dirFilePath: string,
  filename: string,
  fileSize: number,
  uploadDate: Date,
  description: string,
  statusMarker: 'P' | 'F' | 'N' | 'D',
  username: string,
  addSentBy: boolean = true,
  isLCFile: boolean = false
): Promise<void> {
  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(dirFilePath), { recursive: true });

    // Split description into lines
    const descLines = description.split('\n').filter(line => line.trim().length > 0);
    const firstLine = descLines[0] || '';
    const additionalLines = descLines.slice(1);

    // Build entry
    let entry = '';

    // Express.e:19447-19465 - First line with filename, size, date, first description line
    entry += buildDirEntryLine(
      filename,
      fileSize,
      uploadDate,
      firstLine,
      statusMarker,
      isLCFile
    );

    // Express.e:19496-19505 - Additional description lines
    if (additionalLines.length > 0) {
      entry += buildDescriptionLines(additionalLines);
    }

    // Express.e:19506-19509 - 'Sent by:' line (if enabled)
    if (addSentBy) {
      entry += buildSentByLine(username);
    }

    // Express.e:19492-19494 - Open file, seek to end, write entry
    // f:=Open(ray,MODE_READWRITE)
    // Seek(f,0,OFFSET_END)
    // fileWrite(f,fmtstr)
    await fs.appendFile(dirFilePath, entry);

    console.log(`[DIR] Wrote entry to ${path.basename(dirFilePath)}: ${filename}`);
  } catch (error: any) {
    console.error(`[DIR] Error writing DIR entry: ${error.message}`);
    throw error;
  }
}

/**
 * Complete DIR file writing for uploaded file
 * Express.e:19473-19509
 *
 * @param filename Uploaded filename
 * @param fileSize File size in bytes
 * @param uploadDate Upload date
 * @param description Full description
 * @param statusMarker P/F/N/D status
 * @param username Uploader's username
 * @param conferencePath Path to conference directory
 * @param fileStatus File status (active/hold/lcfiles/private)
 * @param maxDirs Maximum DIR file number
 * @param addSentBy Whether to add 'Sent by:' line
 */
export async function writeUploadToDirFile(
  filename: string,
  fileSize: number,
  uploadDate: Date,
  description: string,
  statusMarker: 'P' | 'F' | 'N' | 'D',
  username: string,
  conferencePath: string,
  fileStatus: 'active' | 'hold' | 'lcfiles' | 'private',
  maxDirs: number = 1,
  addSentBy: boolean = true
): Promise<void> {
  // Get appropriate DIR file path
  const dirFilePath = getDirFilePath(conferencePath, fileStatus, maxDirs);

  // Write entry
  await writeDirEntry(
    dirFilePath,
    filename,
    fileSize,
    uploadDate,
    description,
    statusMarker,
    username,
    addSentBy,
    fileStatus === 'lcfiles'
  );
}
