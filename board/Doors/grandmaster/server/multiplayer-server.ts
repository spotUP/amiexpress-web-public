/**
 * Multiplayer Server
 *
 * Coordinates all server-side systems:
 * - Game validation
 * - Leaderboard management
 * - Replay storage
 * - Anti-cheat detection
 */

import type { GameResult } from '../core/types';
import { GameValidator, ValidationResult } from './game-validator';
import { LeaderboardManager, LeaderboardEntry, LeaderboardQuery } from './leaderboard-manager';
import { ReplayManager, ReplayRecorder, Replay, ReplayMetadata } from './replay-manager';

/**
 * Score submission result
 */
export interface ScoreSubmissionResult {
  accepted: boolean;
  reason?: string;
  rank?: number;
  isPersonalBest?: boolean;
  isTopTen?: boolean;
  validationScore?: number;
  validationFlags?: string[];
  replayId?: string;
}

/**
 * Multiplayer server configuration
 */
export interface MultiplayerConfig {
  minValidationScore?: number;  // Minimum validation score to accept (default: 50)
  requireReplay?: boolean;       // Require replay for score submission (default: false)
  enableAntiCheat?: boolean;     // Enable anti-cheat analysis (default: true)
  maxReplayAge?: number;         // Max replay age in ms before cleanup (default: 30 days)
}

/**
 * Main multiplayer server class
 */
export class MultiplayerServer {
  private validator: GameValidator;
  private leaderboard: LeaderboardManager;
  private replays: ReplayManager;
  private config: Required<MultiplayerConfig>;

  constructor(config: MultiplayerConfig = {}) {
    this.validator = new GameValidator();
    this.leaderboard = new LeaderboardManager();
    this.replays = new ReplayManager();

    this.config = {
      minValidationScore: config.minValidationScore ?? 50,
      requireReplay: config.requireReplay ?? false,
      enableAntiCheat: config.enableAntiCheat ?? true,
      maxReplayAge: config.maxReplayAge ?? 30 * 24 * 60 * 60 * 1000,  // 30 days
    };
  }

  /**
   * Submit a score with optional replay
   */
  async submitScore(
    userId: string,
    username: string,
    result: GameResult,
    replay?: Replay
  ): Promise<ScoreSubmissionResult> {
    // Validate the score
    const validation = replay
      ? this.validator.validate(result, replay.inputs && replay.snapshots ? {
          inputs: replay.inputs.map(inp => ({
            timestamp: inp.timestamp,
            action: inp.action,
          })),
          states: replay.snapshots.map(snap => ({
            timestamp: snap.timestamp,
            level: snap.level,
            lines: snap.lines,
            score: snap.score,
            grade: snap.grade,
          })),
        } : undefined)
      : this.validator.validate(result);

    // Check if validation passed minimum threshold
    if (validation.score < this.config.minValidationScore) {
      return {
        accepted: false,
        reason: `Validation failed: score ${validation.score}/100 below minimum ${this.config.minValidationScore}`,
        validationScore: validation.score,
        validationFlags: validation.flags,
      };
    }

    // Check if replay is required but missing
    if (this.config.requireReplay && !replay) {
      return {
        accepted: false,
        reason: 'Replay required for score submission',
      };
    }

    // Anti-cheat analysis
    if (this.config.enableAntiCheat) {
      const anomalyScore = this.validator.calculateAnomalyScore(result);
      if (anomalyScore >= 80) {
        return {
          accepted: false,
          reason: `Anti-cheat flagged score (anomaly: ${anomalyScore}/100)`,
          validationScore: validation.score,
          validationFlags: [...validation.flags, `anomaly_score:${anomalyScore}`],
        };
      }
    }

    // Store replay if provided
    let replayId: string | undefined;
    if (replay) {
      try {
        replayId = await this.replays.storeReplay(replay);
      } catch (error) {
        // Don't fail submission if replay storage fails
        console.error('Failed to store replay:', error);
      }
    }

    // Submit to leaderboard
    try {
      const leaderboardResult = await this.leaderboard.submitScore(
        userId,
        username,
        result,
        validation,
        replayId
      );

      return {
        accepted: true,
        rank: leaderboardResult.rank,
        isPersonalBest: leaderboardResult.isPersonalBest,
        isTopTen: leaderboardResult.isTopTen,
        validationScore: validation.score,
        validationFlags: validation.flags,
        replayId,
      };
    } catch (error) {
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get leaderboard entries
   */
  getLeaderboard(query: LeaderboardQuery = {}): LeaderboardEntry[] {
    return this.leaderboard.getLeaderboard(query);
  }

  /**
   * Get user's personal best
   */
  getUserBest(userId: string, mode: GameResult['mode']): LeaderboardEntry | null {
    return this.leaderboard.getUserBest(userId, mode);
  }

  /**
   * Get user's rank
   */
  getUserRank(userId: string, mode: GameResult['mode']): number | null {
    return this.leaderboard.getUserRank(userId, mode);
  }

  /**
   * Get leaderboard statistics
   */
  getLeaderboardStats(mode?: GameResult['mode']) {
    return this.leaderboard.getStats(mode);
  }

  /**
   * Get a replay
   */
  async getReplay(replayId: string): Promise<Replay | null> {
    return this.replays.getReplay(replayId);
  }

  /**
   * Get user's replays
   */
  async getUserReplays(
    userId: string,
    mode?: GameResult['mode'],
    limit?: number
  ): Promise<ReplayMetadata[]> {
    return this.replays.getUserReplays(userId, mode, limit);
  }

  /**
   * Get top replays for a mode
   */
  async getTopReplays(
    mode: GameResult['mode'],
    limit?: number
  ): Promise<ReplayMetadata[]> {
    return this.replays.getTopReplays(mode, limit);
  }

  /**
   * Verify replay integrity
   */
  async verifyReplay(replayId: string) {
    return this.replays.verifyReplay(replayId);
  }

  /**
   * Export data for backup
   */
  exportData() {
    return {
      leaderboard: this.leaderboard.exportData(),
      stats: {
        leaderboard: this.leaderboard.getStats(),
        replays: this.replays.getStats(),
      },
    };
  }

  /**
   * Import data from backup
   */
  importData(data: { leaderboard?: string }) {
    if (data.leaderboard) {
      return this.leaderboard.importData(data.leaderboard);
    }
    return 0;
  }

  /**
   * Cleanup old data
   */
  async cleanup(): Promise<{ replaysRemoved: number }> {
    const replaysRemoved = await this.replays.cleanupOldReplays(this.config.maxReplayAge);
    return { replaysRemoved };
  }

  /**
   * Get server statistics
   */
  getServerStats() {
    return {
      leaderboard: this.leaderboard.getStats(),
      replays: this.replays.getStats(),
      config: this.config,
    };
  }

  /**
   * Ban a user (remove all their entries)
   */
  async banUser(userId: string): Promise<{ entriesRemoved: number }> {
    const entriesRemoved = this.leaderboard.removeUserEntries(userId);
    // Also delete their replays
    const userReplays = await this.replays.getUserReplays(userId);
    for (const replay of userReplays) {
      await this.replays.deleteReplay(replay.id);
    }
    return { entriesRemoved };
  }

  /**
   * Create a replay recorder for a game session
   */
  createReplayRecorder(
    userId: string,
    username: string,
    mode: GameResult['mode'],
    seed?: number
  ): ReplayRecorder {
    return new ReplayRecorder(userId, username, mode, seed);
  }
}
