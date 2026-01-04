/**
 * File Statistics Use Case
 *
 * Clean Architecture: Business logic for file upload/download statistics
 * Isolates file statistics logic from handlers and database
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '../../container';

export interface FileStats {
  conferenceId: number;
  conferenceName: string;
  uploads: number;
  downloads: number;
  uploadsToday: number;
  downloadsToday: number;
  totalFiles: number;
}

export interface UserFileStats {
  uploads: number;
  downloads: number;
  uploadsToday: number;
  downloadsToday: number;
  uploadKBytes: number;
  downloadKBytes: number;
}

@injectable()
export class FileStatisticsUseCase {
  constructor(
    @inject(DI_TOKENS.Database) private db: any,
    @inject(DI_TOKENS.Conferences) private conferences: any[]
  ) {}

  /**
   * Get file statistics for all conferences
   */
  async getAllConferenceStats(): Promise<FileStats[]> {
    try {
      const stats: FileStats[] = [];

      for (const conf of this.conferences) {
        const confStats = await this.getConferenceStats(conf.id);
        stats.push(confStats);
      }

      return stats;
    } catch (error) {
console.error('[FileStatisticsUseCase] Error getting all conference stats:', error);
      return [];
    }
  }

  /**
   * Get file statistics for specific conference
   */
  async getConferenceStats(conferenceId: number): Promise<FileStats> {
    try {
      const conf = this.conferences.find(c => c.id === conferenceId);
      const confName = conf?.name || `Conference ${conferenceId}`;

      // Get conference file counts
      const fileCount = await this.db.getFileCountByConference(conferenceId);
      const uploadCount = await this.db.getUploadCountByConference(conferenceId);
      const downloadCount = await this.db.getDownloadCountByConference(conferenceId);
      const uploadsTodayCount = await this.db.getUploadsTodayByConference(conferenceId);
      const downloadsTodayCount = await this.db.getDownloadsTodayByConference(conferenceId);

      return {
        conferenceId,
        conferenceName: confName,
        uploads: uploadCount || 0,
        downloads: downloadCount || 0,
        uploadsToday: uploadsTodayCount || 0,
        downloadsToday: downloadsTodayCount || 0,
        totalFiles: fileCount || 0
      };
    } catch (error) {
console.error(`[FileStatisticsUseCase] Error getting conference ${conferenceId} stats:`, error);
      return {
        conferenceId,
        conferenceName: `Conference ${conferenceId}`,
        uploads: 0,
        downloads: 0,
        uploadsToday: 0,
        downloadsToday: 0,
        totalFiles: 0
      };
    }
  }

  /**
   * Get file statistics for specific user
   */
  async getUserFileStats(userId: string): Promise<UserFileStats> {
    try {
      const user = await this.db.getUserById(userId);

      if (!user) {
        return this.getEmptyUserStats();
      }

      return {
        uploads: user.uploads || 0,
        downloads: user.downloads || 0,
        uploadsToday: user.uploadsToday || 0,
        downloadsToday: user.downloadsToday || 0,
        uploadKBytes: user.uploadKBytes || 0,
        downloadKBytes: user.downloadKBytes || 0
      };
    } catch (error) {
console.error(`[FileStatisticsUseCase] Error getting user ${userId} stats:`, error);
      return this.getEmptyUserStats();
    }
  }

  /**
   * Format file statistics for display
   */
  formatConferenceStatsTable(stats: FileStats[]): string {
    let output = '\r\n\x1b[36m=== File Statistics by Conference ===\x1b[0m\r\n\r\n';
    output += '\x1b[33mConference                  Files  Uploads  Downloads  Today(U/D)\x1b[0m\r\n';
    output += '\x1b[33m' + '-'.repeat(70) + '\x1b[0m\r\n';

    for (const stat of stats) {
      const confName = stat.conferenceName.padEnd(24);
      const files = stat.totalFiles.toString().padStart(6);
      const uploads = stat.uploads.toString().padStart(8);
      const downloads = stat.downloads.toString().padStart(10);
      const today = `${stat.uploadsToday}/${stat.downloadsToday}`.padStart(11);

      output += `${confName} ${files} ${uploads} ${downloads} ${today}\r\n`;
    }

    output += '\r\n';
    return output;
  }

  /**
   * Format user file statistics for display
   */
  formatUserStats(stats: UserFileStats): string {
    let output = '\r\n\x1b[36m=== Your File Statistics ===\x1b[0m\r\n\r\n';
    output += `Total Uploads:    ${stats.uploads} (${this.formatBytes(stats.uploadKBytes)})\r\n`;
    output += `Total Downloads:  ${stats.downloads} (${this.formatBytes(stats.downloadKBytes)})\r\n`;
    output += `Today Uploads:    ${stats.uploadsToday}\r\n`;
    output += `Today Downloads:  ${stats.downloadsToday}\r\n`;
    output += '\r\n';
    return output;
  }

  /**
   * Calculate upload/download ratio
   */
  calculateRatio(uploads: number, downloads: number): string {
    if (downloads === 0) {
      return uploads > 0 ? 'Unlimited' : 'N/A';
    }

    const ratio = uploads / downloads;
    return ratio.toFixed(2);
  }

  /**
   * Check if user meets download ratio requirements
   */
  async checkDownloadRatio(userId: string, requiredRatio: number): Promise<boolean> {
    const stats = await this.getUserFileStats(userId);

    if (stats.downloads === 0) {
      return true; // No downloads yet, allow
    }

    const ratio = stats.uploads / stats.downloads;
    return ratio >= requiredRatio;
  }

  private getEmptyUserStats(): UserFileStats {
    return {
      uploads: 0,
      downloads: 0,
      uploadsToday: 0,
      downloadsToday: 0,
      uploadKBytes: 0,
      downloadKBytes: 0
    };
  }

  private formatBytes(kbytes: number): string {
    if (kbytes < 1024) {
      return `${kbytes} KB`;
    }

    const mbytes = kbytes / 1024;
    if (mbytes < 1024) {
      return `${mbytes.toFixed(1)} MB`;
    }

    const gbytes = mbytes / 1024;
    return `${gbytes.toFixed(2)} GB`;
  }
}
