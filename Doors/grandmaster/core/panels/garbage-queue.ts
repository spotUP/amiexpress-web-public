/**
 * The garbage queue, ported from common/engine/GarbageQueue.lua (@ c80668e).
 *
 * Garbage does not go from one board to the other immediately - it spends 151
 * frames in flight, and that delay is the game. Three stages:
 *
 *   STAGED     91 frames. This is what the telegraph shows above the receiver,
 *              and it is why you can see an attack coming and clear space for
 *              it. Chain garbage additionally will not leave until the chain
 *              that is building it has ENDED.
 *   TRANSIT    60 more frames after leaving staging, during which nothing is
 *              drawn. Deliberate slack: it is what lets a laggy opponent's
 *              garbage still arrive on the right frame.
 *   LANDED     the receiver drops it when its board is calm enough.
 *
 * PRIORITY IS BY POSITION, and the array is ordered so that the HIGHEST
 * priority sits at the END - popping from the end costs nothing, popping from
 * the front would shift every element. So the ordering comparator reads
 * backwards from what you would expect. Chains outrank combos; wider combos
 * outrank narrower ones; combos queue before shock.
 *
 * ONE DELIBERATE DIVERGENCE, the same one consts.ts documents: a chain's
 * garbage stops growing at twelve rows. panel-attack grows it without limit;
 * the SNES original caps it, per both the manual FAQ and panel-pop.
 */

import {
  STAGING_DURATION,
  GARBAGE_DELAY_LAND_TIME,
  MAX_CHAIN_GARBAGE_HEIGHT,
} from './consts';

export interface Garbage {
  /** Columns, 1 to the receiving stack's width. */
  width: number;
  /** Rows, at least 1. */
  height: number;
  /** Shock/metal garbage. Mutually exclusive with isChain. */
  isMetal: boolean;
  isChain: boolean;
  /** The clock this piece was earned at; the staging timer counts from it. */
  frameEarned: number;
  /** Where the attack graphic starts from. Chains track this per link. */
  rowEarned?: number;
  colEarned?: number;
  // --- chain garbage only ---
  /** Has the chain that is growing this stopped? Until then it cannot leave. */
  finalized?: boolean;
  finalizedClock?: number;
  links?: Map<number, { rowEarned: number; colEarned: number }>;
  linkTimes?: number[];
}

/** Ordering between two chains: unfinalised last, then newest first. */
function orderChainGarbage(a: Garbage, b: Garbage): boolean {
  if (a.finalized === b.finalized) return a.frameEarned > b.frameEarned;
  return !a.finalized;
}

/**
 * Ordering between two combos: WIDER FIRST, and for equal widths the newer one
 * goes ahead - upstream notes this deviation deliberately, because it refreshes
 * the older piece's release time.
 */
function orderComboGarbage(a: Garbage, b: Garbage): boolean {
  if (a.width !== b.width) return a.width > b.width;
  return a.frameEarned < b.frameEarned;
}

/** True if `a` sorts before `b`. Priority INCREASES with index. */
function garbageComesFirst(a: Garbage, b: Garbage, treatMetalAsCombo: boolean): boolean {
  if (a.isChain === b.isChain) {
    if (a.isChain) return orderChainGarbage(a, b);
    if (a.isMetal === b.isMetal) return orderComboGarbage(a, b);
    // A combo and a shock. Normally a combo queues BEFORE shock, so shock pops
    // first; treatMetalAsCombo merges them, which some attack patterns want.
    if (treatMetalAsCombo) return orderComboGarbage(a, b);
    return a.isMetal;
  }
  // A chain outranks a combo, so it sorts after it.
  return !a.isChain;
}

export class GarbageQueue {
  /** Waiting to be sent. Lowest priority first, highest LAST. */
  stagedGarbage: Garbage[] = [];
  /** In flight, keyed by the clock it may land on. */
  garbageInTransit = new Map<number, Garbage[]>();
  /** Everything ever pushed, in order. Exists for tests and score reports. */
  history: Garbage[] = [];
  /** Delivery clocks, oldest first. */
  transitTimers: number[] = [];
  /** The chain currently being grown, if any. */
  currentChain: Garbage | null = null;
  /** Attack engines may queue combos as chains; real stacks may not. */
  illegalStuffIsAllowed: boolean;
  treatMetalAsCombo: boolean;

  onGarbagePushed?: (garbage: Garbage) => void;
  onNewChainLink?: (chain: Garbage) => void;
  onChainEnded?: (chain: Garbage) => void;

  constructor(allowIllegalStuff = false, treatMetalAsCombo = false) {
    this.illegalStuffIsAllowed = allowIllegalStuff;
    this.treatMetalAsCombo = treatMetalAsCombo;
  }

  private sort(): void {
    // Lua's table.sort is unstable and JavaScript's is stable, which can only
    // narrow the possible orderings, never widen them: for equal elements the
    // comparator has no opinion either way.
    this.stagedGarbage.sort((a, b) => {
      if (garbageComesFirst(a, b, this.treatMetalAsCombo)) return -1;
      if (garbageComesFirst(b, a, this.treatMetalAsCombo)) return 1;
      return 0;
    });
  }

  /**
   * Combo garbage taller than one row is relabelled as a chain when illegal
   * stuff is allowed, which lets an attack pattern queue several chains on one
   * frame. Real play never reaches this.
   */
  private correctChainingFlag(garbage: Garbage): void {
    if (garbage.height > 1 && this.illegalStuffIsAllowed) {
      garbage.isChain = true;
      garbage.finalized = true;
    }
  }

  /** Queue one piece. For chains use addChainLink instead. */
  push(garbage: Garbage): void {
    this.correctChainingFlag(garbage);
    this.stagedGarbage.push(garbage);
    this.history.push(garbage);
    this.sort();
    this.onGarbagePushed?.(garbage);
  }

  pushTable(garbageArray: Garbage[] | null | undefined): void {
    if (!garbageArray) return;
    for (const garbage of garbageArray) this.push(garbage);
  }

  /** The next piece that would leave, without removing it. */
  peek(): Garbage | undefined {
    return this.stagedGarbage[this.stagedGarbage.length - 1];
  }

  pop(): Garbage | undefined {
    return this.stagedGarbage.pop();
  }

  len(): number {
    return this.stagedGarbage.length;
  }

  getOldestFinishedTransitTime(): number | undefined {
    return this.transitTimers[0];
  }

  /**
   * Take the garbage due to land at `clock`.
   *
   * A real queue may only pop the exact clock asked for. An attack engine may
   * also pop something that should have landed EARLIER, which is how a
   * simulated opponent stays on schedule when the player's board is busy.
   */
  popFinishedTransitsAt(clock: number): Garbage[] | undefined {
    const next = this.transitTimers[0];
    if (next === undefined) return undefined;

    if (next === clock) {
      this.transitTimers.shift();
      return this.garbageInTransit.get(clock);
    }
    if (this.illegalStuffIsAllowed && next < clock) {
      const due = this.transitTimers.shift() as number;
      return this.garbageInTransit.get(due);
    }
    return undefined;
  }

  /**
   * Move everything that has served its staging time into transit.
   *
   * Walks from the HIGHEST priority end and stops at the first piece that is
   * not ready: order is preserved, so a newer high-priority piece cannot
   * overtake an older one that is still waiting. A chain that has not ended
   * blocks the walk, because its size is still changing.
   */
  processStagedGarbageForClock(clock: number): void {
    let popped: Garbage[] | undefined;

    for (let i = this.stagedGarbage.length - 1; i >= 0; i--) {
      const garbage = this.stagedGarbage[i];
      const notReady = garbage.isChain
        ? (!garbage.finalized || garbage.frameEarned + STAGING_DURATION > clock)
        : (garbage.frameEarned + STAGING_DURATION > clock);
      if (notReady) break;

      if (!popped) popped = [];
      popped.push(this.stagedGarbage.pop() as Garbage);
    }

    if (popped) {
      const deliveryTime = clock + GARBAGE_DELAY_LAND_TIME;
      this.garbageInTransit.set(deliveryTime, popped);
      this.transitTimers.push(deliveryTime);
    }
  }

  /**
   * Grow the chain being built, or start one.
   *
   * A chain sends ONE 6-wide block whose height is the number of links, not a
   * block per link - so the whole chain arrives together when it ends. Capped
   * at twelve rows: see MAX_CHAIN_GARBAGE_HEIGHT for why we diverge from
   * panel-attack here.
   */
  addChainLink(frameEarned: number, row: number, column: number): void {
    if (this.currentChain === null) {
      this.currentChain = {
        width: 6,
        height: 1,
        isMetal: false,
        isChain: true,
        frameEarned,
        finalized: false,
        links: new Map([[frameEarned, { rowEarned: row, colEarned: column }]]),
        linkTimes: [frameEarned],
      };
      this.push(this.currentChain);
    } else {
      const chain = this.currentChain;
      chain.height = Math.min(chain.height + 1, MAX_CHAIN_GARBAGE_HEIGHT);
      chain.frameEarned = frameEarned;
      chain.links?.set(frameEarned, { rowEarned: row, colEarned: column });
      chain.linkTimes?.push(frameEarned);
    }
    this.onNewChainLink?.(this.currentChain);
  }

  /** The chain has ended, so its garbage may now start its staging clock. */
  finalizeCurrentChain(clock: number): void {
    if (!this.currentChain) return;
    this.currentChain.finalized = true;
    this.currentChain.finalizedClock = clock;
    this.onChainEnded?.(this.currentChain);
    this.currentChain = null;
  }

  /**
   * Where a piece sits from the TELEGRAPH's point of view - which numbers from
   * the next piece to pop, while the array is ordered the other way.
   */
  getGarbageIndex(garbage: Garbage): number {
    const count = this.stagedGarbage.length;
    for (let i = 0; i < count; i++) {
      if (this.stagedGarbage[i] === garbage) return count - 1 - i;
    }
    throw new Error('garbage is not in the queue it claims to be in');
  }
}
