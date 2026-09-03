"use strict";
/**
 * What a TETRIS ATTACK match needs from the wire.
 *
 * Almost nothing, and that is the point. Panel de Pon netplay is LOCKSTEP ON
 * INPUTS: each side simulates BOTH boards and only one input character per
 * frame per player ever crosses. No board state, no garbage packets, no
 * position updates - the engine is deterministic, so given the same seed and
 * the same inputs both machines arrive at the same game.
 *
 * That is why the bit-exact PRNG matters twice over. It was needed for replays;
 * it is needed again here, because a single divergent panel means the two
 * players are playing different games and neither will notice until the garbage
 * stops adding up.
 *
 * Compare TetriNET's transport in this same directory, which has to ship
 * fields, specials, garbage and pause because its engine is not deterministic.
 * This one carries a seed at the start and then a stream of characters.
 *
 * WHAT CAN GO WRONG. Nothing recovers a desync; upstream does not try. It
 * aborts a match when one side falls more than MAX_LAG frames behind, which is
 * the honest response - and on this board both players run on the same backend,
 * so the lag that rule exists for essentially cannot happen.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=panel-transport.js.map