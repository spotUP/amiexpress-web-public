"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttackManager = exports.GarbageQueue = exports.AttackCalculator = void 0;
const board_1 = require("../core/board");
/**
 * Attack Calculator
 *
 * Calculates garbage lines based on modern Tetris multiplayer rules
 */
class AttackCalculator {
    /**
     * Calculate attack power for a line clear
     */
    static calculate(linesCleared, tSpinType, combo, backToBack, isPerfectClear) {
        let type;
        let baseLines = 0;
        // Determine attack type and base lines
        if (isPerfectClear) {
            type = 'perfect_clear';
            baseLines = this.BASE_ATTACK.perfect_clear;
        }
        else if (tSpinType === 'full') {
            if (linesCleared === 1)
                type = 'tspin_single';
            else if (linesCleared === 2)
                type = 'tspin_double';
            else
                type = 'tspin_triple';
            baseLines = this.BASE_ATTACK[type];
        }
        else if (tSpinType === 'mini') {
            type = 'tspin_mini';
            baseLines = this.BASE_ATTACK.tspin_mini;
        }
        else {
            if (linesCleared === 1)
                type = 'single';
            else if (linesCleared === 2)
                type = 'double';
            else if (linesCleared === 3)
                type = 'triple';
            else
                type = 'tetris';
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
    static getComboBonus(combo) {
        const index = Math.min(combo, this.COMBO_TABLE.length - 1);
        return this.COMBO_TABLE[index];
    }
}
exports.AttackCalculator = AttackCalculator;
// Base attack table (standard Tetris multiplayer)
AttackCalculator.BASE_ATTACK = {
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
AttackCalculator.COMBO_TABLE = [
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
 * Garbage Queue Manager
 *
 * Manages incoming garbage lines and determines when to add them to the board
 */
class GarbageQueue {
    constructor() {
        this.queue = [];
        this.pendingLines = 0;
        this.cancelledLines = 0;
    }
    /**
     * Add garbage to queue
     */
    addGarbage(sender, lines) {
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
    cancelGarbage(outgoingLines) {
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
            }
            else {
                // Partially cancel
                oldest.lines -= remaining;
                this.pendingLines -= remaining;
                this.cancelledLines += remaining;
                remaining = 0;
            }
        }
        // Return excess attack lines (to send to opponents)
        return outgoingLines - this.cancelledLines;
    }
    /**
     * Apply garbage to board (called when piece locks)
     */
    applyGarbage(board) {
        if (this.queue.length === 0) {
            return 0;
        }
        let totalApplied = 0;
        // Apply all queued garbage
        while (this.queue.length > 0) {
            const garbage = this.queue.shift();
            (0, board_1.addGarbage)(board, garbage.lines, garbage.holePosition);
            totalApplied += garbage.lines;
            this.pendingLines -= garbage.lines;
        }
        return totalApplied;
    }
    /**
     * Get pending garbage count
     */
    getPending() {
        return this.pendingLines;
    }
    /**
     * Get queued garbage blocks
     */
    getQueue() {
        return [...this.queue];
    }
    /**
     * Clear all pending garbage
     */
    clear() {
        this.queue = [];
        this.pendingLines = 0;
        this.cancelledLines = 0;
    }
    /**
     * Get cancelled lines (for stats)
     */
    getCancelledLines() {
        return this.cancelledLines;
    }
    /**
     * Reset cancelled counter
     */
    resetCancelled() {
        this.cancelledLines = 0;
    }
}
exports.GarbageQueue = GarbageQueue;
/**
 * Attack Manager
 *
 * Coordinates attacks between players
 */
class AttackManager {
    constructor() {
        this.garbageQueue = new GarbageQueue();
    }
    /**
     * Process line clear and calculate attack
     */
    processLineClear(linesCleared, tSpinType, combo, backToBack, isPerfectClear) {
        const result = AttackCalculator.calculate(linesCleared, tSpinType, combo, backToBack, isPerfectClear);
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
    receiveAttack(sender, lines) {
        this.garbageQueue.addGarbage(sender, lines);
        if (this.onGarbageReceived) {
            this.onGarbageReceived(lines, sender);
        }
    }
    /**
     * Apply pending garbage to board
     */
    applyGarbage(board) {
        return this.garbageQueue.applyGarbage(board);
    }
    /**
     * Get pending garbage count
     */
    getPendingGarbage() {
        return this.garbageQueue.getPending();
    }
    /**
     * Get garbage queue
     */
    getGarbageQueue() {
        return this.garbageQueue.getQueue();
    }
    /**
     * Subscribe to attack sent events
     */
    onAttackSentCallback(callback) {
        this.onAttackSent = callback;
    }
    /**
     * Subscribe to garbage received events
     */
    onGarbageReceivedCallback(callback) {
        this.onGarbageReceived = callback;
    }
    /**
     * Clear garbage queue
     */
    clearGarbage() {
        this.garbageQueue.clear();
    }
}
exports.AttackManager = AttackManager;
//# sourceMappingURL=attack-system.js.map