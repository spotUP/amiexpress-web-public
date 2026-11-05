"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=tetrinet-transport.js.map