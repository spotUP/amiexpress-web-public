/**
 * Replay Manager
 *
 * Handles recording, storage, and playback of game replays
 * - Input recording (every action with timestamp)
 * - State snapshots (periodic game state for verification)
 * - Compression (efficient storage)
 * - Validation integration
 * - Replay playback
 */
import type { GameMode, GameState, PieceType } from '../core/types';
import type { ReplayData } from './game-validator';
/**
 * Input action types
 */
export type InputAction = 'move_left' | 'move_right' | 'rotate_cw' | 'rotate_ccw' | 'soft_drop' | 'hard_drop' | 'hold' | 'irs_cw' | 'irs_ccw' | 'ihs';
/**
 * Recorded input with timestamp
 */
export interface ReplayInput {
    timestamp: number;
    frame: number;
    action: InputAction;
    piece?: PieceType;
}
/**
 * Game state snapshot for verification
 */
export interface ReplaySnapshot {
    timestamp: number;
    frame: number;
    level: number;
    lines: number;
    score: number;
    grade: string;
    combo: number;
    backToBack: boolean;
    holdPiece: PieceType | null;
    nextPieces: PieceType[];
    board: Array<Array<{
        filled: boolean;
        color?: string;
    }>>;
}
/**
 * Complete replay metadata
 */
export interface ReplayMetadata {
    id: string;
    userId: string;
    username: string;
    mode: GameMode;
    timestamp: number;
    duration: number;
    finalScore: number;
    finalLevel: number;
    finalGrade: string;
    finalLines: number;
    seed?: number;
    version: string;
}
/**
 * Full replay data structure
 */
export interface Replay {
    metadata: ReplayMetadata;
    inputs: ReplayInput[];
    snapshots: ReplaySnapshot[];
    compressed?: boolean;
}
/**
 * Replay recording session
 */
export declare class ReplayRecorder {
    private userId;
    private username;
    private mode;
    private seed?;
    private inputs;
    private snapshots;
    private startTime;
    private frameCount;
    private lastSnapshotFrame;
    private snapshotInterval;
    constructor(userId: string, username: string, mode: GameMode, seed?: number | undefined);
    /**
     * Record an input action
     */
    recordInput(action: InputAction, piece?: PieceType): void;
    /**
     * Record a state snapshot (called periodically)
     */
    recordSnapshot(state: GameState): void;
    /**
     * Update frame counter
     */
    updateFrame(): void;
    /**
     * Capture minimal board state
     */
    private captureBoard;
    /**
     * Finalize and create replay object
     */
    finalize(finalState: GameState): Replay;
    /**
     * Generate unique replay ID
     */
    private generateReplayId;
    /**
     * Convert to validator format
     */
    toValidatorFormat(): ReplayData;
}
/**
 * Replay manager with storage and playback
 */
export declare class ReplayManager {
    private replays;
    private repository;
    private userRepository;
    constructor();
    /**
     * Store a replay
     */
    storeReplay(replay: Replay): Promise<string>;
    /**
     * Retrieve a replay
     */
    getReplay(replayId: string): Promise<Replay | null>;
    /**
     * Get replays for a user
     */
    getUserReplays(userId: string, mode?: GameMode, limit?: number): Promise<ReplayMetadata[]>;
    /**
     * Get top replays for a mode
     */
    getTopReplays(mode: GameMode, limit?: number): Promise<ReplayMetadata[]>;
    /**
     * Verify replay integrity
     */
    verifyReplay(replayId: string): Promise<{
        valid: boolean;
        errors: string[];
        warnings: string[];
    }>;
    /**
     * Delete a replay
     */
    deleteReplay(replayId: string): Promise<boolean>;
    /**
     * Export replay as JSON
     */
    exportReplay(replay: Replay): string;
    /**
     * Import replay from JSON
     */
    importReplay(data: string): Replay;
    /**
     * Compress replay (simple delta encoding for now)
     */
    private compressReplay;
    /**
     * Decompress replay
     */
    private decompressReplay;
    /**
     * Persist replay to database
     */
    private persistReplay;
    /**
     * Load replay from database
     */
    private loadReplay;
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
     * Cleanup old replays
     */
    cleanupOldReplays(maxAge: number): Promise<number>;
}
//# sourceMappingURL=replay-manager.d.ts.map