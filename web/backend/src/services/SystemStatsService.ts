/**
 * System Statistics Service
 * Tracks daily BBS statistics for MCI codes like ~SC (System Calls Today)
 *
 * Based on express.e system call tracking
 */

import { db } from '../database';

export interface DailyStats {
  date: string;  // YYYY-MM-DD
  totalCalls: number;
  uniqueUsers: number;
  totalLogins: number;
  totalMessages: number;
  totalUploads: number;
  totalDownloads: number;
  totalDoorLaunches: number;
}

class SystemStatsService {
  private todayStats: DailyStats | null = null;
  private currentDate: string = '';

  constructor() {
    this.initializeToday();
  }

  /**
   * Initialize today's stats
   */
  private initializeToday(): void {
    const today = this.getTodayDate();
    this.currentDate = today;

    // Load today's stats from database or create new
    this.loadTodayStats();
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  private getTodayDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Check if date has changed and roll over stats
   */
  private checkDateRollover(): void {
    const today = this.getTodayDate();
    if (today !== this.currentDate) {
      // Date changed - save old stats and start new day
      this.saveStats();
      this.currentDate = today;
      this.todayStats = {
        date: today,
        totalCalls: 0,
        uniqueUsers: 0,
        totalLogins: 0,
        totalMessages: 0,
        totalUploads: 0,
        totalDownloads: 0,
        totalDoorLaunches: 0
      };
    }
  }

  /**
   * Load today's stats from database
   */
  private async loadTodayStats(): Promise<void> {
    try {
      const stats = await db.getDailyStats(this.currentDate);
      if (stats) {
        this.todayStats = stats;
      } else {
        // No stats for today yet - initialize
        this.todayStats = {
          date: this.currentDate,
          totalCalls: 0,
          uniqueUsers: 0,
          totalLogins: 0,
          totalMessages: 0,
          totalUploads: 0,
          totalDownloads: 0,
          totalDoorLaunches: 0
        };
      }
    } catch (error) {
      console.error('[SystemStats] Error loading today stats:', error);
      // Initialize with defaults
      this.todayStats = {
        date: this.currentDate,
        totalCalls: 0,
        uniqueUsers: 0,
        totalLogins: 0,
        totalMessages: 0,
        totalUploads: 0,
        totalDownloads: 0,
        totalDoorLaunches: 0
      };
    }
  }

  /**
   * Save stats to database
   */
  private async saveStats(): Promise<void> {
    if (!this.todayStats) return;

    try {
      await db.saveDailyStats(this.todayStats);
    } catch (error) {
      console.error('[SystemStats] Error saving stats:', error);
    }
  }

  /**
   * Increment total calls (user login/connect)
   */
  async incrementCalls(userId?: number): Promise<void> {
    this.checkDateRollover();

    if (this.todayStats) {
      this.todayStats.totalCalls++;
      this.todayStats.totalLogins++;

      // Track unique users
      if (userId) {
        const uniqueUsers = await db.getTodayUniqueUserCount(this.currentDate);
        this.todayStats.uniqueUsers = uniqueUsers;
      }

      // Save periodically (every 10 calls)
      if (this.todayStats.totalCalls % 10 === 0) {
        await this.saveStats();
      }
    }
  }

  /**
   * Increment message count
   */
  async incrementMessages(): Promise<void> {
    this.checkDateRollover();

    if (this.todayStats) {
      this.todayStats.totalMessages++;

      // Save periodically (every 10 messages)
      if (this.todayStats.totalMessages % 10 === 0) {
        await this.saveStats();
      }
    }
  }

  /**
   * Increment upload count
   */
  async incrementUploads(): Promise<void> {
    this.checkDateRollover();

    if (this.todayStats) {
      this.todayStats.totalUploads++;
      await this.saveStats();
    }
  }

  /**
   * Increment download count
   */
  async incrementDownloads(): Promise<void> {
    this.checkDateRollover();

    if (this.todayStats) {
      this.todayStats.totalDownloads++;
      await this.saveStats();
    }
  }

  /**
   * Increment door launch count
   */
  async incrementDoorLaunches(): Promise<void> {
    this.checkDateRollover();

    if (this.todayStats) {
      this.todayStats.totalDoorLaunches++;

      // Save periodically (every 5 door launches)
      if (this.todayStats.totalDoorLaunches % 5 === 0) {
        await this.saveStats();
      }
    }
  }

  /**
   * Get today's total calls (for ~SC MCI code)
   */
  getTodayCalls(): number {
    this.checkDateRollover();
    return this.todayStats?.totalCalls || 0;
  }

  /**
   * Get today's stats
   */
  getTodayStats(): DailyStats | null {
    this.checkDateRollover();
    return this.todayStats;
  }

  /**
   * Get stats for specific date
   */
  async getStatsForDate(date: string): Promise<DailyStats | null> {
    try {
      return await db.getDailyStats(date);
    } catch (error) {
      console.error('[SystemStats] Error getting stats for date:', error);
      return null;
    }
  }

  /**
   * Get stats for date range
   */
  async getStatsForRange(startDate: string, endDate: string): Promise<DailyStats[]> {
    try {
      return await db.getDailyStatsRange(startDate, endDate);
    } catch (error) {
      console.error('[SystemStats] Error getting stats range:', error);
      return [];
    }
  }

  /**
   * Force save current stats
   */
  async forceSave(): Promise<void> {
    await this.saveStats();
  }
}

// Export singleton instance
export const systemStats = new SystemStatsService();
