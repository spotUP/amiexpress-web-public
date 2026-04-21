/**
 * TetriNET Lobby Adapter
 *
 * Implements LobbyNetworkAdapter for TetriNET games.
 * Supports both BBS-local and external TetriNET server connections.
 */
import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { LobbyNetworkAdapter, LobbyState } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GrandmasterNetworkManager } from './network-manager';
/**
 * TetriNET player slot (1-6)
 */
export type PlayerSlot = 1 | 2 | 3 | 4 | 5 | 6;
/**
 * TetriNET Lobby Adapter
 */
export declare class TetriNetLobbyAdapter extends EventEmitter implements LobbyNetworkAdapter {
    private network;
    private state;
    private messageIdCounter;
    private pendingLocalPlayer;
    constructor(network: GrandmasterNetworkManager);
    /**
     * Setup network event forwarding
     */
    private setupEventListeners;
    /**
     * Convert TetriNET player to lobby player info
     */
    private convertPlayer;
    /**
     * Fill empty slots with bots up to minimum player count
     * @param difficulty Bot difficulty level (0-3)
     */
    fillWithBots(difficulty?: number): Promise<void>;
    /**
     * Get current lobby state
     */
    getState(): LobbyState | null;
    /**
     * Join matchmaking queue (creates BBS-local game)
     */
    joinQueue(mode: string): Promise<void>;
    /**
     * Create a new lobby (BBS-local TetriNET game)
     */
    createLobby(mode: string, _isPrivate?: boolean): Promise<string>;
    /**
     * Join existing lobby
     */
    joinLobby(lobbyId: string): Promise<void>;
    /**
     * Leave lobby
     */
    leaveLobby(): Promise<void>;
    /**
     * Set ready state
     */
    setReady(ready: boolean): Promise<void>;
    /**
     * Start match (host only)
     */
    startMatch(): Promise<void>;
    /**
     * Send chat message
     */
    sendChat(message: string, isAction?: boolean): void;
    /**
     * Set team
     */
    setTeam(team: string): Promise<void>;
    /**
     * Update game settings (host only)
     */
    updateSettings(settings: Record<string, unknown>): Promise<void>;
    /**
     * Get default game options for a mode
     */
    private getDefaultOptions;
    /**
     * Add local player to lobby (called after connection established)
     */
    addLocalPlayer(name: string, slot: PlayerSlot): void;
}
//# sourceMappingURL=tetrinet-lobby-adapter.d.ts.map