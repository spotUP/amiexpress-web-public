/**
 * Rollback Netcode
 *
 * Implements rollback netcode for handling server corrections:
 * - Misprediction detection
 * - State restoration from snapshots
 * - Input replay after rollback
 * - Server state reconciliation
 */
import type { GameState } from '../core/types';
import type { SyncPacket } from './sync';
import { GameEngine } from '../core/game';
import { PredictionManager } from './prediction';
/**
 * Rollback reason
 */
export type RollbackReason = 'state_mismatch' | 'input_rejected' | 'desync_detected' | 'correction_needed';
/**
 * Rollback event
 */
export interface RollbackEvent {
    reason: RollbackReason;
    serverFrame: number;
    clientFrame: number;
    inputId: number;
    timestamp: number;
    deltaSize: number;
    replayCount: number;
}
/**
 * Mismatch details
 */
export interface StateMismatch {
    field: string;
    serverValue: any;
    clientValue: any;
}
/**
 * Rollback configuration
 */
export interface RollbackConfig {
    mismatchThreshold: number;
    maxRollbackFrames: number;
    enableValidation: boolean;
    logMismatches: boolean;
    autoCorrect: boolean;
}
/**
 * Rollback netcode manager
 */
export declare class RollbackManager {
    private config;
    private engine;
    private predictionManager;
    private rollbackHistory;
    private lastRollbackTime;
    private totalRollbacks;
    private totalMismatches;
    constructor(engine: GameEngine, predictionManager: PredictionManager, config?: Partial<RollbackConfig>);
    /**
     * Handle server state update
     */
    handleServerUpdate(packet: SyncPacket, currentFrame: number): boolean;
    /**
     * Perform rollback to server state
     */
    private performRollback;
    /**
     * Detect state mismatches
     */
    private detectMismatches;
    /**
     * Compare primitive field
     */
    private comparePrimitive;
    /**
     * Compare two pieces
     */
    private piecesEqual;
    /**
     * Compare two arrays
     */
    private arraysEqual;
    /**
     * Compare two boards
     */
    private boardsEqual;
    /**
     * Extract state from sync packet
     */
    private extractState;
    /**
     * Restore game state
     */
    private restoreState;
    /**
     * Force accept server state (no rollback)
     */
    private forceServerState;
    /**
     * Get recent rollback events
     */
    getRecentRollbacks(count?: number): RollbackEvent[];
    /**
     * Get rollback stats
     */
    getStats(): {
        totalRollbacks: number;
        totalMismatches: number;
        recentRollbacks: number;
        averageDelta: number;
        averageReplay: number;
        lastRollback: number | null;
    };
    /**
     * Get mismatch rate
     */
    getMismatchRate(): number;
    /**
     * Reset rollback state
     */
    reset(): void;
    /**
     * Check if recently rolled back
     */
    hasRecentRollback(withinMs?: number): boolean;
}
/**
 * Desync detector
 */
export declare class DesyncDetector {
    private checksumHistory;
    private maxHistory;
    /**
     * Calculate state checksum
     */
    calculateChecksum(state: GameState): number;
    /**
     * Record checksum
     */
    record(frame: number, state: GameState): void;
    /**
     * Verify checksum against server
     */
    verify(frame: number, serverChecksum: number): boolean;
    /**
     * Get checksum for frame
     */
    getChecksum(frame: number): number | null;
    /**
     * Clear history
     */
    clear(): void;
}
//# sourceMappingURL=rollback.d.ts.map