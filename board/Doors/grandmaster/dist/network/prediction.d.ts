/**
 * Client-Side Prediction
 *
 * Implements client-side prediction for responsive multiplayer:
 * - Input buffering with sequence numbers
 * - Speculative game state execution
 * - Server reconciliation preparation
 * - Input acknowledgment handling
 */
import type { GameState } from '../core/types';
import { GameEngine } from '../core/game';
/**
 * Player input types
 */
export type InputType = 'move_left' | 'move_right' | 'rotate_cw' | 'rotate_ccw' | 'soft_drop' | 'hard_drop' | 'hold';
/**
 * Predicted input
 */
export interface PredictedInput {
    id: number;
    type: InputType;
    timestamp: number;
    applied: boolean;
    confirmed: boolean;
}
/**
 * Prediction state snapshot
 */
export interface PredictionSnapshot {
    inputId: number;
    state: GameState;
    timestamp: number;
}
/**
 * Prediction configuration
 */
export interface PredictionConfig {
    maxBufferSize: number;
    snapshotInterval: number;
    maxPredictionTime: number;
    inputDelay: number;
}
/**
 * Client-side prediction manager
 */
export declare class PredictionManager {
    private config;
    private inputBuffer;
    private snapshots;
    private nextInputId;
    private engine;
    private lastSnapshotFrame;
    private frameCounter;
    constructor(engine: GameEngine, config?: Partial<PredictionConfig>);
    /**
     * Add input to buffer
     */
    addInput(type: InputType, timestamp: number): number;
    /**
     * Process pending inputs (apply to local state)
     */
    processPendingInputs(currentTime: number): void;
    /**
     * Apply input to game state
     */
    private applyInput;
    /**
     * Handle input acknowledgment from server
     */
    onInputAck(inputId: number, serverFrame: number): void;
    /**
     * Create state snapshot
     */
    createSnapshot(): void;
    /**
     * Get snapshot for rollback
     */
    getSnapshot(inputId: number): PredictionSnapshot | null;
    /**
     * Get last applied input
     */
    private getLastAppliedInput;
    /**
     * Get unconfirmed inputs (for rollback)
     */
    getUnconfirmedInputs(): PredictedInput[];
    /**
     * Get pending inputs (not yet applied)
     */
    getPendingInputs(): PredictedInput[];
    /**
     * Get input by ID
     */
    getInput(inputId: number): PredictedInput | null;
    /**
     * Clear old snapshots
     */
    cleanupSnapshots(olderThan: number): void;
    /**
     * Clone game state (deep copy)
     */
    private cloneState;
    /**
     * Get prediction stats
     */
    getStats(): {
        bufferedInputs: number;
        confirmedInputs: number;
        pendingInputs: number;
        snapshotCount: number;
        oldestSnapshot: number | null;
    };
    /**
     * Reset prediction state
     */
    reset(): void;
    /**
     * Get current input ID
     */
    getCurrentInputId(): number;
}
/**
 * Input encoder for network transmission
 */
export declare class InputEncoder {
    /**
     * Encode input for network
     */
    static encode(input: PredictedInput): string;
    /**
     * Decode input from network
     */
    static decode(encoded: string): PredictedInput | null;
    /**
     * Encode multiple inputs
     */
    static encodeMultiple(inputs: PredictedInput[]): string;
    /**
     * Decode multiple inputs
     */
    static decodeMultiple(encoded: string): PredictedInput[];
}
/**
 * Input replay for rollback
 */
export declare class InputReplayer {
    /**
     * Replay inputs on engine
     */
    static replay(engine: GameEngine, inputs: PredictedInput[]): void;
    /**
     * Apply single input to engine
     */
    private static applyInput;
    /**
     * Replay inputs starting from a state
     */
    static replayFromState(engine: GameEngine, state: GameState, inputs: PredictedInput[]): void;
}
//# sourceMappingURL=prediction.d.ts.map