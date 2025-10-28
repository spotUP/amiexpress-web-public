/**
 * File Flagging System Utility
 * Port from express.e:2713-2858, 12486-12600
 *
 * Manages file flags for batch downloads.
 * Users can flag files during listing, then download all at once.
 *
 * Storage format (Partdownload/flagged#):
 * confNum filename\n
 * confNum filename\n
 * ...
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FlaggedFile {
  filename: string;     // Filename (uppercase)
  confNum: number;      // Conference number (-1 = current/all)
}

/**
 * File Flag Manager
 * Port from express.e flagFilesList and related functions
 */
export class FileFlagManager {
  private flaggedFiles: FlaggedFile[] = [];
  private bbsDataPath: string;
  private userSlot: number;
  private nodeNumber: number;

  constructor(bbsDataPath: string, userSlot: number, nodeNumber: number = 0) {
    this.bbsDataPath = bbsDataPath;
    this.userSlot = userSlot;
    this.nodeNumber = nodeNumber;
  }

  /**
   * Add a file to the flag list
   * Port from express.e:2713+ addFlagItem(), addFlagToList()
   */
  addFlag(filename: string, confNum: number = -1): boolean {
    const trimmed = filename.trim().toUpperCase();

    if (trimmed.length === 0) {
      return false;
    }

    // Check if already flagged
    if (this.isFlagged(trimmed, confNum)) {
      return false;
    }

    this.flaggedFiles.push({
      filename: trimmed,
      confNum
    });

    return true;
  }

  /**
   * Add multiple files from space-delimited string
   * Port from express.e:2713+ addFlagItems()
   */
  addFlags(filenames: string, confNum: number = -1): number {
    const files = filenames.split(' ').filter(f => f.trim().length > 0);
    let added = 0;

    for (const file of files) {
      if (this.addFlag(file, confNum)) {
        added++;
      }
    }

    return added;
  }

  /**
   * Remove a file from the flag list
   * Port from express.e:12540+ removeFlagFromList()
   */
  removeFlag(filename: string, confNum: number = -1): boolean {
    const trimmed = filename.trim().toUpperCase();
    const initialLength = this.flaggedFiles.length;

    this.flaggedFiles = this.flaggedFiles.filter(item => {
      // Match by filename
      if (item.filename !== trimmed) {
        return true; // Keep
      }

      // Match by conference (if specified)
      if (confNum !== -1 && item.confNum !== confNum) {
        return true; // Keep
      }

      return false; // Remove
    });

    return this.flaggedFiles.length < initialLength;
  }

  /**
   * Clear all flags
   * Port from express.e:2745+ clearFlagItems()
   */
  clearAll(): void {
    this.flaggedFiles = [];
  }

  /**
   * Check if a file is flagged
   * Port from express.e:12495+ isInFlaggedList()
   */
  isFlagged(filename: string, confNum: number = -1): boolean {
    const trimmed = filename.trim().toUpperCase();

    return this.flaggedFiles.some(item => {
      // Match filename
      if (item.filename !== trimmed) {
        return false;
      }

      // Match conference (if item.confNum is -1, it matches all conferences)
      if (item.confNum === -1 || confNum === -1 || item.confNum === confNum) {
        return true;
      }

      return false;
    });
  }

  /**
   * Get all flagged files
   */
  getAll(): FlaggedFile[] {
    return [...this.flaggedFiles];
  }

  /**
   * Get flagged files for a specific conference
   */
  getForConference(confNum: number): FlaggedFile[] {
    return this.flaggedFiles.filter(item =>
      item.confNum === confNum || item.confNum === -1
    );
  }

  /**
   * Get count of flagged files
   */
  getCount(): number {
    return this.flaggedFiles.length;
  }

  /**
   * Get formatted display of flagged files
   * Port from express.e:2830+ showFlaggedFiles()
   */
  getDisplayString(maxLen: number = -1): string {
    if (this.flaggedFiles.length === 0) {
      return 'No file flags';
    }

    const files = this.flaggedFiles.map(item => item.filename);
    let result = '';
    let remainingLen = maxLen;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Add space between files
      if (i > 0) {
        if (maxLen === -1 || remainingLen > 0) {
          result += ' ';
          if (maxLen !== -1) remainingLen--;
        }
      }

      // Add file
      if (maxLen === -1 || remainingLen >= file.length) {
        result += file;
        if (maxLen !== -1) remainingLen -= file.length;
      } else if (remainingLen > 0) {
        result += file.substring(0, remainingLen);
        remainingLen = 0;
      }

      if (maxLen !== -1 && remainingLen <= 0) {
        break;
      }
    }

    return result;
  }

  /**
   * Load flagged files from disk
   * Port from express.e:2765+ loadFlagged()
   */
  async load(): Promise<void> {
    this.flaggedFiles = [];

    const flaggedPath = this.getFlaggedFilePath();
    const dumpPath = this.getDumpFilePath();

    try {
      // Load from dump file (space-delimited, confNum=-1)
      if (fs.existsSync(dumpPath)) {
        const content = fs.readFileSync(dumpPath, 'utf-8').trim();
        if (content.length > 0) {
          this.addFlags(content, -1);
        }
      }

      // Load from flagged file (confNum filename per line)
      if (fs.existsSync(flaggedPath)) {
        const content = fs.readFileSync(flaggedPath, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);

        for (const line of lines) {
          const spaceIndex = line.indexOf(' ');
          if (spaceIndex > 0) {
            const confNum = parseInt(line.substring(0, spaceIndex));
            const filename = line.substring(spaceIndex + 1).trim();

            if (!isNaN(confNum) && filename.length > 0) {
              this.addFlag(filename, confNum);
            }
          }
        }
      }

      // Notify user if flags exist
      if (this.flaggedFiles.length > 0) {
        console.log(`Loaded ${this.flaggedFiles.length} flagged files`);
      }
    } catch (error) {
      console.error('Error loading flagged files:', error);
    }
  }

  /**
   * Save flagged files to disk
   * Port from express.e:2795+ saveFlagged()
   */
  async save(): Promise<void> {
    const flaggedPath = this.getFlaggedFilePath();
    const dumpPath = this.getDumpFilePath();
    const partdownloadDir = path.dirname(flaggedPath);

    try {
      // Ensure Partdownload directory exists
      if (!fs.existsSync(partdownloadDir)) {
        fs.mkdirSync(partdownloadDir, { recursive: true });
      }

      // Delete old files
      if (fs.existsSync(flaggedPath)) {
        fs.unlinkSync(flaggedPath);
      }
      if (fs.existsSync(dumpPath)) {
        fs.unlinkSync(dumpPath);
      }

      // Save if we have flagged files
      if (this.flaggedFiles.length > 0) {
        const lines = this.flaggedFiles.map(item => `${item.confNum} ${item.filename}`);
        fs.writeFileSync(flaggedPath, lines.join('\n') + '\n', 'utf-8');
      }
    } catch (error) {
      console.error('Error saving flagged files:', error);
    }
  }

  /**
   * Get path to flagged files storage
   * Port from express.e:2765+ loadFlagged() path logic
   */
  private getFlaggedFilePath(): string {
    // Format: BBS/Partdownload/flagged{slotNumber}
    // Note: express.e has ownPartFiles flag that includes node number, we'll simplify
    return path.join(this.bbsDataPath, 'Partdownload', `flagged${this.userSlot}`);
  }

  /**
   * Get path to dump file storage
   */
  private getDumpFilePath(): string {
    return path.join(this.bbsDataPath, 'Partdownload', `dump${this.userSlot}`);
  }
}

/**
 * Show flags prompt
 * Port from express.e:12486+ showFlags()
 */
export function getShowFlagsMessage(manager: FileFlagManager): string {
  if (manager.getCount() === 0) {
    return 'No file flags\r\n';
  } else {
    return manager.getDisplayString(-1) + '\r\n';
  }
}

/**
 * Flag files prompt
 * Port from express.e:12594+ flagFiles()
 */
export function getFlagFilesPrompt(): string {
  return '\x1b[36mFilename(s) to flag: \x1b[32m(\x1b[33mF\x1b[32m)\x1b[36mrom, \x1b[32m(\x1b[33mC\x1b[32m)\x1b[36mlear, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none\x1b[0m? ';
}

/**
 * Clear flags prompt
 * Port from express.e:12594+ flagFiles() clear section
 */
export function getClearFlagsPrompt(): string {
  return '\x1b[36mFilename(s) to Clear: \x1b[32m(\x1b[33m*\x1b[32m)\x1b[36mAll, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none\x1b[0m? ';
}

/**
 * Flag From prompt (flag from specific file onwards)
 * Port from express.e:12594+ flagFiles() F section
 */
export function getFlagFromPrompt(): string {
  return '\x1b[36mFilename to start flagging from: \x1b[0m';
}
