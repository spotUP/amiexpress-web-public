/**
 * TetriNET transport
 *
 * The one interface TetriNetScreen talks to when a game is networked. Two
 * implementations exist and they must stay interchangeable:
 *
 * - `TetriNetExternalAdapter` - a real TetriNET server over the wire
 *   protocol. It routes specials itself, so it implements only the field
 *   half of this interface.
 * - `TetriNetBrokerTransport` - BBS-internal multiplayer over the
 *   in-process lobby broker. It carries fields, specials and garbage,
 *   because there is no server in the middle to do it.
 *
 * The screen feature-detects the special/garbage half rather than assuming
 * it: sending specials over the broker in an external game would duplicate
 * every hit the server already delivered.
 */
import type { TetriNetBoard } from '../core/tetrinet/tetrinet-board';
import type { TetriNetGameState } from '../core/tetrinet/tetrinet-engine';
import type { SpecialType } from '../core/tetrinet/specials';
/** One participant's visible state: a human on another node, or a host bot. */
export interface TetriNetFieldUpdate {
    playerId: string;
    /** Display name. Falls back to playerId when the transport has no name. */
    name?: string;
    board: TetriNetBoard;
    level: number;
    alive: boolean;
    hasImmunity: boolean;
}
/** A special aimed at one participant. */
export interface TetriNetSpecialPacket {
    from: string;
    fromName: string;
    to: string;
    special: SpecialType;
    /** Sender's board - only Switch Fields needs it. */
    sourceBoard?: TetriNetBoard;
    /**
     * Set on the second half of a Switch Fields exchange. Switch is a SWAP,
     * so the receiver sends its own pre-swap board back; the flag stops that
     * reply from being answered in turn and bouncing for ever.
     */
    reply?: boolean;
}
/** Classic-rules garbage. `to: null` means every other participant. */
export interface TetriNetGarbagePacket {
    from: string;
    fromName: string;
    to: string | null;
    lines: number;
}
export type TetriNetUpdateListener = (update: TetriNetFieldUpdate) => void;
export interface TetriNetTransport {
    /** Field updates from everyone else. */
    onUpdate(listener: TetriNetUpdateListener): () => void;
    /** Publish the local player's field. */
    sendUpdate(state: TetriNetGameState): void;
    /** Id this node's human player is known by. Absent on the external path. */
    localId?(): string;
    /** Publish a field the local node OWNS but does not play - a host's bots. */
    sendField?(update: TetriNetFieldUpdate): void;
    sendSpecial?(packet: TetriNetSpecialPacket): void;
    onSpecial?(listener: (packet: TetriNetSpecialPacket) => void): () => void;
    sendGarbage?(packet: TetriNetGarbagePacket): void;
    onGarbage?(listener: (packet: TetriNetGarbagePacket) => void): () => void;
}
//# sourceMappingURL=tetrinet-transport.d.ts.map