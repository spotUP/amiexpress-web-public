/**
 * Network Manager
 *
 * Wraps SDK NetworkEngine for GRANDMASTER multiplayer
 * Includes state sync, client prediction, and rollback netcode
 */
import type { GameState, Board } from '../core/types';
import type { OpponentState } from '../ui/minimap';
import { type InputType } from './prediction';
import type { GameEngine } from '../core/game';
/**
 * Multiplayer game mode
 */
export type MultiplayerMode = 'versus_1v1' | 'team_2v2' | 'battle_royale';
/**
 * Match state
 */
export interface MatchState {
    mode: MultiplayerMode;
    matchId: string;
    players: PlayerInfo[];
    status: 'waiting' | 'countdown' | 'playing' | 'finished';
    startTime: number | null;
    winner: string | null;
}
/**
 * Player info
 */
export interface PlayerInfo {
    id: string;
    name: string;
    rank: number;
    rating: number;
    ready: boolean;
    isBot?: boolean;
    botDifficulty?: number;
}
/**
 * Game update packet
 */
export interface GameUpdate {
    playerId: string;
    timestamp: number;
    board: Board;
    level: number;
    score: number;
    grade: string;
    combo: number;
    attacking: boolean;
}
/**
 * Attack packet
 */
export interface AttackPacket {
    from: string;
    to: string | null;
    lines: number;
    type: 'single' | 'double' | 'triple' | 'tetris' | 'tspin' | 'perfect_clear';
    combo: number;
    backToBack: boolean;
}
/**
 * Grandmaster Network Manager
 */
export declare class GrandmasterNetworkManager {
    private network;
    private matchState;
    private localPlayerId;
    private localPlayerName;
    private opponentStates;
    private updateCallbacks;
    private attackCallbacks;
    private syncManager;
    private predictionManager;
    private rollbackManager;
    private interpolator;
    private gameEngine;
    constructor(bbsSession: any);
    /**
     * Setup network event listeners
     */
    private setupEventListeners;
    /**
     * Join matchmaking queue
     */
    joinQueue(mode: MultiplayerMode): Promise<void>;
    /**
     * Leave matchmaking queue
     */
    leaveQueue(): Promise<void>;
    /**
     * Create custom lobby
     */
    createLobby(mode: MultiplayerMode, isPrivate?: boolean): Promise<string>;
    /**
     * Join lobby by ID
     */
    joinLobby(lobbyId: string): Promise<void>;
    /**
     * Set ready status in lobby
     */
    setReady(ready: boolean): Promise<void>;
    /**
     * Start match (host only)
     * Note: In a full implementation, this would be handled server-side
     */
    startMatch(): Promise<void>;
    /**
     * Send game state update
     */
    sendUpdate(gameState: GameState): void;
    /**
     * Send attack to opponent(s)
     */
    sendAttack(attack: AttackPacket): void;
    /**
     * Get current opponent states
     */
    getOpponents(): OpponentState[];
    /**
     * Subscribe to game updates
     */
    onUpdate(callback: (update: GameUpdate) => void): () => void;
    /**
     * Subscribe to attacks
     */
    onAttack(callback: (attack: AttackPacket) => void): () => void;
    /**
     * Get match state
     */
    getMatchState(): MatchState | null;
    /**
     * Subscribe to network events
     */
    on(event: string, callback: (...args: any[]) => void): void;
    /**
     * Emit network event
     */
    emit(event: string, ...args: any[]): void;
    /**
     * Enable competitive netcode (prediction + rollback)
     * Call this before starting a competitive match
     */
    enableNetcode(engine: GameEngine): void;
    /**
     * Disable netcode (back to simple state sync)
     */
    disableNetcode(): void;
    /**
     * Handle player input with prediction
     */
    handleInput(inputType: InputType, timestamp: number): void;
    /**
     * Process predictions (call every frame)
     */
    processPredictions(currentTime: number): void;
    /**
     * Handle sync packet from server
     */
    private handleSyncPacket;
    /**
     * Send state sync (server only)
     */
    sendStateSync(state: GameState, currentTime: number): void;
    /**
     * Get interpolated state for rendering
     */
    getInterpolatedState(currentTime: number): GameState | null;
    /**
     * Get netcode stats
     */
    getNetcodeStats(): {
        sync: any;
        prediction: any;
        rollback: any;
    } | null;
    /**
     * Is netcode enabled?
     */
    isNetcodeEnabled(): boolean;
    /**
     * Disconnect
     */
    disconnect(): void;
}
//# sourceMappingURL=network-manager.d.ts.map