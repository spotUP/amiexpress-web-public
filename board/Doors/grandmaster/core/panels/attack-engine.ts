/**
 * The attack engine, ported from common/engine/AttackEngine.lua.
 *
 * A scripted opponent. It does not play - it replays a timetable of attacks,
 * looping forever, and that is what both Training and Challenge Mode use for
 * the pressure they put on you.
 *
 * The scripts are worth knowing about: many of the shipped ones were CAPTURED
 * FROM REAL HUMAN GAMES. `challenge-8-12.json` is tagged with the player's name
 * and 32.9 garbage-per-minute. So a late Challenge stage is not a designer's
 * guess at what hard feels like; it is what somebody actually did to someone.
 *
 * TWO TIMING SUBTLETIES, both upstream's:
 *
 *  - `delayBeforeStart` is shifted back by the whole countdown (188 frames)
 *    unless the file says it has already been adjusted. A script that says it
 *    starts at frame 150 therefore starts at -38, i.e. immediately.
 *  - EVERYTHING LOOPS, with a period of `delayBeforeRepeat` plus the latest
 *    start time. There is no "end" to a pattern; it simply comes round again.
 */

import type { GarbageQueue, Garbage } from './garbage-queue';
import { COUNTDOWN_START, COUNTDOWN_LENGTH } from './consts';
import { RandomGenerator } from './prng';

/** One scheduled attack. */
interface AttackPattern {
  width: number;
  height: number;
  startTime: number;
  /** Marks the end of a chain rather than sending anything. */
  endsChain: boolean;
  garbage: Garbage;
}

/** A pattern as the shipped JSON files describe it. */
export interface AttackPatternSpec {
  width?: number;
  height?: number;
  startTime?: number;
  metal?: boolean;
  /**
   * A number: frames between links of a chain `height` links long.
   * An array: the exact frame of each link.
   * False or absent: this is combo garbage, not a chain.
   */
  chain?: number | number[] | false;
  chainEndDelta?: number;
  chainEndTime?: number;
}

export interface AttackSettings {
  name?: string;
  delayBeforeStart?: number;
  delayBeforeRepeat?: number;
  disableQueueLimit?: boolean;
  /** The file's own name for "treat shock as combo". Kept for compatibility. */
  mergeComboMetalQueue?: boolean;
  countdownAdjusted?: boolean;
  attackPatterns: AttackPatternSpec[];
  extraInfo?: Record<string, unknown>;
}

/** Above this many pieces already in flight, a throttled engine holds off. */
const TRANSIT_QUEUE_LIMIT = 6;

export class AttackEngine {
  readonly delayBeforeStart: number;
  readonly delayBeforeRepeat: number;
  readonly disableQueueLimit: boolean;
  readonly treatMetalAsCombo: boolean;
  readonly attackSettings: AttackSettings;
  private readonly attackPatterns: AttackPattern[] = [];
  /** Frames since this engine started running. */
  stopWatch = 0;
  readonly outgoingGarbage: GarbageQueue;
  /**
   * Upstream picks the attack graphic's origin with the GLOBAL math.random,
   * which is not the panel generator and is not reproducible. A seeded stream
   * is used here instead so a Challenge run is deterministic; the value is
   * cosmetic - it only decides where the attack animation starts from.
   */
  private readonly cosmeticRng = new RandomGenerator(1);

  constructor(attackSettings: AttackSettings, garbageQueue: GarbageQueue) {
    let delayBeforeStart = attackSettings.delayBeforeStart ?? 0;
    if (!attackSettings.countdownAdjusted) {
      delayBeforeStart -= COUNTDOWN_START + COUNTDOWN_LENGTH;
    }
    this.delayBeforeStart = delayBeforeStart;
    this.delayBeforeRepeat = attackSettings.delayBeforeRepeat ?? 0;
    this.disableQueueLimit = attackSettings.disableQueueLimit ?? false;
    this.treatMetalAsCombo = attackSettings.mergeComboMetalQueue ?? false;
    this.attackSettings = attackSettings;

    this.outgoingGarbage = garbageQueue;
    // A scripted sender is allowed things a real stack is not: queueing several
    // chains at once, and delivering late.
    this.outgoingGarbage.treatMetalAsCombo = this.treatMetalAsCombo;
    this.outgoingGarbage.illegalStuffIsAllowed = true;

    this.addAttackPatternsFromTable(attackSettings.attackPatterns ?? []);
  }

  private addAttackPattern(
    width: number, height: number, start: number, metal: boolean, chain: boolean,
  ): void {
    this.attackPatterns.push({
      width,
      height,
      startTime: this.delayBeforeStart + start,
      endsChain: false,
      garbage: {
        width, height, isMetal: metal, isChain: chain, frameEarned: 0,
      },
    });
  }

  private addEndChainPattern(chainEnd: number): void {
    this.attackPatterns.push({
      width: 0,
      height: 0,
      startTime: this.delayBeforeStart + chainEnd,
      endsChain: true,
      garbage: { width: 0, height: 0, isMetal: false, isChain: false, frameEarned: 0 },
    });
  }

  /**
   * Expand the file's shorthand into individual scheduled attacks.
   *
   * A chain is written either as "N links, this many frames apart" or as an
   * explicit list of frames, and either way it becomes one 6-wide attack per
   * link plus an end marker.
   */
  private addAttackPatternsFromTable(specs: AttackPatternSpec[]): void {
    for (const spec of specs) {
      if (spec.chain) {
        if (typeof spec.chain === 'number') {
          const height = spec.height ?? 1;
          const startTime = spec.startTime ?? 0;
          for (let i = 1; i <= height; i++) {
            this.addAttackPattern(6, i, startTime + (i - 1) * spec.chain, false, true);
          }
          this.addEndChainPattern(
            startTime + (height - 1) * spec.chain + (spec.chainEndDelta ?? 0),
          );
        } else if (Array.isArray(spec.chain)) {
          spec.chain.forEach((chainTime, index) => {
            this.addAttackPattern(6, index + 1, chainTime, false, true);
          });
          this.addEndChainPattern(spec.chainEndTime ?? 0);
        } else {
          throw new Error(
            "The 'chain' field in your attack file is invalid. "
            + 'It should either be a number or a list of numbers.',
          );
        }
      } else {
        this.addAttackPattern(
          spec.width ?? 1, spec.height ?? 1, spec.startTime ?? 0, spec.metal ?? false, false,
        );
      }
    }
  }

  /**
   * Advance one frame, sending whatever is due.
   *
   * A throttled engine holds off entirely while more than six pieces are
   * already in flight - the recipient is clearly not accepting them, and
   * piling on would just slow the game down.
   */
  run(): void {
    if (this.attackPatterns.length === 0) {
      this.stopWatch += 1;
      return;
    }

    let highestStartTime = this.attackPatterns[0].startTime;
    for (const pattern of this.attackPatterns) {
      highestStartTime = Math.max(pattern.startTime, highestStartTime);
    }
    const period = this.delayBeforeRepeat + highestStartTime - this.delayBeforeStart;

    const throttled = !this.disableQueueLimit
      && this.outgoingGarbage.transitTimers.length > TRANSIT_QUEUE_LIMIT;

    if (!throttled && period > 0) {
      for (const pattern of this.attackPatterns) {
        if (this.stopWatch < pattern.startTime) continue;
        if ((this.stopWatch - pattern.startTime) % period !== 0) continue;

        if (pattern.endsChain) {
          if (!this.outgoingGarbage.currentChain) break;
          this.outgoingGarbage.finalizeCurrentChain(this.stopWatch);
        } else if (pattern.garbage.isChain) {
          this.outgoingGarbage.addChainLink(
            this.stopWatch,
            this.cosmeticRng.randomRange(1, 11),
            this.cosmeticRng.randomRange(1, 6),
          );
        } else {
          // Copied, because the pattern's own garbage object is reused every
          // time the script comes round.
          this.outgoingGarbage.push({
            ...pattern.garbage,
            frameEarned: this.stopWatch,
            rowEarned: this.cosmeticRng.randomRange(1, 11),
            colEarned: this.cosmeticRng.randomRange(1, 6),
          });
        }
      }
    }

    this.stopWatch += 1;
  }
}
