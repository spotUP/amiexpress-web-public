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
import type { GrandmasterNetworkManager } from './network-manager';
import type { PanelTransport, PanelInputPacket, PanelMatchSetup, PanelMatchEndPacket } from './panel-transport';
export declare class PanelBrokerTransport implements PanelTransport {
    private readonly network;
    private readonly playerId;
    private readonly unsubscribers;
    constructor(network: GrandmasterNetworkManager);
    localId(): string;
    sendInput(packet: PanelInputPacket): void;
    onInput(listener: (packet: PanelInputPacket) => void): () => void;
    sendSetup(setup: PanelMatchSetup): void;
    onSetup(listener: (setup: PanelMatchSetup) => void): () => void;
    sendMatchEnd(packet: PanelMatchEndPacket): void;
    onMatchEnd(listener: (packet: PanelMatchEndPacket) => void): () => void;
    /** Drop every subscription this transport made. */
    dispose(): void;
    private subscribe;
}
//# sourceMappingURL=panel-broker-transport.d.ts.map