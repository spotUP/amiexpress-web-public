/**
 * DIR File Writing Utilities
 * 1:1 port from AmiExpress express.e:19447-19520
 *
 * Handles writing uploaded file entries to DIR files in classic BBS format
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { formatFileSize, formatUploadDate } from './file-upload.util';
import { looksLikeAsciiArt } from './ascii-art.util';

const LINE_BREAK = '\n';

/**
 * Get DIR file path based on upload status
 * Express.e:19473-19489
 *
 * DIR files are ALWAYS numbered: DIR1, DIR2, DIR3, etc.
 * Uploads go to DIR{maxDirs} (the upload directory)
 *
 * @param conferencePath Path to conference directory (e.g., Conf1)
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
    // StrCopy(ray,currentConfDir);
    // StrAdd(ray,'DIR')
    // StringF(ray2,'\d',maxDirs)
    // StrAdd(ray,ray2)
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
  const sizeStr = formatFileSize(fileSize);  // Raw bytes: "  89749" (7 chars, right-aligned)
  const dateStr = formatUploadDate(uploadDate);  // "DD-Mon-YY"

  let line: string;

  // Express.e:19447-19452
  // Format: filename(13) + status(1) + size(7,right-aligned) + "  " + date(8) + "  " + description
  // Real: "ALKYS241.LHA N  89749  12-10-25"
  // Positions: 0-12=filename, 13=status, 14-20=size(7 chars), 21-22=spaces, 23-30=date
  if (isLCFile && filename.length > 12) {
    // Lost carrier with long filename - no padding
    line = `${filename} ${sizeStr}  ${dateStr}  ${description}${LINE_BREAK}`;
  } else {
    // Normal format with lowercase padding (\l)
    // \l\s[13] means left-align string in 13 character field (lowercase fills with spaces)
    const filenamePadded = filename.padEnd(13, ' ');
    // Add 1 space before size so when we replace position 13 with status marker,
    // we don't corrupt the first character of the size field
    line = `${filenamePadded} ${sizeStr}  ${dateStr}  ${description}${LINE_BREAK}`;
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
    .map(line => `${indent}${line}${LINE_BREAK}`)
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
  return `${indent}Sent by: ${username}${LINE_BREAK}`;
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
    // Ensure directory exists. Older AmiExpress installs sometimes
    // leave a stray ZERO-byte FILE named HOLD or LCFILES at the
    // conference root (artifacts of broken installs or aborted
    // setup). fs.mkdir even with {recursive:true} errors EEXIST on
    // a non-directory blocker. Rename the stray out of the way and
    // retry so the upload can complete instead of silently losing
    // its DIR entry.
    const dirToCreate = path.dirname(dirFilePath);
    try {
      await fs.mkdir(dirToCreate, { recursive: true });
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        const stat = await fs.stat(dirToCreate).catch(() => null);
        if (stat && !stat.isDirectory()) {
          const backup = `${dirToCreate}.stray-${Date.now()}`;
          console.warn(`[DIR] ${dirToCreate} exists as non-directory; renaming to ${path.basename(backup)} and retrying mkdir`);
          await fs.rename(dirToCreate, backup);
          await fs.mkdir(dirToCreate, { recursive: true });
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // Split description into lines. Express.e:19285 ('IF f:=Open(<workdir><fname>,...) THEN
    // ReadStr(f,fcomment)') takes the FIRST DIZ line as the primary (fcomment) and the
    // remainder as continuation (scomment). It does NOT skip ASCII-art lines. An earlier
    // version of this function tried to pick a "more readable" non-art line, which produced
    // entry headers with mid-art content and broke door renderers (AquaScan) that expect
    // the entry's first description text to match the DIZ's first line. Restore parity.
    const rawLines = description.split('\n').map(line => line.replace(/\r$/, ''));
    const meaningfulLines = rawLines.filter(line => line.trim().length > 0);
    let primaryLine = '';
    const continuationLines: string[] = [];

    if (meaningfulLines.length > 0) {
      primaryLine = meaningfulLines[0];
      continuationLines.push(...meaningfulLines.slice(1));
    }

    // Build entry
    let entry = '';

    // Express.e:19447-19465 - First line with filename, size, date, first description line
    entry += buildDirEntryLine(
      filename,
      fileSize,
      uploadDate,
      primaryLine,
      statusMarker,
      isLCFile
    );

    // Express.e:19496-19505 - Additional description lines
    if (continuationLines.length > 0) {
      entry += buildDescriptionLines(continuationLines);
    }

    // Express.e:19506-19509 - 'Sent by:' line (if enabled)
    if (addSentBy) {
      entry += buildSentByLine(username);
    }

    // Express.e:19492-19494 - Open file, seek to end, write entry
    // f:=Open(ray,MODE_READWRITE)
    // Seek(f,0,OFFSET_END)
    // fileWrite(f,fmtstr)
    // Use 'latin1' encoding to preserve Amiga ASCII art characters (e.g., ¬ = \xac)
    await fs.appendFile(dirFilePath, entry, 'latin1');

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
 * DIR files are ALWAYS numbered: DIR1, DIR2, DIR3, etc.
 * Uploads go to DIR{maxDirs} (the upload directory)
 *
 * @param filename Uploaded filename
 * @param fileSize File size in bytes
 * @param uploadDate Upload date
 * @param description Full description
 * @param statusMarker P/F/N/D status
 * @param username Uploader's username
 * @param conferencePath Path to conference directory
 * @param fileStatus File status (active/hold/lcfiles/private)
 * @param maxDirs Maximum DIR file number (uploads go to DIR{maxDirs})
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
  // Get appropriate DIR file path (express.e:19473-19489)
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
