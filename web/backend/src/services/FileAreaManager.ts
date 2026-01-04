/**
 * FileAreaManager - Manages AmiExpress .dir file area database files
 *
 * Creates and maintains file directory files:
 * - Conf{n}/Files/{area}.dir
 *
 * File format:
 * - Binary array of file entry structs
 * - Each file entry contains metadata about uploaded files
 *
 * For now, we'll use a simpler text-based .dir format since the exact
 * binary struct format isn't documented in axobjects.e.
 * AmiExpress uses various formats for .dir files.
 *
 * Text .dir format (one line per file):
 * filename|size|uploader|uploadDate|downloads|description
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileEntry {
  id: number;
  filename: string;
  description: string;
  size: number;
  uploader: string;
  uploadDate: Date;
  downloads: number;
  areaId: number;
  conferenceId?: number;
  filePath?: string;
  fileIdDiz?: string;
  rating?: number;
  votes?: number;
  status: 'active' | 'held' | 'deleted';
  checked: 'N' | 'P' | 'F';
  comment?: string;
}

interface FileArea {
  id: number;
  name: string;
  description: string;
  path: string;
  conferenceId: number;
}

export class FileAreaManager {
  private bbsRoot: string;

  constructor() {
    // Path resolution: 4 levels up from src/services/ to project root
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
  }

  /**
   * Get the Files directory path for a conference
   */
  private getFilesDir(confNumber: number): string {
    return path.join(this.bbsRoot, `Conf${confNumber}`, 'Files');
  }

  /**
   * Get the .dir file path for a file area
   */
  private getDirFilePath(confNumber: number, areaName: string): string {
    // Sanitize area name for filename
    const safeName = areaName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.getFilesDir(confNumber), `${safeName}.dir`);
  }

  /**
   * Ensure Files directory exists for a conference
   */
  private ensureFilesDir(confNumber: number): void {
    const dir = this.getFilesDir(confNumber);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
console.log(`[FileAreaManager] Created directory: ${dir}`);
    }
  }

  /**
   * Format timestamp as Unix timestamp
   */
  private formatTimestamp(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  /**
   * Parse timestamp from Unix timestamp
   */
  private parseTimestamp(timestamp: number): Date {
    return new Date(timestamp * 1000);
  }

  /**
   * Serialize a file entry to text line
   * Format: filename|size|uploader|uploadDate|downloads|description
   */
  private serializeFileEntry(entry: FileEntry): string {
    const timestamp = this.formatTimestamp(
      entry.uploadDate instanceof Date ? entry.uploadDate : new Date(entry.uploadDate)
    );

    const parts = [
      entry.filename || '',
      String(entry.size || 0),
      entry.uploader || '',
      String(timestamp),
      String(entry.downloads || 0),
      (entry.description || '').replace(/\|/g, '¦').replace(/\n/g, ' ')  // Escape pipes and newlines
    ];

    return parts.join('|');
  }

  /**
   * Parse a file entry from text line
   */
  private parseFileEntry(line: string, areaId: number): Partial<FileEntry> | null {
    const parts = line.split('|');

    if (parts.length < 6) {
      return null;
    }

    return {
      filename: parts[0],
      size: parseInt(parts[1], 10) || 0,
      uploader: parts[2],
      uploadDate: this.parseTimestamp(parseInt(parts[3], 10)),
      downloads: parseInt(parts[4], 10) || 0,
      description: parts[5].replace(/¦/g, '|'),  // Unescape pipes
      areaId
    };
  }

  /**
   * Read all file entries from a .dir file
   */
  private readDirFile(confNumber: number, areaName: string): Partial<FileEntry>[] {
    const filePath = this.getDirFilePath(confNumber, areaName);

    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);

      const entries: Partial<FileEntry>[] = [];
      for (const line of lines) {
        const entry = this.parseFileEntry(line, 0);  // areaId will be set by caller
        if (entry) {
          entries.push(entry);
        }
      }

      return entries;
    } catch (error) {
console.error(`[FileAreaManager] Error reading .dir file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Write all file entries to a .dir file
   */
  private writeDirFile(confNumber: number, areaName: string, entries: FileEntry[]): void {
    const filePath = this.getDirFilePath(confNumber, areaName);
    this.ensureFilesDir(confNumber);

    try {
      const lines = entries.map(entry => this.serializeFileEntry(entry));
      const content = lines.join('\n') + '\n';

      fs.writeFileSync(filePath, content, 'utf8');
console.log(`[FileAreaManager] Wrote ${entries.length} entries to ${filePath}`);
    } catch (error) {
console.error(`[FileAreaManager] Error writing .dir file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Add a file entry to a .dir file
   */
  addFileEntry(entry: FileEntry, area: FileArea): void {
    try {
      const confNumber = area.conferenceId;
      const areaName = area.name;

      // Read existing entries
      const entries = this.readDirFile(confNumber, areaName) as FileEntry[];

      // Add new entry
      entries.push(entry);

      // Write back
      this.writeDirFile(confNumber, areaName, entries);

console.log(`[FileAreaManager] Added file "${entry.filename}" to ${areaName}.dir`);
    } catch (error) {
console.error(`[FileAreaManager] Error adding file entry:`, error);
      throw error;
    }
  }

  /**
   * Update a file entry in a .dir file
   */
  updateFileEntry(entry: FileEntry, area: FileArea): void {
    try {
      const confNumber = area.conferenceId;
      const areaName = area.name;

      // Read existing entries
      const entries = this.readDirFile(confNumber, areaName) as FileEntry[];

      // Find and update entry by filename
      const index = entries.findIndex(e => e.filename === entry.filename);

      if (index >= 0) {
        entries[index] = entry;
        this.writeDirFile(confNumber, areaName, entries);
console.log(`[FileAreaManager] Updated file "${entry.filename}" in ${areaName}.dir`);
      } else {
console.warn(`[FileAreaManager] File "${entry.filename}" not found in ${areaName}.dir`);
        // Add it anyway
        entries.push(entry);
        this.writeDirFile(confNumber, areaName, entries);
      }
    } catch (error) {
console.error(`[FileAreaManager] Error updating file entry:`, error);
      throw error;
    }
  }

  /**
   * Delete a file entry from a .dir file
   */
  deleteFileEntry(filename: string, area: FileArea): void {
    try {
      const confNumber = area.conferenceId;
      const areaName = area.name;

      // Read existing entries
      const entries = this.readDirFile(confNumber, areaName) as FileEntry[];

      // Filter out the entry
      const filtered = entries.filter(e => e.filename !== filename);

      if (filtered.length < entries.length) {
        this.writeDirFile(confNumber, areaName, filtered);
console.log(`[FileAreaManager] Deleted file "${filename}" from ${areaName}.dir`);
      } else {
console.warn(`[FileAreaManager] File "${filename}" not found in ${areaName}.dir`);
      }
    } catch (error) {
console.error(`[FileAreaManager] Error deleting file entry:`, error);
      throw error;
    }
  }

  /**
   * Create a new .dir file for a file area
   */
  createAreaDirFile(area: FileArea): void {
    try {
      const confNumber = area.conferenceId;
      const areaName = area.name;

      this.ensureFilesDir(confNumber);

      const filePath = this.getDirFilePath(confNumber, areaName);

      // Create empty .dir file
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '', 'utf8');
console.log(`[FileAreaManager] Created .dir file: ${filePath}`);
      }
    } catch (error) {
console.error(`[FileAreaManager] Error creating .dir file:`, error);
      throw error;
    }
  }

  /**
   * List all .dir files in a conference
   */
  listDirFiles(confNumber: number): string[] {
    this.ensureFilesDir(confNumber);
    const dir = this.getFilesDir(confNumber);

    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir);
    return files.filter(file => file.endsWith('.dir'));
  }

  /**
   * Initialize file area directories for existing conferences
   */
  initializeFileAreaDirs(): void {
console.log('[FileAreaManager] Initializing file area directories...');

    // Create directories for Conf1 through Conf10 if they don't exist
    for (let i = 1; i <= 10; i++) {
      this.ensureFilesDir(i);
    }

console.log('[FileAreaManager] File area directories initialized');
  }

  /**
   * Rebuild .dir file from database (for initial sync)
   */
  rebuildDirFile(area: FileArea, entries: FileEntry[]): void {
    try {
      const confNumber = area.conferenceId;
      const areaName = area.name;

      this.ensureFilesDir(confNumber);
      this.writeDirFile(confNumber, areaName, entries);

console.log(`[FileAreaManager] Rebuilt ${areaName}.dir with ${entries.length} entries`);
    } catch (error) {
console.error(`[FileAreaManager] Error rebuilding .dir file:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const fileAreaManager = new FileAreaManager();
