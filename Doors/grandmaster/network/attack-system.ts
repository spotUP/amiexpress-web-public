/**
 * Attack/Garbage System
 *
 * Calculates garbage lines sent to opponents based on:
 * - Line clears (single/double/triple/tetris)
 * - T-Spins
 * - Combos
 * - Back-to-Back bonuses
 * - Perfect clears
 */

import type { Board } from '../core/types';
import { addGarbage } from '../core/board';

/**
 * Attack type
 */
export type AttackType =
  | 'single'
  | 'double'
  | 'triple'
  | 'tetris'
  | 'tspin_mini'
  | 'tspin_single'
  | 'tspin_double'
  | 'tspin_triple'
  | 'perfect_clear';

/**
 * Garbage line in queue
 */
export interface GarbageLine {
  lines: number;
  holePosition: number;
  sender: string;
  timestamp: number;
}

/**
 * Attack calculation result
 */
export interface AttackResult {
  type: AttackType;
  lines: number;
  combo: number;
  backToBack: boolean;
  total: number;  // Total garbage lines to send
}

/**
 * Attack Calculator
 *
 * Calculates garbage lines based on modern Tetris multiplayer rules
 */
export class AttackCalculator {
  // Base attack table (standard Tetris multiplayer)
  private static readonly BASE_ATTACK: Record<AttackType, number> = {
    single: 0,
    double: 1,
    triple: 2,
    tetris: 4,
    tspin_mini: 0,
    tspin_single: 2,
    tspin_double: 4,
    tspin_triple: 6,
    perfect_clear: 10,
  };

  // Combo multiplier table
  private static readonly COMBO_TABLE: number[] = [
    0, // 0 combo
    0, // 1 combo
    1, // 2 combo
    1, // 3 combo
    1, // 4 combo
    2, // 5 combo
    2, // 6 combo
    3, // 7 combo
    3, // 8 combo
    4, // 9 combo
    4, // 10 combo
    4, // 11 combo
    5, // 12+ combo
  ];

  /**
   * Calculate attack power for a line clear
   */
  static calculate(
    linesCleared: number,
    tSpinType: 'none' | 'mini' | 'full',
    combo: number,
    backToBack: boolean,
    isPerfectClear: boolean
  ): AttackResult {
    let type: AttackType;
    let baseLines = 0;

    // Determine attack type and base lines
    if (isPerfectClear) {
      type = 'perfect_clear';
      baseLines = this.BASE_ATTACK.perfect_clear;
    } else if (tSpinType === 'full') {
      if (linesCleared === 1) type = 'tspin_single';
      else if (linesCleared === 2) type = 'tspin_double';
      else type = 'tspin_triple';
      baseLines = this.BASE_ATTACK[type];
    } else if (tSpinType === 'mini') {
      type = 'tspin_mini';
      baseLines = this.BASE_ATTACK.tspin_mini;
    } else {
      if (linesCleared === 1) type = 'single';
      else if (linesCleared === 2) type = 'double';
      else if (linesCleared === 3) type = 'triple';
      else type = 'tetris';
      baseLines = this.BASE_ATTACK[type];
    }

    // Add combo bonus
    const comboIndex = Math.min(combo, this.COMBO_TABLE.length - 1);
    const comboBonus = this.COMBO_TABLE[comboIndex];

    // Add back-to-back bonus (50% increase)
    const b2bBonus = backToBack && (type === 'tetris' || tSpinType !== 'none') ? Math.floor(baseLines * 0.5) : 0;

    // Total attack
    const total = baseLines + comboBonus + b2bBonus;

    return {
      type,
      lines: baseLines,
      combo: comboBonus,
      backToBack: b2bBonus > 0,
      total,
    };
  }

  /**
   * Get combo bonus for specific combo count
   */
  static getComboBonus(combo: number): number {
    const index = Math.min(combo, this.COMBO_TABLE.length - 1);
    return this.COMBO_TABLE[index];
  }
}

/**
 * Garbage Queue Manager
 *
 * Manages incoming garbage lines and determines when to add them to the board
 */
export class GarbageQueue {
  private queue: GarbageLine[] = [];
  private pendingLines: number = 0;
  private cancelledLines: number = 0;

  /**
   * Add garbage to queue
   */
  addGarbage(sender: string, lines: number): void {
    // Random hole position
    const holePosition = Math.floor(Math.random() * 10);

    this.queue.push({
      lines,
      holePosition,
      sender,
      timestamp: Date.now(),
    });

    this.pendingLines += lines;
  }

  /**
   * Cancel garbage with outgoing attack (counter-attack)
   */
  cancelGarbage(outgoingLines: number): number {
    let remaining = outgoingLines;

    // Cancel pending garbage
    while (remaining > 0 && this.queue.length > 0) {
      const oldest = this.queue[0];

      if (oldest.lines <= remaining) {
        // Fully cancel this garbage block
        remaining -= oldest.lines;
        this.pendingLines -= oldest.lines;
        this.cancelledLines += oldest.lines;
        this.queue.shift();
      } else {
        // Partially cancel
        oldest.lines -= remaining;
        this.pendingLines -= remaining;
        this.cancelledLines += remaining;
        remaining = 0;
      }
    }

    // Return excess attack lines (to send to opponents). `remaining` is what
    // survived cancellation in THIS call - the earlier version subtracted
    // this.cancelledLines, which is CUMULATIVE for the whole game
    // (resetCancelled() had no callers), so after the first successful
    // cancel every later attack was under-counted or went negative.
    return remaining;
  }

  /**
   * Apply garbage to board (called when piece locks)
   */
  applyGarbage(board: Board): number {
    if (this.queue.length === 0) {
      return 0;
    }

    let totalApplied = 0;

    // Apply all queued garbage
    while (this.queue.length > 0) {
      const garbage = this.queue.shift()!;
      addGarbage(board, garbage.lines, garbage.holePosition);
      totalApplied += garbage.lines;
      this.pendingLines -= garbage.lines;
    }

    return totalApplied;
  }

  /**
   * Get pending garbage count
   */
  getPending(): number {
    return this.pendingLines;
  }

  /**
   * Get queued garbage blocks
   */
  getQueue(): GarbageLine[] {
    return [...this.queue];
  }

  /**
   * Clear all pending garbage
   */
  clear(): void {
    this.queue = [];
    this.pendingLines = 0;
    this.cancelledLines = 0;
  }

  /**
   * Get cancelled lines (for stats)
   */
  getCancelledLines(): number {
    return this.cancelledLines;
  }

  /**
   * Reset cancelled counter
   */
  resetCancelled(): void {
    this.cancelledLines = 0;
  }
}

/**
 * Attack Manager
 *
 * Coordinates attacks between players
 */
export class AttackManager {
  private garbageQueue: GarbageQueue;
  private onAttackSent?: (lines: number, type: AttackType) => void;
  private onGarbageReceived?: (lines: number, sender: string) => void;

  constructor() {
    this.garbageQueue = new GarbageQueue();
  }

  /**
   * Process line clear and calculate attack
   */
  processLineClear(
    linesCleared: number,
    tSpinType: 'none' | 'mini' | 'full',
    combo: number,
    backToBack: boolean,
    isPerfectClear: boolean
  ): AttackResult | null {
    const result = AttackCalculator.calculate(
      linesCleared,
      tSpinType,
      combo,
      backToBack,
      isPerfectClear
    );

    if (result.total > 0) {
      // Cancel incoming garbage
      const netAttack = this.garbageQueue.cancelGarbage(result.total);

      // Send remaining lines to opponents
      if (netAttack > 0 && this.onAttackSent) {
        this.onAttackSent(netAttack, result.type);
      }

      return { ...result, total: netAttack };
    }

    return null;
  }

  /**
   * Receive attack from opponent
   */
  receiveAttack(sender: string, lines: number): void {
    this.garbageQueue.addGarbage(sender, lines);

    if (this.onGarbageReceived) {
      this.onGarbageReceived(lines, sender);
    }
  }

  /**
   * Apply pending garbage to board
   */
  applyGarbage(board: Board): number {
    return this.garbageQueue.applyGarbage(board);
  }

  /**
   * Get pending garbage count
   */
  getPendingGarbage(): number {
    return this.garbageQueue.getPending();
  }

  /**
   * Get garbage queue
   */
  getGarbageQueue(): GarbageLine[] {
    return this.garbageQueue.getQueue();
  }

  /**
   * Subscribe to attack sent events
   */
  onAttackSentCallback(callback: (lines: number, type: AttackType) => void): void {
    this.onAttackSent = callback;
  }

  /**
   * Subscribe to garbage received events
   */
  onGarbageReceivedCallback(callback: (lines: number, sender: string) => void): void {
    this.onGarbageReceived = callback;
  }

  /**
   * Clear garbage queue
   */
  clearGarbage(): void {
    this.garbageQueue.clear();
  }
}
