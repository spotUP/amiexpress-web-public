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
 */
export function isNewFileEntry(line: string): boolean {
  // New file entries have format: "filename     X  " where X is status marker
  // Position 13 (0-indexed) should be a status marker (P, F, N, or D)
  // Position 12 should be a space
  if (line.length < 17) return false;

  const statusPos = 13;
  const statusChar = line[statusPos];

  // Check if it's a valid status marker
  if (statusChar !== 'P' && statusChar !== 'F' && statusChar !== 'N' && statusChar !== 'D') {
    return false;
  }

  // Check for spaces around status marker
  if (line[12] !== ' ' || line[14] !== ' ') {
    return false;
  }

  // Filename section (first 12 chars) should not start with 33 spaces (continuation line)
  const firstChars = line.substring(0, Math.min(33, line.length));
  if (firstChars.trim().length === 0 && line.length > 33) {
    return false; // This is a continuation line
  }

  return true;
}

/**
 * Parse a single file entry from DIR file lines
 * Port from express.e displayFileList() / displayIt2()
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

  // Parse file size (starts at position 16, ends before date)
  // Format: "  123K  23-Oct-25"
  const afterStatus = firstLine.substring(16);
  const sizeMatch = afterStatus.match(/^\s*(\d+[KMG]?)\s+/);
  let fileSizeDisplay = '0K';
  let fileSize = 0;

  if (sizeMatch) {
    fileSizeDisplay = sizeMatch[1];

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

  // Parse date (9 characters after size, format: DD-MMM-YY)
  // Example: "23-Oct-25"
  const dateStart = firstLine.indexOf(fileSizeDisplay, 16) + fileSizeDisplay.length;
  const dateSection = firstLine.substring(dateStart).trim();
  const dateMatch = dateSection.match(/^(\d{1,2}-[A-Za-z]{3}-\d{2})\s+(.*)/);

  let uploadDateDisplay = '';
  let uploadDate = new Date();
  let description = '';

  if (dateMatch) {
    uploadDateDisplay = dateMatch[1];
    description = dateMatch[2] || '';

    // Parse date (DD-MMM-YY format)
    const dateParts = uploadDateDisplay.split('-');
    if (dateParts.length === 3) {
      const day = parseInt(dateParts[0]);
      const monthStr = dateParts[1].toLowerCase();
      const year = parseInt(dateParts[2]) + 2000; // Assume 20xx

      const months: { [key: string]: number } = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
      };

      const month = months[monthStr] ?? 0;
      uploadDate = new Date(year, month, day);
    }
  } else {
    // No date match, description starts after size
    description = dateSection;
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
 */
export function parseDirFile(content: string): DirFileEntry[] {
  const lines = content.split(/\r?\n/);
  const entries: DirFileEntry[] = [];

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
  const fs = require('fs').promises;

  try {
    const content = await fs.readFile(dirFilePath, 'utf-8');
    return parseDirFile(content);
  } catch (error) {
    // File doesn't exist or can't be read
    return [];
  }
}

/**
 * Get DIR file path for a conference and directory number
 */
export function getDirFilePath(conferencePath: string, dirNumber: number): string {
  const path = require('path');
  return path.join(conferencePath, `DIR${dirNumber}`);
}

/**
 * Get HOLD directory file path
 */
export function getHoldDirFilePath(conferencePath: string): string {
  const path = require('path');
  return path.join(conferencePath, 'hold', 'held');
}
