/**
 * TetriNET Lobby Adapter
 *
 * Implements LobbyNetworkAdapter for TetriNET games.
 * Supports both BBS-local and external TetriNET server connections.
 */
import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { LobbyNetworkAdapter, LobbyState, LobbyLeaderboardEntry } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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
    private localWinlist;
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
     * Fill empty slots with bots up to a target player count.
     *
     * Signature follows the SDK's LobbyNetworkAdapter contract - (count,
     * difficulty). It previously took (difficulty) alone, so the lobby's Bots
     * button, which correctly passes (count, difficulty), handed the target
     * player count in as a difficulty level.
     *
     * @param count Target number of players (defaults to TetriNET's minimum)
     * @param difficulty Bot difficulty level (0-3)
     */
    fillWithBots(count?: number, difficulty?: number): Promise<void>;
    /**
     * Remove every bot from the lobby.
     *
     * Without this the lobby refused bot management entirely: its guard is
     * `!adapter.fillWithBots || !adapter.removeBots`, so having only half the
     * pair reported "Bot management not available" and no bots could be added
     * to a local TetriNET game at all.
     */
    removeBots(): void;
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
     * Seed the Winlist tab for BBS-local games.
     *
     * state.winlist is written in exactly one place - the handler for the
     * external server's 'tetrinet:winlist' message. Nothing emits that on the
     * in-process bus, so a local lobby advertised a Winlist tab that was
     * empty for ever. Local games fill it from the door's own TetriNET high
     * scores instead.
     */
    setLocalWinlist(entries: LobbyLeaderboardEntry[]): void;
    /**
     * Add local player to lobby (called after connection established)
     */
    addLocalPlayer(name: string, slot: PlayerSlot): void;
}
//# sourceMappingURL=tetrinet-lobby-adapter.d.ts.map