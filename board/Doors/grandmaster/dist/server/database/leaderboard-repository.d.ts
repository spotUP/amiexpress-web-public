/**
 * Leaderboard Repository
 *
 * Database operations for leaderboard entries
 */
import type { Database } from 'better-sqlite3';
import type { LeaderboardEntry, LeaderboardQuery } from '../leaderboard-manager';
import type { GameMode } from '../../core/types';
export declare class LeaderboardRepository {
    private db;
    constructor(db: Database);
    /**
     * Insert leaderboard entry
     */
    insert(entry: LeaderboardEntry): void;
    /**
     * Get leaderboard entries
     */
    query(query: LeaderboardQuery): LeaderboardEntry[];
    /**
     * Get user's best score for a mode
     */
    getUserBest(userId: string, mode: GameMode): LeaderboardEntry | null;
    /**
     * Get user's rank in a mode
     */
    getUserRank(userId: string, mode: GameMode): number | null;
    /**
     * Get entry count
     */
    count(query?: LeaderboardQuery): number;
    /**
     * Delete all entries for a user
     */
    deleteByUser(userId: string): number;
    /**
     * Clear all entries
     */
    deleteAll(): void;
    /**
     * Convert database row to LeaderboardEntry
     */
    private rowToEntry;
}
//# sourceMappingURL=leaderboard-repository.d.ts.map