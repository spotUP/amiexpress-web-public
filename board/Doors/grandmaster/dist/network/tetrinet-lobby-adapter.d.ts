/**
 * TetriNET lobby adapter (BBS-internal multiplayer)
 *
 * Rewritten 2026-08-25. The previous version kept its own private lobby
 * state and pushed every action through `network.emitNetwork('tetrinet:*')`,
 * which goes to the NetworkEngine's local EventEmitter and never leaves the
 * process - it then listened for those same events coming back. Nothing
 * crossed a node boundary, so two BBS users each sat in their own private
 * lobby and a "multiplayer" match was always one human plus bots.
 *
 * It now extends BrokerLobbyAdapter - the same broker plumbing Grandmaster's
 * versus lobby uses (players, ready, chat, host-only start, bot fill) - and
 * adds only what TetriNET needs on top: six numbered slots, teams, the game
 * options editor and the winlist. Team and settings changes travel over the
 * broker's game channel so every node's lobby agrees.
 */
import type { LobbyLeaderboardEntry, LobbyState } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { BrokerLobbyAdapter } from './broker-lobby-adapter';
import type { GrandmasterNetworkManager } from './network-manager';
import type { TetriNetGameOptions, TetriNetRule } from '../core/tetrinet/game-rules';
/** Slot numbers a TetriNET lobby offers. */
export type PlayerSlot = 1 | 2 | 3 | 4 | 5 | 6;
export declare class TetriNetLobbyAdapter extends BrokerLobbyAdapter {
    private rule;
    private options;
    private winlist;
    private teams;
    private unsubscribeSync;
    constructor(network: GrandmasterNetworkManager, localPlayerId?: string, rule?: TetriNetRule);
    /** TetriNET seats six players. */
    protected lobbySize(): number | undefined;
    /** Rule set the lobby was opened with. */
    getRule(): TetriNetRule;
    /** Options the match should start with, after any host edits. */
    getGameOptions(): TetriNetGameOptions;
    /**
     * Seed the Winlist tab.
     *
     * The old adapter wrote state.winlist in exactly one place: the handler
     * for an external server's 'tetrinet:winlist' message, which nothing on
     * the in-process bus ever emits. Local lobbies showed an empty tab for
     * ever. app.ts now seeds it from the door's own TetriNET high scores.
     */
    setLocalWinlist(entries: LobbyLeaderboardEntry[]): void;
    /**
     * Kept for callers that announced the local player before the lobby
     * existed. The broker seats the local player itself when the lobby is
     * created or joined, so this only refreshes the widget.
     */
    addLocalPlayer(_name: string, _slot: PlayerSlot): void;
    getState(): LobbyState | null;
    setTeam(team: string): Promise<void>;
    updateSettings(settings: Record<string, unknown>): Promise<void>;
    dispose(): void;
    /** Slot numbers and team names are TetriNET's, not the broker's. */
    private decorate;
    private applySync;
}
//# sourceMappingURL=tetrinet-lobby-adapter.d.ts.map