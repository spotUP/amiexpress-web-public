/**
 * A two-player match over the wire.
 *
 * LOCKSTEP ON INPUTS. Each side simulates BOTH boards and only one input
 * character per frame per player ever crosses. No board state, no garbage
 * packets, no positions: the engine is deterministic, so the same seed and the
 * same inputs give both machines the same game. That is why the bit-exact PRNG
 * mattered twice - once for replays, and again here, because one divergent
 * panel means two people are playing different games and neither finds out
 * until the garbage stops adding up.
 *
 * THE RULE THAT MAKES IT WORK: a frame runs only when EVERY player's input for
 * it has arrived. A side that ran ahead on its own input would have to be
 * rolled back when the other's arrived, and rollback is the thing this design
 * exists to avoid. Waiting is a stutter; running ahead is a desync.
 *
 * Nothing recovers a desync and upstream does not try. A match aborts when one
 * side falls more than MAX_LAG frames behind, which on this board - where both
 * players run in the same backend process - essentially cannot happen, and is
 * kept because it is the honest failure for a real network path.
 */

import { Stack } from '../core/panels/stack';
import { PanelMatch } from '../core/panels/match';
import { GeneratorSource } from '../core/panels/generator-source';
import { MAX_LAG } from '../core/panels/consts';
import type {
  PanelTransport, PanelMatchSetup, PanelInputPacket,
} from './panel-transport';

/** What the session did with a call to step(). */
export type NetplayStep =
  /** Every input was present; a frame ran. */
  | 'ran'
  /** Somebody's input has not arrived; nothing ran and nothing was lost. */
  | 'waiting'
  /** The match is over, by a board topping out or by an abort. */
  | 'ended';

export interface PanelNetplayOptions {
  transport: PanelTransport;
  setup: PanelMatchSetup;
}

export class PanelNetplaySession {
  readonly stacks: Stack[];
  readonly match: PanelMatch;
  /** Index of this node's own board in `stacks`. */
  readonly localIndex: number;

  private readonly transport: PanelTransport;
  private readonly setup: PanelMatchSetup;
  /** Inputs received per player, oldest first, not yet consumed. */
  private readonly queues: string[][];
  private readonly unsubscribe: () => void;
  private frame = 0;
  private aborted = false;

  constructor(options: PanelNetplayOptions) {
    this.transport = options.transport;
    this.setup = options.setup;

    // Board order is the order in playerIds, on BOTH machines. Deriving it
    // from who is local would put the two boards in opposite slots on the two
    // screens, and garbage would appear to cross the wrong way.
    this.stacks = options.setup.playerIds.map((_id: string, index: number) => {
      const stack = new Stack({
        levelData: options.setup.levelData,
        // One seed, offset per board: the same two boards on both machines,
        // and not the same board twice.
        panelSource: new GeneratorSource(options.setup.seed + index, true),
        engineVersion: options.setup.engineVersion,
        cursorWaitTime: options.setup.cursorWaitTime,
        doCountdown: true,
      });
      stack.startingState();
      return stack;
    });

    this.localIndex = Math.max(0, options.setup.playerIds.indexOf(options.transport.localId()));
    this.queues = options.setup.playerIds.map(() => []);
    this.match = new PanelMatch({ stacks: this.stacks });

    this.unsubscribe = this.transport.onInput(
      (packet: PanelInputPacket) => this.receive(packet),
    );
  }

  /** A remote player's input, queued until its frame comes round. */
  private receive(packet: PanelInputPacket): void {
    const index = this.setup.playerIds.indexOf(packet.from);
    if (index < 0) return;  // not in this match
    for (const character of packet.input) this.queues[index].push(character);
  }

  /**
   * Offer this node's input for the next frame and run it if everyone's is in.
   *
   * The local input is queued through the SAME path as a remote one rather
   * than being applied directly. It costs nothing and it means the local board
   * cannot accidentally run a frame ahead of the boards it is being compared
   * against.
   */
  step(localInput: string): NetplayStep {
    if (this.hasEnded()) return 'ended';

    this.queues[this.localIndex].push(localInput);
    this.transport.sendInput({
      from: this.transport.localId(),
      input: localInput,
      frame: this.frame,
    });

    if (!this.queues.every((queue) => queue.length > 0)) {
      if (this.isIrrecoverablyBehind()) {
        this.aborted = true;
        return 'ended';
      }
      return 'waiting';
    }

    for (let index = 0; index < this.stacks.length; index++) {
      this.stacks[index].receiveConfirmedInput(this.queues[index].shift() as string);
    }
    this.match.run();
    this.frame += 1;

    return this.hasEnded() ? 'ended' : 'ran';
  }

  /**
   * Has one side fallen further behind than the flight time can absorb?
   *
   * Measured in frames of input owed, not in wall time: a slow machine that is
   * still sending is fine, and a machine that has stopped sending is not,
   * however fast it was.
   */
  private isIrrecoverablyBehind(): boolean {
    const owed = Math.max(...this.queues.map((queue) => queue.length));
    return owed > MAX_LAG;
  }

  hasEnded(): boolean {
    return this.aborted || this.match.hasEnded();
  }

  /** True when the match ended because a side stopped talking. */
  desynced(): boolean {
    return this.aborted;
  }

  /** This node's own board. */
  localStack(): Stack {
    return this.stacks[this.localIndex];
  }

  /** The other board, for a two-player match. */
  remoteStack(): Stack {
    return this.stacks[this.localIndex === 0 ? 1 : 0];
  }

  /** Did the local player win? Undefined while the match is still running. */
  localWon(): boolean | undefined {
    if (!this.match.hasEnded()) return undefined;
    return this.match.getWinners().includes(this.localStack());
  }

  dispose(): void {
    this.unsubscribe();
  }
}
