import * as path from 'path';
import * as fs from 'fs';
import { findCaseInsensitive } from './amigafs';

/**
 * DIR File Reader Utility
 * Port from express.e - Reads and parses classic BBS DIR files
 *
 * DIR File Format (from express.e:19447-19509):
 * filename     P  123K  23-Oct-25  description
 * ^12 chars    ^1 ^size ^9 chars   ^rest of line
 *
 * Multi-line descriptions have 33 spaces of indentation
 * Status markers: P=Passed, F=Failed, N=Not tested, D=Duplicate
 */

export interface DirFileEntry {
  filename: string;           // Original filename (12 chars, space-padded)
  statusMarker: 'P' | 'F' | 'N' | 'D';
  fileSize: number;           // Size in bytes
  fileSizeDisplay: string;    // Display format (e.g., "123K")
  uploadDate: Date;           // Upload date
  uploadDateDisplay: string;  // Display format (e.g., "23-Oct-25")
  description: string;        // Full description (may be multi-line)
  rawLines: string[];         // Raw lines from DIR file
  lineNumber: number;         // Starting line number in DIR file
}

/**
 * Check if a line is the start of a new file entry
 * Port from express.e dirLineNewFile()
 *
 * Format: filename(12) + SPACE(1) + STATUS(1) + size + date + desc
 * Note: NO guaranteed space after status marker - size can be variable width
 */
export function isNewFileEntry(line: string): boolean {
  // Must be at least 14 chars (filename + space + status)
  if (line.length < 14) return false;

  const statusPos = 13;
  const statusChar = line[statusPos];

  // Check if it's a valid status marker at position 13
  if (statusChar !== 'P' && statusChar !== 'F' && statusChar !== 'N' && statusChar !== 'D') {
    return false;
  }

  // Position 12 must be a space (between filename and status)
  if (line[12] !== ' ') {
    return false;
  }

  // Filename section (first 12 chars) should not be all spaces (continuation line)
  const filename = line.substring(0, 12);
  if (filename.trim().length === 0) {
    return false; // This is a continuation line (33 spaces of indentation)
  }

  return true;
}

/**
 * Parse a single file entry from DIR file lines
 * Port from express.e displayFileList() / displayIt2()
 *
 * From express.e:27204 - They replace position 13 with space before parsing:
 * tempstr[13]:=" "
 * parseParams(tempstr)
 */
export function parseDirEntry(lines: string[], startIndex: number): DirFileEntry | null {
  const firstLine = lines[startIndex];

  if (!isNewFileEntry(firstLine)) {
    return null;
  }

  // Parse filename (first 12 characters)
  const filename = firstLine.substring(0, 12).trim();

  // Parse status marker (position 13)
  const statusMarker = firstLine[13] as 'P' | 'F' | 'N' | 'D';

  // Express.e technique: Replace status marker with space, then parse as space-separated fields
  // This handles variable-width file sizes correctly
  const normalized = firstLine.substring(0, 13) + ' ' + firstLine.substring(14);
  const fields = normalized.trim().split(/\s+/);

  // Fields: [filename, size, date, ...description]
  let fileSizeDisplay = '0';
  let fileSize = 0;

  if (fields.length >= 2) {
    fileSizeDisplay = fields[1];

    // Convert size to bytes
    const sizeStr = fileSizeDisplay.toUpperCase();
    const num = parseInt(sizeStr);
    if (sizeStr.endsWith('K')) {
      fileSize = num * 1024;
    } else if (sizeStr.endsWith('M')) {
      fileSize = num * 1024 * 1024;
    } else if (sizeStr.endsWith('G')) {
      fileSize = num * 1024 * 1024 * 1024;
    } else {
      fileSize = num;
    }
  }

  // THE DATE COLUMN IS `mm-dd-yy`, and this reader used to refuse it.
  //
  // express.e:27962-27963 identifies the column by SHAPE - eight characters,
  // first one a digit, `-` at [2] and [5] - and its own prompt spells the
  // format out: "Date as (mm-dd-yy) to search from" (express.e:27873). Every
  // DIR file this board inherited is written that way; measured on the live
  // volume, `Conf12/Dir1` holds 81 records dated `03-28-18` and the like.
  //
  // This port accepted ONLY `23-Oct-25`, a form of its own invention that
  // `utils/dir-file.util.ts` writes. So on a real record the date fell through
  // to the description, and - worse - `uploadDate` DEFAULTED TO NOW. Every
  // legacy file read as uploaded today, which is what made `N` (new files)
  // meaningless: everything was always new. Both forms are read now, the
  // canonical one first.
  let uploadDateDisplay = '';
  let uploadDate: Date | null = null;
  let description = '';

  const dateField = fields.length >= 3 ? fields[2] : '';

  // express.e's own two-digit year: `ydt > year` compares them raw, with no
  // century at all. A Date needs one, so the usual pivot - 80 and up is the
  // 1900s, which puts a 1992 Amiga upload in 1992 and a 2026 one in 2026.
  const century = (yy: number): number => (yy >= 80 ? 1900 + yy : 2000 + yy);

  const MONTHS: { [key: string]: number } = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  const canonical = dateField.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  const portForm = dateField.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);

  if (canonical) {
    // mm-dd-yy, express.e's format and what the board's own files carry.
    uploadDateDisplay = dateField;
    uploadDate = new Date(
      century(parseInt(canonical[3], 10)),
      parseInt(canonical[1], 10) - 1,
      parseInt(canonical[2], 10),
    );
  } else if (portForm) {
    // dd-Mon-yy, what utils/dir-file.util.ts writes today.
    uploadDateDisplay = dateField;
    const month = MONTHS[portForm[2].toLowerCase()];
    if (month !== undefined) {
      uploadDate = new Date(
        century(parseInt(portForm[3], 10)),
        month,
        parseInt(portForm[1], 10),
      );
    }
  }

  if (uploadDate && !Number.isNaN(uploadDate.getTime())) {
    // Description is everything after the date.
    if (fields.length > 3) {
      description = fields.slice(3).join(' ');
    }
  } else {
    // NO DATE THIS READER UNDERSTANDS. It must not claim the file arrived
    // now - that is the bug above, and it makes a twenty-year-old upload the
    // newest thing on the board. Undated records sort and scan as OLD.
    uploadDate = new Date(0);
    uploadDateDisplay = '';
    if (fields.length > 2) {
      description = fields.slice(2).join(' ');
    }
  }

  // Collect multi-line description (lines with 33 spaces indentation)
  const rawLines = [firstLine];
  let currentIndex = startIndex + 1;

  while (currentIndex < lines.length) {
    const line = lines[currentIndex];

    // Check if this is a continuation line (33 spaces indent)
    if (line.length >= 33) {
      const prefix = line.substring(0, 33);
      if (prefix.trim().length === 0) {
        // This is a continuation line
        const continuationText = line.substring(33);
        if (description.length > 0) {
          description += ' ' + continuationText;
        } else {
          description = continuationText;
        }
        rawLines.push(line);
        currentIndex++;
        continue;
      }
    }

    // Not a continuation line, stop
    break;
  }

  return {
    filename,
    statusMarker,
    fileSize,
    fileSizeDisplay,
    uploadDate,
    uploadDateDisplay,
    description,
    rawLines,
    lineNumber: startIndex
  };
}

/**
 * Read and parse entire DIR file
 * Port from express.e displayFileList() -> displayIt() -> displayIt2()
 *
 * DIR files use the classic BBS format ONLY:
 * filename     P  123K  23-Oct-25  description
 *                                  continuation line (33 spaces indent)
 */
export function parseDirFile(content: string): DirFileEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: DirFileEntry[] = [];

  // Parse classic BBS format only (express.e format)
  let i = 0;
  while (i < lines.length) {
    const entry = parseDirEntry(lines, i);
    if (entry) {
      entries.push(entry);
      // Skip past all the lines we just parsed
      i += entry.rawLines.length;
    } else {
      // Not a valid entry, skip this line
      i++;
    }
  }

  return entries;
}

/**
 * Format a DIR entry for display (recreate the original format)
 */
export function formatDirEntry(entry: DirFileEntry): string {
  let output = '';

  // Format first line: "filename     P  123K  23-Oct-25  description"
  const paddedFilename = entry.filename.padEnd(12, ' ');
  const firstLineDesc = entry.description.split(' ').slice(0, 10).join(' '); // First part of description

  output += `${paddedFilename} ${entry.statusMarker}  ${entry.fileSizeDisplay.padStart(5)}  ${entry.uploadDateDisplay}  ${firstLineDesc}\r\n`;

  return output;
}

/**
 * Read DIR file from disk
 */
export async function readDirFile(dirFilePath: string): Promise<DirFileEntry[]> {
  // Use 'latin1' encoding to preserve Amiga ASCII art characters (e.g., ¬ = \xac)
  const content = await fs.promises.readFile(dirFilePath, 'latin1');
  return parseDirFile(content);
}

/**
 * Get DIR file path for a conference and directory number
 */
export function getDirFilePath(conferencePath: string, dirNumber: number): string {
  const lookup = findCaseInsensitive(conferencePath, `Dir${dirNumber}`);
  if (lookup) {
    return lookup;
  }

  return path.join(conferencePath, `DIR${dirNumber}`);
}

/**
 * Get HOLD directory file path
 */
export function getHoldDirFilePath(conferencePath: string): string {
  return path.join(conferencePath, 'hold', 'held');
}
