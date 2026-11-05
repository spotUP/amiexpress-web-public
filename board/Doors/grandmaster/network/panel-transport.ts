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

import type { LevelData } from '../core/panels/level-data';

/** Everything needed to start the same game on both sides. */
export interface PanelMatchSetup {
  /** The panel generator's seed. Both boards are built from it. */
  seed: number;
  /** The level both players are on. */
  levelData: LevelData;
  /** Which engine's physics to run; both sides must agree. */
  engineVersion: string;
  /** Cursor auto-repeat, so a replay of this match reproduces it. */
  cursorWaitTime: number;
  /** Who is in the match, in board order. */
  playerIds: string[];
}

/** One frame of one player's input. */
export interface PanelInputPacket {
  /** Who pressed it. */
  from: string;
  /**
   * One or more input characters, oldest first. Usually one; a short burst
   * after a hiccup is legal and is appended in order.
   */
  input: string;
  /** The frame the FIRST character belongs to, for ordering checks. */
  frame: number;
}

/** A player leaving, losing, or the match being abandoned. */
export interface PanelMatchEndPacket {
  from: string;
  reason: 'toppedOut' | 'quit' | 'desync';
  /** The frame it happened on. */
  frame: number;
}

export interface PanelTransport {
  /** The id this node's own player is known by. */
  localId(): string;

  /** Publish this frame's input. */
  sendInput(packet: PanelInputPacket): void;
  /** Inputs from everyone else. Never the local player's own. */
  onInput(listener: (packet: PanelInputPacket) => void): () => void;

  /** Publish the agreed match parameters. Host only. */
  sendSetup?(setup: PanelMatchSetup): void;
  onSetup?(listener: (setup: PanelMatchSetup) => void): () => void;

  sendMatchEnd?(packet: PanelMatchEndPacket): void;
  onMatchEnd?(listener: (packet: PanelMatchEndPacket) => void): () => void;
}

/**
 * The match parameters, derived rather than negotiated.
 *
 * Both machines need the same seed and the same board ORDER, and the obvious
 * way to get there is for a host to send them. That is a handshake, and a
 * handshake is a race: a guest that starts a frame before the setup arrives
 * builds a different board and the match is lost before it begins.
 *
 * So nothing is sent. Both sides already know the match id and who is in it,
 * and that is enough: the seed is a hash of the id, and the board order is the
 * player ids sorted. Two machines running this function on the same match
 * cannot disagree, because there is nothing for them to disagree about.
 */
export function panelMatchSetupFor(
  matchId: string,
  playerIds: string[],
  levelData: LevelData,
  engineVersion: string,
  cursorWaitTime = 20,
): PanelMatchSetup {
  return {
    seed: seedFromMatchId(matchId),
    levelData,
    engineVersion,
    cursorWaitTime,
    // Sorted, so "who is board one" is a fact about the match rather than
    // about which machine is asking.
    playerIds: [...playerIds].sort(),
  };
}

/**
 * A match id turned into a seed the panel generator will accept.
 *
 * FNV-1a, because it is four lines and has no dependencies; the generator's
 * own PRNG does the work of making the board unpredictable, so all this has to
 * do is spread ids apart. Kept inside the engine's seed range, and never zero -
 * a zero seed is a legal number that produces a suspiciously regular board.
 */
export function seedFromMatchId(matchId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < matchId.length; i++) {
    hash ^= matchId.charCodeAt(i);
    // The FNV prime, by shifts, so this stays in 32 bits without BigInt.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7)
      + (hash << 8) + (hash << 24)) >>> 0;
  }
  return (hash % 2147483000) + 1;
}
