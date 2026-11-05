/**
 * Publish a single-player game so other people can watch it.
 *
 * "Watch a game" listed lobbies, and a lobby was only ever created by the
 * versus lobby widget - so marathon, ultra, dig, zone, training, CPU battle
 * and TetriNET never appeared, and the menu answered "No games running right
 * now" however many people were playing. Reported 2026-08-30, reproduced with
 * two browsers.
 *
 * The fix is to register the solo game the same way a versus match registers
 * itself: a lobby with ONE seat, so nobody can join as a player, and a stream
 * of board updates for spectators to render. The spectator screen already
 * renders `game:update`; nothing about watching had to change.
 *
 * Everything here is best-effort. A board with no broker, or a broker that
 * refuses, must never stop somebody playing a single-player game - so every
 * call is guarded and failure is logged, not thrown.
 */
import type { GrandmasterNetworkManager } from './network-manager';
/** How often a watched game publishes its board, in milliseconds. */
export declare const SOLO_BROADCAST_INTERVAL_MS = 250;
export interface SoloBroadcastOptions {
    network: GrandmasterNetworkManager;
    /** The game mode, shown in the watch list. */
    mode: string;
    /** Reads the live game state; returns null once the game is gone. */
    getState: () => {
        board?: unknown;
        level?: number;
        score?: number;
        gameOver?: boolean;
    } | null;
    /** Test seam. Defaults to the real timer. */
    intervalMs?: number;
}
export declare class SoloBroadcast {
    private readonly options;
    private timer;
    private lobbyId;
    constructor(options: SoloBroadcastOptions);
    /** The lobby this game was published as, once start() has succeeded. */
    getLobbyId(): string | null;
    /**
     * Register the game and begin publishing.
     *
     * ONE seat: a solo game is not something anyone can join, only watch, and
     * a spectator takes no seat (spectateLobby passes `spectator: true`), so a
     * full table does not shut watchers out.
     */
    start(): Promise<boolean>;
    /** Push one frame of the board to anybody watching. */
    publish(): void;
    /** Stop publishing and take the game out of the watch list. */
    stop(): Promise<void>;
}
//# sourceMappingURL=solo-broadcast.d.ts.map