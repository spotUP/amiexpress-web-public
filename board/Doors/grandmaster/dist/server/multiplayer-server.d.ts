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
import { LeaderboardEntry, LeaderboardQuery } from './leaderboard-manager';
import { ReplayRecorder, Replay, ReplayMetadata } from './replay-manager';
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
    minValidationScore?: number;
    requireReplay?: boolean;
    enableAntiCheat?: boolean;
    maxReplayAge?: number;
}
/**
 * Main multiplayer server class
 */
export declare class MultiplayerServer {
    private validator;
    private leaderboard;
    private replays;
    private config;
    constructor(config?: MultiplayerConfig);
    /**
     * Submit a score with optional replay
     */
    submitScore(userId: string, username: string, result: GameResult, replay?: Replay): Promise<ScoreSubmissionResult>;
    /**
     * Get leaderboard entries
     */
    getLeaderboard(query?: LeaderboardQuery): LeaderboardEntry[];
    /**
     * Get user's personal best
     */
    getUserBest(userId: string, mode: GameResult['mode']): LeaderboardEntry | null;
    /**
     * Get user's rank
     */
    getUserRank(userId: string, mode: GameResult['mode']): number | null;
    /**
     * Get leaderboard statistics
     */
    getLeaderboardStats(mode?: GameResult['mode']): import("./leaderboard-manager").LeaderboardStats;
    /**
     * Get a replay
     */
    getReplay(replayId: string): Promise<Replay | null>;
    /**
     * Get user's replays
     */
    getUserReplays(userId: string, mode?: GameResult['mode'], limit?: number): Promise<ReplayMetadata[]>;
    /**
     * Get top replays for a mode
     */
    getTopReplays(mode: GameResult['mode'], limit?: number): Promise<ReplayMetadata[]>;
    /**
     * Verify replay integrity
     */
    verifyReplay(replayId: string): Promise<{
        valid: boolean;
        errors: string[];
        warnings: string[];
    }>;
    /**
     * Export data for backup
     */
    exportData(): {
        leaderboard: string;
        stats: {
            leaderboard: import("./leaderboard-manager").LeaderboardStats;
            replays: {
                totalReplays: number;
                totalInputs: number;
                totalSnapshots: number;
                averageInputsPerReplay: number;
                averageSnapshotsPerReplay: number;
                oldestReplay: number | null;
                newestReplay: number | null;
            };
        };
    };
    /**
     * Import data from backup
     */
    importData(data: {
        leaderboard?: string;
    }): number;
    /**
     * Cleanup old data
     */
    cleanup(): Promise<{
        replaysRemoved: number;
    }>;
    /**
     * Get server statistics
     */
    getServerStats(): {
        leaderboard: import("./leaderboard-manager").LeaderboardStats;
        replays: {
            totalReplays: number;
            totalInputs: number;
            totalSnapshots: number;
            averageInputsPerReplay: number;
            averageSnapshotsPerReplay: number;
            oldestReplay: number | null;
            newestReplay: number | null;
        };
        config: Required<MultiplayerConfig>;
    };
    /**
     * Ban a user (remove all their entries)
     */
    banUser(userId: string): Promise<{
        entriesRemoved: number;
    }>;
    /**
     * Create a replay recorder for a game session
     */
    createReplayRecorder(userId: string, username: string, mode: GameResult['mode'], seed?: number): ReplayRecorder;
}
//# sourceMappingURL=multiplayer-server.d.ts.map