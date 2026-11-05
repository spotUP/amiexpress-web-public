/**
 * Broker-backed lobby adapter
 *
 * Wraps GrandmasterNetworkManager for the SDK MultiplayerLobby widget. Lives
 * here rather than inside lobby-screen.ts because TetriNET's internal
 * multiplayer lobby needs exactly this plumbing - broker forwarding, chat,
 * ready, host-only start, bot fill - and only differs in the slot/team/
 * settings/winlist decoration it adds on top.
 */
import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { LobbyNetworkAdapter, LobbyPlayerInfo, LobbyState } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GrandmasterNetworkManager, PlayerInfo } from './network-manager';
import { type BotDifficulty } from './bot-lobby';
/**
 * Adapter that wraps GrandmasterNetworkManager for the SDK MultiplayerLobby
 */
export declare class BrokerLobbyAdapter extends EventEmitter implements LobbyNetworkAdapter {
    protected network: GrandmasterNetworkManager;
    protected botDifficulty: BotDifficulty;
    protected localPlayerId: string;
    /** Monotonic id source for locally-originated chat messages. */
    private chatSeq;
    constructor(network: GrandmasterNetworkManager, localPlayerId: string);
    /**
     * Handlers registered on the SHARED GrandmasterNetworkManager, kept so
     * dispose() can take them off again. A new adapter is built every time the
     * lobby is entered (app.ts loops back to it after each match), so without
     * this they piled up on the same emitter: every event then also ran the
     * handlers of long-dead adapters, and a throw from one - touching widgets
     * that were already destroyed - aborts the emit before the LIVE adapter's
     * handler gets to run.
     */
    private forwarded;
    protected setupEventForwarding(): void;
    /**
     * Detach from the shared network manager. Call when the lobby closes.
     */
    dispose(): void;
    protected convertPlayer(player: PlayerInfo): LobbyPlayerInfo;
    getState(): LobbyState | null;
    /** Seats in this game's lobby. Undefined uses the versus mode map. */
    protected lobbySize(): number | undefined;
    joinQueue(mode: string): Promise<void>;
    createLobby(mode: string, isPrivate?: boolean): Promise<string>;
    joinLobby(lobbyId: string): Promise<void>;
    leaveLobby(): Promise<void>;
    setReady(ready: boolean): Promise<void>;
    startMatch(): Promise<void>;
    /**
     * Fill lobby with bots to meet a target player count.
     *
     * Argument order follows the SDK's LobbyNetworkAdapter.fillWithBots
     * contract - (count, difficulty). It previously took (difficulty) alone,
     * so the SDK's Bots button, which correctly passes (count, difficulty),
     * handed the player count in as the difficulty.
     *
     * @param count Target number of players (defaults to the mode's minimum)
     * @param difficulty Bot difficulty level (1-10)
     */
    fillWithBots(count?: number, difficulty?: number): Promise<void>;
    removeBots(): void;
    sendChat(message: string, isAction?: boolean): void;
}
//# sourceMappingURL=broker-lobby-adapter.d.ts.map