"use strict";
/**
 * Credit Roll System
 *
 * Invisible challenge at the end of Master mode
 * - Triggered at level 999
 * - TGM3: Total roll time is based on performance, approx 60-90 seconds
 * - Must clear 32 lines to qualify for GM rank
 * - Pieces become invisible AFTER locking
 * - Active piece remains visible but becomes "ghostly" in Master roll
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvisiblePieceManager = exports.CreditRollManager = void 0;
/**
 * Credit Roll Manager
 *
 * Handles the invisible challenge at game end
 */
class CreditRollManager {
    constructor() {
        this.state = {
            active: false,
            startTime: null,
            duration: 60000, // 60 seconds
            timeRemaining: 60000,
            linesCleared: 0,
            linesRequired: 32, // TGM3 requirement
            qualified: false,
        };
    }
    /**
     * Start credit roll
     * @param level Starting level (999 for Master, 1300 for Shirase)
     */
    start(level) {
        this.state.active = true;
        this.state.startTime = Date.now();
        // TGM3 roll duration: ~60s for Master, ~90s for Shirase
        this.state.duration = level >= 1300 ? 90000 : 60000;
        this.state.timeRemaining = this.state.duration;
        this.state.linesCleared = 0;
        this.state.qualified = false;
    }
    /**
     * Update credit roll timer
     */
    update(deltaTime) {
        if (!this.state.active || !this.state.startTime) {
            return;
        }
        // Update timer
        this.state.timeRemaining -= deltaTime;
        // Check if time ran out
        if (this.state.timeRemaining <= 0) {
            this.state.timeRemaining = 0;
            this.end();
        }
    }
    /**
     * Record lines cleared during credit roll
     */
    addLines(count) {
        if (!this.state.active) {
            return;
        }
        this.state.linesCleared += count;
        // TGM3: Pass requirement is 32 lines
        if (this.state.linesCleared >= this.state.linesRequired) {
            this.state.qualified = true;
        }
    }
    /**
     * End credit roll
     */
    end() {
        // Note: In real TGM3, pieces become visible again for "EXCELLENT" result
        // but here we just end the challenge
        this.state.active = false;
    }
    /**
     * Check if credit roll is active
     */
    isActive() {
        return this.state.active;
    }
    /**
     * Check if player qualified (cleared enough lines)
     */
    isQualified() {
        return this.state.qualified;
    }
    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Get fade stage for piece based on lock time
     * Authentic TGM3: Pieces fade out completely in 72 frames (~1.2s)
     */
    getFadeStage(lockTime) {
        if (!this.state.active) {
            return 'full';
        }
        const elapsedMs = Date.now() - lockTime;
        const elapsedFrames = (elapsedMs / 1000) * 60;
        // 1:1 HeborisCE/TGM3 Fade Stages:
        // Solid: 0-10 frames
        // Bright: 11-25 frames
        // Medium: 26-45 frames
        // Faint: 46-71 frames
        // Invisible: 72+ frames
        if (elapsedFrames < 10)
            return 'full';
        if (elapsedFrames < 25)
            return 'bright';
        if (elapsedFrames < 45)
            return 'medium';
        if (elapsedFrames < 72)
            return 'faint';
        return 'invisible';
    }
    /**
     * Get opacity for fade stage (0.0 - 1.0)
     */
    getOpacity(stage) {
        switch (stage) {
            case 'full': return 1.0;
            case 'bright': return 0.7;
            case 'medium': return 0.4;
            case 'faint': return 0.15;
            case 'invisible': return 0.0;
        }
    }
    /**
     * Reset credit roll
     */
    reset() {
        this.state = {
            active: false,
            startTime: null,
            duration: 60000,
            timeRemaining: 60000,
            linesCleared: 0,
            linesRequired: 32,
            qualified: false,
        };
    }
}
exports.CreditRollManager = CreditRollManager;
/**
 * Invisible piece manager
 *
 * Handles piece visibility during credit roll and bone blocks
 */
class InvisiblePieceManager {
    /**
     * Check if current piece should be invisible (active piece)
     * TGM3: Active piece is VISIBLE during Master roll, but board is INVISIBLE
     */
    shouldActivePieceBeInvisible() {
        // Active piece is always visible in standard Master roll
        return false;
    }
    /**
     * Should board cells be invisible
     */
    shouldBoardBeInvisible(active) {
        return active;
    }
    /**
     * Get visibility level for active piece (0.0 - 1.0)
     */
    getPieceVisibility(active) {
        if (!active) {
            return 1.0;
        }
        // In credit roll, active piece is slightly transparent
        return 0.8;
    }
    /**
     * Get visibility level for ghost piece (0.0 - 1.0)
     */
    getGhostVisibility(active) {
        if (!active) {
            return 0.5;
        }
        // No ghost during invisible challenge
        return 0.0;
    }
    /**
     * Should show bone blocks (S13+ grades)
     */
    shouldShowBoneBlocks(grade) {
        // Bone blocks appear at S13+ grades or in Shirase mode
        return grade === 'S13' || grade.startsWith('m') || grade.startsWith('M') || grade === 'GM';
    }
}
exports.InvisiblePieceManager = InvisiblePieceManager;
//# sourceMappingURL=credit-roll.js.map