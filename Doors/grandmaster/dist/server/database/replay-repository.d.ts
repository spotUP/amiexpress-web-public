/**
 * Replay Repository
 *
 * Database operations for replay data
 */
import type { Database } from 'better-sqlite3';
import type { Replay, ReplayMetadata } from '../replay-manager';
import type { GameMode } from '../../core/types';
export declare class ReplayRepository {
    private db;
    constructor(db: Database);
    /**
     * Insert replay
     */
    insert(replay: Replay): Promise<void>;
    /**
     * Get replay by ID
     */
    get(replayId: string): Promise<Replay | null>;
    /**
     * Get replays for a user
     */
    getUserReplays(userId: string, mode?: GameMode, limit?: number): Promise<ReplayMetadata[]>;
    /**
     * Get top replays for a mode
     */
    getTopReplays(mode: GameMode, limit?: number): Promise<ReplayMetadata[]>;
    /**
     * Delete replay
     */
    delete(replayId: string): boolean;
    /**
     * Delete old replays
     */
    deleteOlderThan(maxAge: number): number;
    /**
     * Get storage statistics
     */
    getStats(): {
        totalReplays: number;
        totalInputs: number;
        totalSnapshots: number;
        averageInputsPerReplay: number;
        averageSnapshotsPerReplay: number;
        oldestReplay: number | null;
        newestReplay: number | null;
    };
    /**
     * Compress data with gzip
     */
    private compress;
    /**
     * Decompress data with gzip
     */
    private decompress;
    /**
     * Convert database row to Replay
     */
    private rowToReplay;
    /**
     * Convert database row to ReplayMetadata
     */
    private rowToMetadata;
}
//# sourceMappingURL=replay-repository.d.ts.map