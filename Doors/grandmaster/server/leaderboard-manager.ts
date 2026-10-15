/**
 * Leaderboard Manager
 *
 * Handles persistent storage and retrieval of high scores
 * - Per-mode leaderboards
 * - Global rankings
 * - Historical tracking
 * - Anti-cheat integration
 */

import type { GameResult, GameMode } from '../core/types';
import type { ValidationResult } from './game-validator';
import { getDatabase } from './database/connection';
import { LeaderboardRepository } from './database/leaderboard-repository';

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  id: string;
  userId: string;
  username: string;
  mode: GameMode;
  score: number;
  level: number;
  grade: string;
  lines: number;
  time: number | null;
  finesseRate?: number;
  finesseErrors?: number;
  timestamp: number;
  validationScore: number;  // 0-100, higher = more trustworthy
  flags: string[];
  replayId?: string;
}

/**
 * Leaderboard query options
 */
export interface LeaderboardQuery {
  mode?: GameMode;
  userId?: string;
  limit?: number;
  offset?: number;
  minValidationScore?: number;
  startDate?: number;
  endDate?: number;
}

/**
 * Leaderboard statistics
 */
export interface LeaderboardStats {
  totalEntries: number;
  uniquePlayers: number;
  averageScore: number;
  averageLevel: number;
  highestGrade: string;
  fastestTime: number | null;
}

/**
 * Leaderboard manager with persistent storage
 */
export class LeaderboardManager {
  private entries: Map<string, LeaderboardEntry> = new Map();
  private userBests: Map<string, Map<GameMode, LeaderboardEntry>> = new Map();
  private repository: LeaderboardRepository;

  constructor() {
    const db = getDatabase().getDb();
    this.repository = new LeaderboardRepository(db);

    // Load existing entries from database
    this.loadFromDatabase();
  }

  /**
   * Submit a score to the leaderboard
   */
  async submitScore(
    userId: string,
    username: string,
    result: GameResult,
    validation: ValidationResult,
    replayId?: string
  ): Promise<{ rank: number; isPersonalBest: boolean; isTopTen: boolean }> {
    const entry: LeaderboardEntry = {
      id: this.generateEntryId(userId, result),
      userId,
      username,
      mode: result.mode,
      score: result.score,
      level: result.level,
      grade: result.grade,
      lines: result.linesCleared,
      time: result.time,
      finesseRate: result.finesseRate,
      finesseErrors: result.finesseErrors,
      timestamp: Date.now(),
      validationScore: validation.score,
      flags: validation.flags,
      replayId,
    };

    // Only accept if validation score is acceptable
    if (validation.score < 50) {
      throw new Error('Score rejected: validation failed');
    }

    // Store entry
    this.entries.set(entry.id, entry);

    // Update user best
    const isPersonalBest = this.updateUserBest(entry);

    // Calculate rank
    const rank = this.calculateRank(entry);
    const isTopTen = rank <= 10;

    // Persist to database (in real implementation)
    await this.persistEntry(entry);

    return { rank, isPersonalBest, isTopTen };
  }

  /**
   * Get leaderboard entries
   */
  getLeaderboard(query: LeaderboardQuery = {}): LeaderboardEntry[] {
    let results = Array.from(this.entries.values());

    // Filter by mode
    if (query.mode) {
      results = results.filter(e => e.mode === query.mode);
    }

    // Filter by user
    if (query.userId) {
      results = results.filter(e => e.userId === query.userId);
    }

    // Filter by validation score
    if (query.minValidationScore !== undefined) {
      results = results.filter(e => e.validationScore >= query.minValidationScore!);
    }

    // Filter by date range
    if (query.startDate) {
      results = results.filter(e => e.timestamp >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter(e => e.timestamp <= query.endDate!);
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Apply limit and offset
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    return results.slice(offset, offset + limit);
  }

  /**
   * Get user's personal best for a mode
   */
  getUserBest(userId: string, mode: GameMode): LeaderboardEntry | null {
    const userBests = this.userBests.get(userId);
    if (!userBests) return null;
    return userBests.get(mode) || null;
  }

  /**
   * Get user's rank in a mode
   */
  getUserRank(userId: string, mode: GameMode): number | null {
    const best = this.getUserBest(userId, mode);
    if (!best) return null;
    return this.calculateRank(best);
  }

  /**
   * Get leaderboard statistics
   */
  getStats(mode?: GameMode): LeaderboardStats {
    let entries = Array.from(this.entries.values());

    if (mode) {
      entries = entries.filter(e => e.mode === mode);
    }

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        uniquePlayers: 0,
        averageScore: 0,
        averageLevel: 0,
        highestGrade: '9',
        fastestTime: null,
      };
    }

    const uniquePlayers = new Set(entries.map(e => e.userId)).size;
    const totalScore = entries.reduce((sum, e) => sum + e.score, 0);
    const totalLevel = entries.reduce((sum, e) => sum + e.level, 0);
    const averageScore = totalScore / entries.length;
    const averageLevel = totalLevel / entries.length;

    // Find highest grade
    const gradeRanks: Record<string, number> = {
      '9': 0, '8': 1, '7': 2, '6': 3, '5': 4, '4': 5, '3': 6, '2': 7, '1': 8,
      'S1': 9, 'S2': 10, 'S3': 11, 'S4': 12, 'S5': 13, 'S6': 14, 'S7': 15, 'S8': 16, 'S9': 17,
      'S10': 18, 'S11': 19, 'S12': 20, 'S13': 21,
      'm1': 22, 'm2': 23, 'm3': 24, 'm4': 25, 'm5': 26, 'm6': 27, 'm7': 28, 'm8': 29, 'm9': 30,
      'M': 31, 'MK': 32, 'MV': 33, 'MO': 34, 'GM': 35, 'GMM': 36,
    };

    const highestGrade = entries.reduce((highest, e) => {
      const currentRank = gradeRanks[e.grade] ?? 0;
      const highestRank = gradeRanks[highest] ?? 0;
      return currentRank > highestRank ? e.grade : highest;
    }, '9');

    // Find fastest time (for completed games)
    const completedGames = entries.filter(e => e.time !== null);
    const fastestTime = completedGames.length > 0
      ? Math.min(...completedGames.map(e => e.time!))
      : null;

    return {
      totalEntries: entries.length,
      uniquePlayers,
      averageScore: Math.floor(averageScore),
      averageLevel: Math.floor(averageLevel),
      highestGrade,
      fastestTime,
    };
  }

  /**
   * Update user's best score for a mode
   */
  private updateUserBest(entry: LeaderboardEntry): boolean {
    if (!this.userBests.has(entry.userId)) {
      this.userBests.set(entry.userId, new Map());
    }

    const userBests = this.userBests.get(entry.userId)!;
    const currentBest = userBests.get(entry.mode);

    if (!currentBest || entry.score > currentBest.score) {
      userBests.set(entry.mode, entry);
      return true;
    }

    return false;
  }

  /**
   * Calculate rank for an entry
   */
  private calculateRank(entry: LeaderboardEntry): number {
    const modeEntries = this.getLeaderboard({ mode: entry.mode, minValidationScore: 50 });
    const rank = modeEntries.findIndex(e => e.id === entry.id);
    return rank === -1 ? modeEntries.length + 1 : rank + 1;
  }

  /**
   * Generate unique entry ID
   */
  private generateEntryId(userId: string, result: GameResult): string {
    const timestamp = Date.now();
    return `${userId}_${result.mode}_${timestamp}`;
  }

  /**
   * Persist entry to database
   */
  private async persistEntry(entry: LeaderboardEntry): Promise<void> {
    this.repository.insert(entry);
  }

  /**
   * Load entries from database
   */
  async loadFromDatabase(): Promise<void> {
    const entries = this.repository.query({ limit: 10000 }); // Load all

    // Populate in-memory cache
    this.entries.clear();
    this.userBests.clear();

    for (const entry of entries) {
      this.entries.set(entry.id, entry);
      this.updateUserBest(entry);
    }
  }

  /**
   * Export leaderboard data
   */
  exportData(mode?: GameMode): string {
    const entries = this.getLeaderboard({ mode, limit: 1000 });
    return JSON.stringify(entries, null, 2);
  }

  /**
   * Import leaderboard data
   */
  importData(data: string): number {
    try {
      const entries = JSON.parse(data) as LeaderboardEntry[];
      let imported = 0;

      for (const entry of entries) {
        this.entries.set(entry.id, entry);
        this.updateUserBest(entry);
        imported++;
      }

      return imported;
    } catch (error) {
      throw new Error(`Failed to import data: ${error}`);
    }
  }

  /**
   * Clear all entries (dangerous!)
   */
  clearAll(): void {
    this.entries.clear();
    this.userBests.clear();
    this.repository.deleteAll();
  }

  /**
   * Remove entries for a specific user
   */
  removeUserEntries(userId: string): number {
    const removed = this.repository.deleteByUser(userId);

    // Update in-memory cache
    for (const [id, entry] of this.entries) {
      if (entry.userId === userId) {
        this.entries.delete(id);
      }
    }
    this.userBests.delete(userId);

    return removed;
  }
}
