/**
 * Flagged Files Manager - Download Queue Tracking
 *
 * Manages user's flagged files (download queue) for batch downloads.
 * Based on express.e flagFilesList structure.
 */

export interface FlaggedFile {
  fileName: string;
  filePath: string;
  fileSize: number;
  areaId?: number;
}

export class FlaggedFilesManager {
  private flaggedFiles: Map<number, FlaggedFile[]> = new Map();

  /**
   * Add file to user's download queue
   */
  addFile(userId: number, file: FlaggedFile): void {
    if (!this.flaggedFiles.has(userId)) {
      this.flaggedFiles.set(userId, []);
    }

    const userFiles = this.flaggedFiles.get(userId)!;

    // Don't add duplicates
    if (userFiles.some(f => f.fileName === file.fileName && f.filePath === file.filePath)) {
      return;
    }

    userFiles.push(file);
  }

  /**
   * Remove file from user's download queue
   */
  removeFile(userId: number, fileName: string): boolean {
    const userFiles = this.flaggedFiles.get(userId);
    if (!userFiles) return false;

    const index = userFiles.findIndex(f => f.fileName === fileName);
    if (index === -1) return false;

    userFiles.splice(index, 1);
    return true;
  }

  /**
   * Get all flagged files for user
   */
  getFiles(userId: number): FlaggedFile[] {
    return this.flaggedFiles.get(userId) || [];
  }

  /**
   * Get count of flagged files for user
   */
  getCount(userId: number): number {
    return this.getFiles(userId).length;
  }

  /**
   * Clear all flagged files for user
   */
  clearFiles(userId: number): void {
    this.flaggedFiles.delete(userId);
  }

  /**
   * Check if file is flagged
   */
  isFlagged(userId: number, fileName: string): boolean {
    const userFiles = this.flaggedFiles.get(userId);
    if (!userFiles) return false;

    return userFiles.some(f => f.fileName === fileName);
  }

  /**
   * Get total size of flagged files for user
   */
  getTotalSize(userId: number): number {
    const userFiles = this.getFiles(userId);
    return userFiles.reduce((sum, file) => sum + file.fileSize, 0);
  }
}

// Singleton instance
export const flaggedFilesManager = new FlaggedFilesManager();
