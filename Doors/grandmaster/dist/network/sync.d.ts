/**
 * State Synchronization
 *
 * Server-authoritative state sync for multiplayer
 * - 10 FPS sync rate
 * - Delta compression
 * - Interpolation support
 */
import type { GameState } from '../core/types';
/**
 * Sync packet types
 */
export type SyncPacketType = 'full_state' | 'delta_state' | 'input_ack';
/**
 * Full state snapshot
 */
export interface FullStatePacket {
    type: 'full_state';
    frame: number;
    timestamp: number;
    state: GameState;
}
/**
 * Delta state update (only changed fields)
 */
export interface DeltaStatePacket {
    type: 'delta_state';
    frame: number;
    timestamp: number;
    delta: Partial<GameState>;
}
/**
 * Input acknowledgment
 */
export interface InputAckPacket {
    type: 'input_ack';
    inputId: number;
    serverFrame: number;
}
export type SyncPacket = FullStatePacket | DeltaStatePacket | InputAckPacket;
/**
 * Sync configuration
 */
export interface SyncConfig {
    syncRate: number;
    fullStateInterval: number;
    interpolationDelay: number;
    maxDeltaSize: number;
}
/**
 * State synchronization manager
 */
export declare class StateSyncManager {
    private config;
    private lastSyncTime;
    private lastFullStateFrame;
    private previousState;
    private syncInterval;
    private frameCounter;
    constructor(config?: Partial<SyncConfig>);
    /**
     * Check if sync is needed
     */
    shouldSync(currentTime: number): boolean;
    /**
     * Create sync packet
     */
    createSyncPacket(state: GameState, currentTime: number): SyncPacket;
    /**
     * Create input acknowledgment
     */
    createInputAck(inputId: number): InputAckPacket;
    /**
     * Apply sync packet to local state
     */
    applySyncPacket(packet: SyncPacket, localState: GameState): GameState;
    /**
     * Create delta between two states
     */
    private createDelta;
    /**
     * Apply delta to state
     */
    private applyDelta;
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
     * Clone game state
     */
    private cloneState;
    /**
     * Get current frame
     */
    getFrame(): number;
    /**
     * Reset sync state
     */
    reset(): void;
}
/**
 * State interpolator for smooth rendering
 */
export declare class StateInterpolator {
    private stateBuffer;
    private interpolationDelay;
    constructor(interpolationDelay?: number);
    /**
     * Add state to buffer
     */
    addState(state: GameState, timestamp: number): void;
    /**
     * Get interpolated state
     */
    getInterpolatedState(currentTime: number): GameState | null;
    /**
     * Interpolate between two states
     */
    private interpolate;
    /**
     * Clear buffer
     */
    clear(): void;
}
//# sourceMappingURL=sync.d.ts.map