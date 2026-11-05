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
import type { GrandmasterNetworkManager } from './network-manager';
import type { TetriNetGameState } from '../core/tetrinet/tetrinet-engine';
import type { TetriNetTransport, TetriNetFieldUpdate, TetriNetSpecialPacket, TetriNetGarbagePacket, TetriNetPausePacket, TetriNetUpdateListener } from './tetrinet-transport';
export declare class TetriNetBrokerTransport implements TetriNetTransport {
    private network;
    private playerId;
    private playerName;
    private unsubscribers;
    constructor(network: GrandmasterNetworkManager, playerName: string);
    localId(): string;
    onUpdate(listener: TetriNetUpdateListener): () => void;
    sendUpdate(state: TetriNetGameState): void;
    /** Publish a field this node owns but does not play - the host's bots. */
    sendField(update: TetriNetFieldUpdate): void;
    sendSpecial(packet: TetriNetSpecialPacket): void;
    onSpecial(listener: (packet: TetriNetSpecialPacket) => void): () => void;
    sendGarbage(packet: TetriNetGarbagePacket): void;
    onGarbage(listener: (packet: TetriNetGarbagePacket) => void): () => void;
    sendPause(packet: TetriNetPausePacket): void;
    onPause(listener: (packet: TetriNetPausePacket) => void): () => void;
    /** Drop every broker subscription. Call when the match screen closes. */
    dispose(): void;
    private subscribe;
}
//# sourceMappingURL=tetrinet-broker-transport.d.ts.map