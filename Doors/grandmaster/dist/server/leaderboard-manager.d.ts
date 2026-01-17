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
    validationScore: number;
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
export declare class LeaderboardManager {
    private entries;
    private userBests;
    private repository;
    constructor();
    /**
     * Submit a score to the leaderboard
     */
    submitScore(userId: string, username: string, result: GameResult, validation: ValidationResult, replayId?: string): Promise<{
        rank: number;
        isPersonalBest: boolean;
        isTopTen: boolean;
    }>;
    /**
     * Get leaderboard entries
     */
    getLeaderboard(query?: LeaderboardQuery): LeaderboardEntry[];
    /**
     * Get user's personal best for a mode
     */
    getUserBest(userId: string, mode: GameMode): LeaderboardEntry | null;
    /**
     * Get user's rank in a mode
     */
    getUserRank(userId: string, mode: GameMode): number | null;
    /**
     * Get leaderboard statistics
     */
    getStats(mode?: GameMode): LeaderboardStats;
    /**
     * Update user's best score for a mode
     */
    private updateUserBest;
    /**
     * Calculate rank for an entry
     */
    private calculateRank;
    /**
     * Generate unique entry ID
     */
    private generateEntryId;
    /**
     * Persist entry to database
     */
    private persistEntry;
    /**
     * Load entries from database
     */
    loadFromDatabase(): Promise<void>;
    /**
     * Export leaderboard data
     */
    exportData(mode?: GameMode): string;
    /**
     * Import leaderboard data
     */
    importData(data: string): number;
    /**
     * Clear all entries (dangerous!)
     */
    clearAll(): void;
    /**
     * Remove entries for a specific user
     */
    removeUserEntries(userId: string): number;
}
//# sourceMappingURL=leaderboard-manager.d.ts.map