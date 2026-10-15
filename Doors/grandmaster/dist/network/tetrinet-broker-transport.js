"use strict";
/**
 * TetriNET transport over the BBS's in-process lobby broker.
 *
 * Internal TetriNET multiplayer had no transport at all: every lobby result
 * started a purely local game against three bots with no network passed, so
 * the other BBS users who joined the lobby were simply not in the match.
 * This is the missing wire - the same broker Grandmaster's versus mode
 * already uses (GrandmasterNetworkManager -> NetworkEngine -> LobbyBroker),
 * carrying the three things a TetriNET match needs: fields, specials and
 * classic garbage.
 *
 * The broker broadcasts unrecognised events to every other member of the
 * lobby, so no server-side support is needed for the TetriNET-specific
 * packets; addressing is done by the `to` field and filtered by receivers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetBrokerTransport = void 0;
// The broker client only forwards events in its protocol namespaces
// (lobby:, game:, match:, state:, input:) - anything else stays a local
// EventEmitter event and never reaches the other node. These are game
// events, so they live under game:.
const FIELD_EVENT = 'game:tnet_field';
const SPECIAL_EVENT = 'game:tnet_special';
const GARBAGE_EVENT = 'game:tnet_garbage';
const PAUSE_EVENT = 'game:tnet_pause';
class TetriNetBrokerTransport {
    constructor(network, playerName) {
        this.unsubscribers = [];
        this.network = network;
        this.playerId = network.getLocalPlayerId() ?? 'local';
        this.playerName = playerName;
    }
    localId() {
        return this.playerId;
    }
    onUpdate(listener) {
        return this.subscribe(FIELD_EVENT, (packet) => {
            if (packet.playerId === this.playerId)
                return; // never mirror ourselves
            listener(packet);
        });
    }
    sendUpdate(state) {
        this.sendField({
            playerId: this.playerId,
            name: this.playerName,
            board: state.board,
            level: state.level,
            alive: state.status !== 'gameover',
            hasImmunity: state.activeEffects?.includes('immunity') ?? false,
        });
    }
    /** Publish a field this node owns but does not play - the host's bots. */
    sendField(update) {
        this.network.sendGameEvent(FIELD_EVENT, update);
    }
    sendSpecial(packet) {
        this.network.sendGameEvent(SPECIAL_EVENT, packet);
    }
    onSpecial(listener) {
        return this.subscribe(SPECIAL_EVENT, listener);
    }
    sendGarbage(packet) {
        this.network.sendGameEvent(GARBAGE_EVENT, packet);
    }
    onGarbage(listener) {
        return this.subscribe(GARBAGE_EVENT, listener);
    }
    sendPause(packet) {
        this.network.sendGameEvent(PAUSE_EVENT, packet);
    }
    onPause(listener) {
        return this.subscribe(PAUSE_EVENT, listener);
    }
    /** Drop every broker subscription. Call when the match screen closes. */
    dispose() {
        for (const unsubscribe of this.unsubscribers)
            unsubscribe();
        this.unsubscribers = [];
    }
    subscribe(event, listener) {
        const unsubscribe = this.network.onGameEvent(event, listener);
        this.unsubscribers.push(unsubscribe);
        return () => {
            unsubscribe();
            const index = this.unsubscribers.indexOf(unsubscribe);
            if (index >= 0)
                this.unsubscribers.splice(index, 1);
        };
    }
}
exports.TetriNetBrokerTransport = TetriNetBrokerTransport;
//# sourceMappingURL=tetrinet-broker-transport.js.map