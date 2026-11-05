/**
 * TetriNET 1.x External Server Client
 *
 * Connects to external TetriNET servers on port 31457 (or 31458 for TSpec).
 * Implements the TetriNET protocol with XOR-encrypted login.
 */
import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { type PlayerSlot, type TetriFastMode } from './tetrinet-protocol';
import type { SpecialType } from '../core/tetrinet/specials';
/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'playing' | 'error';
/**
 * Player info from external server
 */
export interface ExternalPlayer {
    slot: PlayerSlot;
    name: string;
    team: string;
    alive: boolean;
    level: number;
}
/**
 * Client options
 */
export interface TetriNetClientOptions {
    /** Server hostname */
    host: string;
    /** Server port (default 31457, or 31458 for TSpec) */
    port?: number;
    /** Player nickname */
    nickname: string;
    /** Team name (optional) */
    team?: string;
    /** Connection mode */
    mode?: TetriFastMode;
    /** TSpec password/token (used only for mode 'tspec') */
    password?: string;
    /** Connection timeout in ms */
    timeout?: number;
}
/**
 * TetriNET 1.x Client
 *
 * Events:
 * - 'connected': Successfully connected and assigned slot
 * - 'disconnected': Connection closed
 * - 'error': Connection or protocol error
 * - 'player:joined': Player joined the room
 * - 'player:left': Player left the room
 * - 'player:team': Player changed team
 * - 'chat': Chat message received
 * - 'game:start': Game starting
 * - 'game:end': Game ended
 * - 'field:update': Field update received
 * - 'special:used': Special was used
 * - 'player:lost': Player topped out
 * - 'player:won': Player won the game
 * - 'level:update': Level update received
 * - 'winlist': Winlist update
 * - 'spectator:list': Spectator list update
 * - 'spectator:joined': Spectator joined
 * - 'spectator:left': Spectator left
 * - 'spectator:chat': Spectator chat
 */
export declare class TetriNetClient extends EventEmitter {
    private socket;
    private options;
    private state;
    private mySlot;
    private players;
    private spectators;
    private buffer;
    private serverIp;
    private eventBacklog;
    constructor(options: TetriNetClientOptions);
    /**
     * Get current connection state
     */
    getState(): ConnectionState;
    /**
     * Get assigned slot
     */
    getSlot(): PlayerSlot | null;
    /**
     * Get all players
     */
    getPlayers(): ExternalPlayer[];
    /**
     * Get spectator list
     */
    getSpectators(): string[];
    /**
     * Replay buffered events (used when listeners attach after connect).
     */
    drainBacklog(): void;
    private emitEvent;
    /**
     * Get player by slot
     */
    getPlayer(slot: PlayerSlot): ExternalPlayer | undefined;
    private getServerIp;
    /**
     * Connect to server
     */
    connect(): Promise<void>;
    /**
     * Disconnect from server
     */
    disconnect(): void;
    /**
     * Send field update
     */
    sendField(field: string): void;
    /**
     * Send special usage
     */
    sendSpecial(target: PlayerSlot, special: SpecialType): void;
    /**
     * Send level update
     */
    sendLevel(level: number): void;
    /**
     * Send chat message
     */
    sendChat(message: string): void;
    /**
     * Send version string
     */
    sendVersion(version: string): void;
    /**
     * Send start/stop game (operator only).
     */
    sendStartGame(start: boolean): void;
    /**
     * Send pause/resume (operator only).
     */
    sendPause(pause: boolean): void;
    /**
     * Send /me action
     */
    sendAction(action: string): void;
    /**
     * Set team
     */
    setTeam(team: string): void;
    /**
     * Report player lost (topped out)
     */
    sendPlayerLost(): void;
    /**
     * Send raw line (for testing)
     */
    sendRaw(line: string): void;
    private sendLogin;
    private send;
    private handleData;
    private handleMessage;
    private handleClose;
}
/**
 * Create a TetriNET client
 */
export declare function createTetriNetClient(options: TetriNetClientOptions): TetriNetClient;
//# sourceMappingURL=tetrinet-client.d.ts.map