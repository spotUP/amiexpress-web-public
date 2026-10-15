"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoloBroadcast = exports.SOLO_BROADCAST_INTERVAL_MS = void 0;
/** How often a watched game publishes its board, in milliseconds. */
exports.SOLO_BROADCAST_INTERVAL_MS = 250;
class SoloBroadcast {
    constructor(options) {
        this.timer = null;
        this.lobbyId = null;
        this.options = options;
    }
    /** The lobby this game was published as, once start() has succeeded. */
    getLobbyId() {
        return this.lobbyId;
    }
    /**
     * Register the game and begin publishing.
     *
     * ONE seat: a solo game is not something anyone can join, only watch, and
     * a spectator takes no seat (spectateLobby passes `spectator: true`), so a
     * full table does not shut watchers out.
     */
    async start() {
        const { network, mode } = this.options;
        try {
            this.lobbyId = await network.createLobby(mode, false, 1);
        }
        catch (error) {
            console.error('[GRANDMASTER] Could not publish this game for watching:', error);
            return false;
        }
        // Mark it as under way so it lists as "playing" rather than sitting in
        // the joinable list, where it would invite people into a game of one.
        try {
            await network.startMatch();
        }
        catch (error) {
            // Not fatal: an unstarted lobby is still listed to watchers, because
            // showSpectate asks for lobbies includeInProgress.
            console.error('[GRANDMASTER] Published, but could not mark the game started:', error);
        }
        this.publish();
        this.timer = setInterval(() => this.publish(), this.options.intervalMs ?? exports.SOLO_BROADCAST_INTERVAL_MS);
        return true;
    }
    /** Push one frame of the board to anybody watching. */
    publish() {
        if (!this.lobbyId)
            return;
        let state;
        try {
            state = this.options.getState();
        }
        catch {
            return;
        }
        if (!state || !state.board)
            return;
        try {
            this.options.network.sendUpdate(state, !state.gameOver);
        }
        catch (error) {
            console.error('[GRANDMASTER] Could not publish a board update:', error);
        }
    }
    /** Stop publishing and take the game out of the watch list. */
    async stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (!this.lobbyId)
            return;
        this.lobbyId = null;
        try {
            await this.options.network.leaveLobby();
        }
        catch (error) {
            console.error('[GRANDMASTER] Could not leave the watch lobby:', error);
        }
    }
}
exports.SoloBroadcast = SoloBroadcast;
//# sourceMappingURL=solo-broadcast.js.map