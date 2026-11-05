/**
 * User Repository
 *
 * Database operations for user data in GRANDMASTER
 */
import type { Database } from 'better-sqlite3';
export interface GrandmasterUser {
    userId: string;
    username: string;
    createdAt: number;
    lastPlayed: number | null;
    gamesPlayed: number;
    totalLines: number;
    totalScore: number;
    totalPlaytime: number;
    bestGrade: string;
    bestLevel: number;
    bestScore: number;
    bestMode: string | null;
}
export declare class UserRepository {
    private db;
    constructor(db: Database);
    /**
     * Ensure user exists in database (upsert)
     * Creates user if not exists, updates last_played if exists
     */
    ensureUser(userId: string, username: string): void;
    /**
     * Get user by ID
     */
    get(userId: string): GrandmasterUser | null;
    /**
     * Get user by username
     */
    getByUsername(username: string): GrandmasterUser | null;
    /**
     * Update user stats after a game
     */
    updateStats(userId: string, score: number, lines: number, level: number, grade: string, mode: string, playtime: number): void;
    /**
     * Get top users by total score
     */
    getTopByScore(limit?: number): GrandmasterUser[];
    /**
     * Get top users by best grade
     */
    getTopByGrade(limit?: number): GrandmasterUser[];
    private rowToUser;
}
//# sourceMappingURL=user-repository.d.ts.map