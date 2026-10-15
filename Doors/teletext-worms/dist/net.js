"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WormsNet = exports.HELLO_EVENT = exports.INPUT_EVENT = exports.STATE_EVENT = void 0;
/**
 * Two callers, one match, over the board's in-process lobby broker.
 *
 * Every TypeScript door runs inside the backend process, so two callers in
 * this door are two objects in one Node process - which is exactly what
 * LobbyBroker coordinates, and what GRANDMASTER's versus mode already uses.
 *
 * THE EVENT NAMES MUST START WITH `game:`. The broker client only forwards
 * events in its protocol namespaces (lobby:, game:, match:, state:,
 * input:); anything else stays a local EventEmitter event that never leaves
 * the process. A packet sent under the wrong prefix does not error - it
 * silently fails to arrive, which looks exactly like a desync.
 *
 * The host owns the match and sends the guest a picture of it. Nothing is
 * simulated twice, so there is no way for two sides to disagree about
 * floating point.
 */
const network_engine_1 = require("@amiexpress/bbs-door-sdk/engines/network/network-engine");
exports.STATE_EVENT = 'game:worms_state';
exports.INPUT_EVENT = 'game:worms_input';
exports.HELLO_EVENT = 'game:worms_hello';
class WormsNet {
    constructor(session) {
        this.lobbyId = null;
        this.unsubscribers = [];
        // A player is a SESSION, not an account: two browser windows of one
        // account are two seats, and keying on the user id alone makes them one
        // player who can never find an opponent.
        const nodeId = session.bbsSession?.nodeNumber ?? session.bbsSession?.nodeId ?? session.nodeId ?? 1;
        this.playerId = session.user?.id
            ? `${session.user.id}@${nodeId}`
            : `player-${nodeId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        this.playerName = session.user?.username || `Node ${nodeId}`;
        this.network = new network_engine_1.NetworkEngine();
        this.network.connectBroker({
            playerId: hashToNumber(this.playerId),
            playerName: this.playerName,
            nodeId,
        });
    }
    /** Matches waiting for an opponent. */
    async open() {
        const lobbies = await this.network.lobby.listLobbies({ gameMode: 'worms' });
        return (lobbies ?? []).map((lobby) => ({
            id: lobby.id,
            name: lobby.name,
            players: lobby.players?.length ?? 1,
            maxPlayers: lobby.maxPlayers ?? 2,
        }));
    }
    async host() {
        const lobby = await this.network.createLobby({
            name: `${this.playerName} - worms`,
            gameMode: 'worms',
            maxPlayers: 2,
        });
        this.lobbyId = lobby?.id ?? '';
        return this.lobbyId;
    }
    async join(lobbyId) {
        await this.network.joinLobby(lobbyId);
        this.lobbyId = lobbyId;
    }
    /** Send a packet to everyone else in the lobby. */
    send(event, payload) {
        this.network.connection.getSocket()?.emit(event, payload);
    }
    /** Listen for a packet. Returns the unsubscribe. */
    on(event, handler) {
        const socket = this.network.connection.getSocket();
        if (!socket)
            return () => { };
        socket.on(event, handler);
        const off = () => socket.off?.(event, handler);
        this.unsubscribers.push(off);
        return off;
    }
    /** Someone joined or left the lobby this player is in. */
    onLobbyChange(handler) {
        const lobby = this.network.lobby;
        const events = ['player:joined', 'player:left', 'lobby:updated'];
        for (const event of events)
            lobby.on?.(event, handler);
        const off = () => {
            for (const event of events)
                lobby.off?.(event, handler);
        };
        this.unsubscribers.push(off);
        return off;
    }
    dispose() {
        for (const off of this.unsubscribers) {
            try {
                off();
            }
            catch {
                // A transport already torn down is not an error worth surfacing.
            }
        }
        this.unsubscribers.length = 0;
        try {
            this.network.disconnect();
        }
        catch {
            // Same.
        }
        this.lobbyId = null;
    }
    get lobby() {
        return this.lobbyId;
    }
}
exports.WormsNet = WormsNet;
function hashToNumber(value) {
    let hash = 0;
    for (let at = 0; at < value.length; at++) {
        hash = (hash << 5) - hash + value.charCodeAt(at);
        hash |= 0;
    }
    return Math.abs(hash);
}
//# sourceMappingURL=net.js.map