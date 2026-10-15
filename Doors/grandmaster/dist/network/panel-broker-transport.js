"use strict";
/**
 * TETRIS ATTACK netplay over the BBS's in-process lobby broker.
 *
 * The same broker GRANDMASTER's versus mode and TETRINET already use
 * (GrandmasterNetworkManager -> NetworkEngine -> LobbyBroker), carrying the two
 * things a panel match needs: the setup at the start, then a character per
 * frame.
 *
 * THE EVENT NAMES MUST START WITH `game:`. The broker client only forwards
 * events in its protocol namespaces - lobby:, game:, match:, state:, input: -
 * and anything else stays a local EventEmitter event that never leaves the
 * process. A packet sent under the wrong prefix does not error; it silently
 * fails to arrive, which would look exactly like a desync.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelBrokerTransport = void 0;
const SETUP_EVENT = 'game:pa_setup';
const INPUT_EVENT = 'game:pa_input';
const END_EVENT = 'game:pa_end';
class PanelBrokerTransport {
    constructor(network) {
        this.unsubscribers = [];
        this.network = network;
        this.playerId = network.getLocalPlayerId() ?? 'local';
    }
    localId() {
        return this.playerId;
    }
    sendInput(packet) {
        this.network.sendGameEvent(INPUT_EVENT, packet);
    }
    onInput(listener) {
        return this.subscribe(INPUT_EVENT, (packet) => {
            // Never feed our own input back into our own stack: it is already there,
            // and replaying it would advance the local board twice per frame.
            if (packet.from === this.playerId)
                return;
            listener(packet);
        });
    }
    sendSetup(setup) {
        this.network.sendGameEvent(SETUP_EVENT, setup);
    }
    onSetup(listener) {
        return this.subscribe(SETUP_EVENT, listener);
    }
    sendMatchEnd(packet) {
        this.network.sendGameEvent(END_EVENT, packet);
    }
    onMatchEnd(listener) {
        return this.subscribe(END_EVENT, (packet) => {
            if (packet.from === this.playerId)
                return;
            listener(packet);
        });
    }
    /** Drop every subscription this transport made. */
    dispose() {
        for (const unsubscribe of this.unsubscribers)
            unsubscribe();
        this.unsubscribers.length = 0;
    }
    subscribe(event, handler) {
        const unsubscribe = this.network.onGameEvent(event, handler);
        this.unsubscribers.push(unsubscribe);
        return unsubscribe;
    }
}
exports.PanelBrokerTransport = PanelBrokerTransport;
//# sourceMappingURL=panel-broker-transport.js.map