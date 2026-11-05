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
/**
 * Attack type
 */
export type AttackType = 'single' | 'double' | 'triple' | 'tetris' | 'tspin_mini' | 'tspin_single' | 'tspin_double' | 'tspin_triple' | 'perfect_clear';
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
    total: number;
}
/**
 * Attack Calculator
 *
 * Calculates garbage lines based on modern Tetris multiplayer rules
 */
export declare class AttackCalculator {
    private static readonly BASE_ATTACK;
    private static readonly COMBO_TABLE;
    /**
     * Calculate attack power for a line clear
     */
    static calculate(linesCleared: number, tSpinType: 'none' | 'mini' | 'full', combo: number, backToBack: boolean, isPerfectClear: boolean): AttackResult;
    /**
     * Get combo bonus for specific combo count
     */
    static getComboBonus(combo: number): number;
}
/**
 * Garbage Queue Manager
 *
 * Manages incoming garbage lines and determines when to add them to the board
 */
export declare class GarbageQueue {
    private queue;
    private pendingLines;
    private cancelledLines;
    /**
     * Add garbage to queue
     */
    addGarbage(sender: string, lines: number): void;
    /**
     * Cancel garbage with outgoing attack (counter-attack)
     */
    cancelGarbage(outgoingLines: number): number;
    /**
     * Apply garbage to board (called when piece locks)
     */
    applyGarbage(board: Board): number;
    /**
     * Get pending garbage count
     */
    getPending(): number;
    /**
     * Get queued garbage blocks
     */
    getQueue(): GarbageLine[];
    /**
     * Clear all pending garbage
     */
    clear(): void;
    /**
     * Get cancelled lines (for stats)
     */
    getCancelledLines(): number;
    /**
     * Reset cancelled counter
     */
    resetCancelled(): void;
}
/**
 * Attack Manager
 *
 * Coordinates attacks between players
 */
export declare class AttackManager {
    private garbageQueue;
    private onAttackSent?;
    private onGarbageReceived?;
    constructor();
    /**
     * Process line clear and calculate attack
     */
    processLineClear(linesCleared: number, tSpinType: 'none' | 'mini' | 'full', combo: number, backToBack: boolean, isPerfectClear: boolean): AttackResult | null;
    /**
     * Receive attack from opponent
     */
    receiveAttack(sender: string, lines: number): void;
    /**
     * Apply pending garbage to board
     */
    applyGarbage(board: Board): number;
    /**
     * Get pending garbage count
     */
    getPendingGarbage(): number;
    /**
     * Get garbage queue
     */
    getGarbageQueue(): GarbageLine[];
    /**
     * Subscribe to attack sent events
     */
    onAttackSentCallback(callback: (lines: number, type: AttackType) => void): void;
    /**
     * Subscribe to garbage received events
     */
    onGarbageReceivedCallback(callback: (lines: number, sender: string) => void): void;
    /**
     * Clear garbage queue
     */
    clearGarbage(): void;
}
//# sourceMappingURL=attack-system.d.ts.map