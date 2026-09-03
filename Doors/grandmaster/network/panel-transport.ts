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
