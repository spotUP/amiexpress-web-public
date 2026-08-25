/**
 * Network Manager
 *
 * Wraps SDK NetworkEngine for GRANDMASTER multiplayer
 * Includes state sync, client prediction, and rollback netcode
 */
import { EventEmitter } from 'events';
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
    playerName?: string;
    /** false = this player topped out; receivers drop them from the tracker. */
    alive?: boolean;
    /** Absolute cells of the falling piece, so opponents see it in flight. */
    pieceCells?: Array<{
        x: number;
        y: number;
        type: string;
    }>;
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
export declare class GrandmasterNetworkManager extends EventEmitter {
    private network;
    private matchState;
    private localPlayerId;
    private localPlayerName;
    private localPlayerNumericId;
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
     * Generate a stable numeric hash from a string ID
     */
    private hashStringToNumber;
    /**
     * Setup network event listeners
     * Hooks into SDK lobby system events to keep matchState in sync
     */
    private setupEventListeners;
    /**
     * Sync matchState from SDK lobby.current
     * Translates LobbyPlayer (numeric ID) to PlayerInfo (string ID)
     */
    private syncMatchStateFromLobby;
    /**
     * Join matchmaking queue
     * Uses atomic broker matchmaking to find or create a lobby
     */
    joinQueue(mode: MultiplayerMode, maxPlayers?: number): Promise<void>;
    /**
     * Leave matchmaking queue
     */
    leaveQueue(): Promise<void>;
    /**
     * Create custom lobby via SDK broker
     */
    createLobby(mode: MultiplayerMode, isPrivate?: boolean, maxPlayers?: number): Promise<string>;
    /**
     * Join lobby by ID
     */
    joinLobby(lobbyId: string): Promise<void>;
    /**
     * Join a lobby to WATCH it.
     *
     * A spectator takes no seat, so a full table does not shut them out, and
     * they may arrive mid-game - which is the only time watching is
     * interesting. They still receive every game event broadcast to the
     * lobby, which is what the spectator screen renders.
     */
    spectateLobby(lobbyId: string): Promise<void>;
    /**
     * Leave current lobby
     */
    leaveLobby(): Promise<void>;
    /**
     * List available lobbies
     */
    listLobbies(options?: {
        includeInProgress?: boolean;
    }): Promise<Array<{
        id: string;
        name: string;
        players: number;
        maxPlayers: number;
        mode: string;
        state: string;
        playerNames: string[];
    }>>;
    /**
     * Set ready status in lobby
     */
    setReady(ready: boolean): Promise<void>;
    /**
     * Start match (host only)
     * Uses SDK lobby system's countdown mechanism
     */
    startMatch(): Promise<void>;
    /**
     * Send game state update
     */
    sendUpdate(gameState: GameState, alive?: boolean, pieceCells?: Array<{
        x: number;
        y: number;
        type: string;
    }>): void;
    /** Send a lobby chat message via the broker. */
    sendLobbyChat(message: string): void;
    /**
     * Send attack to opponent(s)
     */
    sendAttack(attack: AttackPacket): void;
    /**
     * Send a custom game-channel event to the other members of the lobby.
     *
     * The broker's default case broadcasts any unrecognised event to the
     * lobby (excluding the sender), which is how TetriNET's specials and
     * garbage travel. Two constraints, both of which silently drop packets:
     * the event name MUST start with one of the broker client's protocol
     * namespaces (lobby:, game:, match:, state:, input:) or it never leaves
     * this process, and emitNetwork() cannot be used at all - it goes through
     * the NetworkEngine EventEmitter, which is local-only.
     */
    sendGameEvent(event: string, payload: unknown): void;
    /** Subscribe to a custom game-channel event from other lobby members. */
    onGameEvent(event: string, callback: (payload: any) => void): () => void;
    /** Local player's id, as used in game:update/game:attack packets. */
    getLocalPlayerId(): string | null;
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
     * Subscribe to network engine events (forwarded, not local)
     */
    onNetwork(event: string, callback: (...args: any[]) => void): void;
    /**
     * Emit to network engine (forwarded to broker)
     */
    emitNetwork(event: string, ...args: any[]): void;
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