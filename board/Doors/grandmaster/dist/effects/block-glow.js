"use strict";
/**
 * Per-Block Glow System
 *
 * Manages persistent glow effects on locked pieces and cleared lines.
 * Implements radial glow patterns (Manhattan for T-spins, Euclidean for combos).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockGlowManager = void 0;
/**
 * Block Glow Manager
 *
 * Uses sparse Map storage for performance (~5ms per frame for 20 glowing cells).
 * Manages multiple glow layers (primary + back-to-back bonus).
 */
class BlockGlowManager {
    constructor() {
        this.glows = new Map();
        this.BASE_DURATION = 12; // 12 frames at 60 FPS = 200ms
        this.B2B_MULTIPLIER = 1.5; // Back-to-back glows last 50% longer
        this.enabled = true;
        this.intensityMultiplier = 1.0;
    }
    /**
     * Enable or disable the glow system
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.glows.clear();
        }
    }
    /**
     * Set global intensity multiplier (0.0-1.0)
     */
    setIntensityMultiplier(multiplier) {
        this.intensityMultiplier = Math.max(0, Math.min(1, multiplier));
    }
    /**
     * Add glow for cleared lines
     *
     * @param lines - Array of Y positions being cleared
     * @param type - Clear type: 'normal', 'tspin', or 'tetris'
     * @param centerX - Center X for radial patterns (optional)
     * @param centerY - Center Y for radial patterns (optional)
     */
    addLineClearGlow(lines, type, centerX, centerY) {
        if (!this.enabled)
            return;
        // Determine pattern and color based on clear type
        let pattern = 'linear';
        let color = 'white';
        if (type === 'tspin') {
            pattern = 'manhattan'; // Diamond pattern for T-spins
            color = 'magenta';
        }
        else if (type === 'tetris') {
            pattern = 'linear'; // Uniform glow for Tetris
            color = 'yellow';
        }
        // Add glow to all cells in cleared lines
        for (const y of lines) {
            for (let x = 0; x < 10; x++) { // Standard Tetris board width
                const key = `${x},${y}`;
                const existing = this.glows.get(key);
                // If cell already has glow, keep the stronger one
                if (existing && existing.timer < this.BASE_DURATION * 0.5) {
                    continue; // Don't override recent glow
                }
                this.glows.set(key, {
                    x,
                    y,
                    timer: this.BASE_DURATION,
                    intensity: 1.0,
                    type: 'primary',
                    pattern,
                    centerX,
                    centerY,
                    color
                });
            }
        }
    }
    /**
     * Add glow for locked piece (combo/T-spin radial patterns)
     *
     * @param cells - Array of {x, y} cell positions
     * @param isCombo - Whether this is a combo (uses Euclidean pattern)
     * @param isTSpin - Whether this is a T-spin (uses Manhattan pattern)
     */
    addLockGlow(cells, isCombo, isTSpin) {
        if (!this.enabled)
            return;
        // Calculate center point for radial patterns
        let centerX = 0;
        let centerY = 0;
        for (const cell of cells) {
            centerX += cell.x;
            centerY += cell.y;
        }
        centerX /= cells.length;
        centerY /= cells.length;
        // Determine pattern and color
        let pattern = 'linear';
        let color = 'white';
        if (isTSpin) {
            pattern = 'manhattan'; // Diamond pattern for T-spins
            color = 'magenta';
        }
        else if (isCombo) {
            pattern = 'euclidean'; // Circular pattern for combos
            color = 'cyan';
        }
        // Add glow to locked cells
        for (const cell of cells) {
            const key = `${cell.x},${cell.y}`;
            this.glows.set(key, {
                x: cell.x,
                y: cell.y,
                timer: this.BASE_DURATION,
                intensity: 1.0,
                type: 'primary',
                pattern,
                centerX,
                centerY,
                color
            });
        }
    }
    /**
     * Add back-to-back bonus glow (secondary glow layer)
     *
     * @param cells - Array of {x, y} cell positions
     */
    addBackToBackGlow(cells) {
        if (!this.enabled)
            return;
        const duration = this.BASE_DURATION * this.B2B_MULTIPLIER;
        for (const cell of cells) {
            const key = `b2b_${cell.x},${cell.y}`;
            this.glows.set(key, {
                x: cell.x,
                y: cell.y,
                timer: duration,
                intensity: 1.0,
                type: 'b2b',
                pattern: 'linear',
                color: 'white'
            });
        }
    }
    /**
     * Update all glow timers
     *
     * Call this every frame (60 FPS). Removes expired glows.
     *
     * @param deltaTime - Time since last update in milliseconds
     */
    update(deltaTime) {
        if (!this.enabled)
            return;
        // Convert deltaTime (ms) to frames at 60 FPS
        const deltaFrames = (deltaTime / 1000) * 60;
        // Update all glows and remove expired ones
        const toRemove = [];
        for (const [key, glow] of this.glows.entries()) {
            glow.timer -= deltaFrames;
            if (glow.timer <= 0) {
                toRemove.push(key);
            }
            else {
                // Update intensity based on timer (linear fade)
                const maxTimer = glow.type === 'b2b'
                    ? this.BASE_DURATION * this.B2B_MULTIPLIER
                    : this.BASE_DURATION;
                glow.intensity = glow.timer / maxTimer;
            }
        }
        // Remove expired glows
        for (const key of toRemove) {
            this.glows.delete(key);
        }
    }
    /**
     * Get glow intensity for a specific cell
     *
     * Combines primary and back-to-back glow if both present.
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @returns Intensity value (0.0-1.0), or 0 if no glow
     */
    getGlowIntensity(x, y) {
        if (!this.enabled)
            return 0;
        const primaryKey = `${x},${y}`;
        const b2bKey = `b2b_${x},${y}`;
        const primary = this.glows.get(primaryKey);
        const b2b = this.glows.get(b2bKey);
        let intensity = 0;
        // Primary glow
        if (primary) {
            const radialIntensity = this.calculateRadialIntensity(primary, x, y);
            intensity = Math.max(intensity, primary.intensity * radialIntensity);
        }
        // Back-to-back bonus glow (additive)
        if (b2b) {
            intensity = Math.min(1.0, intensity + (b2b.intensity * 0.3));
        }
        return intensity * this.intensityMultiplier;
    }
    /**
     * Get glow color for a specific cell
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @returns Color string (e.g., 'yellow', 'magenta', 'cyan'), or null if no glow
     */
    getGlowColor(x, y) {
        if (!this.enabled)
            return null;
        const primaryKey = `${x},${y}`;
        const primary = this.glows.get(primaryKey);
        if (primary && primary.intensity > 0) {
            return primary.color;
        }
        return null;
    }
    /**
     * Calculate radial intensity based on distance from center
     *
     * @param glow - Glow data with pattern and center coordinates
     * @param x - Target cell X
     * @param y - Target cell Y
     * @returns Intensity multiplier (0.0-1.0)
     */
    calculateRadialIntensity(glow, x, y) {
        if (glow.pattern === 'linear') {
            return 1.0; // No distance falloff
        }
        if (glow.centerX === undefined || glow.centerY === undefined) {
            return 1.0; // No center defined, treat as linear
        }
        if (glow.pattern === 'manhattan') {
            // Diamond pattern (T-spins)
            const distance = Math.abs(x - glow.centerX) + Math.abs(y - glow.centerY);
            return Math.max(0, 1 - distance / 8); // Fade over 8 cells
        }
        else if (glow.pattern === 'euclidean') {
            // Circular pattern (combos)
            const dx = x - glow.centerX;
            const dy = y - glow.centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return Math.max(0, 1 - distance / 6); // Fade over 6 cells
        }
        return 1.0;
    }
    /**
     * Clear all glows (useful for game reset)
     */
    clear() {
        this.glows.clear();
    }
    /**
     * Get count of active glows (for debugging/monitoring)
     */
    getActiveGlowCount() {
        return this.glows.size;
    }
    /**
     * Check if a cell has any glow
     */
    hasGlow(x, y) {
        const primaryKey = `${x},${y}`;
        const b2bKey = `b2b_${x},${y}`;
        return this.glows.has(primaryKey) || this.glows.has(b2bKey);
    }
}
exports.BlockGlowManager = BlockGlowManager;
//# sourceMappingURL=block-glow.js.map