"use strict";
/**
 * TetriNET Continuous Effects Manager
 *
 * Manages timed effects that last for a duration or piece count:
 * - Immunity: Protected from specials for 5 seconds
 * - Darkness: Piece preview hidden for 5 seconds
 * - Confusion: Left/right controls reversed for 5 seconds
 * - Mutation: Next 5 pieces are randomized
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContinuousEffectManager = void 0;
exports.isContinuousEffect = isContinuousEffect;
const specials_1 = require("./specials");
/**
 * Check if a special type is a continuous effect
 */
function isContinuousEffect(type) {
    return type === 'immunity' || type === 'darkness' || type === 'confusion' || type === 'mutation';
}
/**
 * Manager for continuous effects
 */
class ContinuousEffectManager {
    constructor() {
        this.activeEffects = new Map();
        this.onEffectStartCallbacks = [];
        this.onEffectEndCallbacks = [];
    }
    /**
     * Start a continuous effect
     */
    startEffect(type, sourcePlayerId) {
        const special = specials_1.SPECIALS[type];
        const effect = {
            type,
            startTime: Date.now(),
            duration: special.duration,
            sourcePlayerId,
        };
        // Mutation uses piece count instead of time
        if (type === 'mutation') {
            effect.piecesRemaining = special.pieceCount; // 5 pieces
        }
        // Replace existing effect of same type (reset timer)
        this.activeEffects.set(type, effect);
        // Notify callbacks
        for (const callback of this.onEffectStartCallbacks) {
            callback(type);
        }
    }
    /**
     * End a continuous effect early
     */
    endEffect(type) {
        if (this.activeEffects.has(type)) {
            this.activeEffects.delete(type);
            // Notify callbacks
            for (const callback of this.onEffectEndCallbacks) {
                callback(type);
            }
        }
    }
    /**
     * Update effects (call every frame)
     * Returns array of effects that just ended
     */
    update() {
        const endedEffects = [];
        const now = Date.now();
        for (const [type, effect] of this.activeEffects) {
            // Check if time-based effect has expired
            if (effect.duration > 0) {
                const elapsed = now - effect.startTime;
                if (elapsed >= effect.duration) {
                    endedEffects.push(type);
                }
            }
            // Mutation with no pieces remaining
            if (type === 'mutation' && effect.piecesRemaining !== undefined && effect.piecesRemaining <= 0) {
                endedEffects.push(type);
            }
        }
        // Remove ended effects
        for (const type of endedEffects) {
            this.activeEffects.delete(type);
            // Notify callbacks
            for (const callback of this.onEffectEndCallbacks) {
                callback(type);
            }
        }
        return endedEffects;
    }
    /**
     * Called when a piece is placed (for Mutation counter)
     */
    onPiecePlaced() {
        const mutation = this.activeEffects.get('mutation');
        if (mutation && mutation.piecesRemaining !== undefined) {
            mutation.piecesRemaining--;
        }
    }
    /**
     * Check if an effect is currently active
     */
    isActive(type) {
        return this.activeEffects.has(type);
    }
    /**
     * Check if player has immunity (blocks incoming specials)
     */
    hasImmunity() {
        return this.isActive('immunity');
    }
    /**
     * Check if player has darkness (hides preview)
     */
    hasDarkness() {
        return this.isActive('darkness');
    }
    /**
     * Check if player has confusion (reversed controls)
     */
    hasConfusion() {
        return this.isActive('confusion');
    }
    /**
     * Check if player has mutation (randomized pieces)
     */
    hasMutation() {
        return this.isActive('mutation');
    }
    /**
     * Get remaining time for an effect (ms)
     */
    getTimeRemaining(type) {
        const effect = this.activeEffects.get(type);
        if (!effect || effect.duration === 0) {
            return 0;
        }
        const elapsed = Date.now() - effect.startTime;
        return Math.max(0, effect.duration - elapsed);
    }
    /**
     * Get remaining pieces for Mutation
     */
    getMutationRemaining() {
        const mutation = this.activeEffects.get('mutation');
        return mutation?.piecesRemaining ?? 0;
    }
    /**
     * Get all active effects
     */
    getActiveEffects() {
        return Array.from(this.activeEffects.values());
    }
    /**
     * Get active effect types
     */
    getActiveEffectTypes() {
        return Array.from(this.activeEffects.keys());
    }
    /**
     * Clear all effects
     */
    clearAll() {
        const types = this.getActiveEffectTypes();
        this.activeEffects.clear();
        for (const type of types) {
            for (const callback of this.onEffectEndCallbacks) {
                callback(type);
            }
        }
    }
    /**
     * Register callback for when effect starts
     */
    onEffectStart(callback) {
        this.onEffectStartCallbacks.push(callback);
        return () => {
            const index = this.onEffectStartCallbacks.indexOf(callback);
            if (index >= 0) {
                this.onEffectStartCallbacks.splice(index, 1);
            }
        };
    }
    /**
     * Register callback for when effect ends
     */
    onEffectEnd(callback) {
        this.onEffectEndCallbacks.push(callback);
        return () => {
            const index = this.onEffectEndCallbacks.indexOf(callback);
            if (index >= 0) {
                this.onEffectEndCallbacks.splice(index, 1);
            }
        };
    }
    /**
     * Get display string for active effects
     */
    getDisplay() {
        const parts = [];
        if (this.hasImmunity()) {
            const remaining = Math.ceil(this.getTimeRemaining('immunity') / 1000);
            parts.push(`{white-fg}IMMUNE(${remaining}s){/white-fg}`);
        }
        if (this.hasDarkness()) {
            const remaining = Math.ceil(this.getTimeRemaining('darkness') / 1000);
            parts.push(`{black-bg}{white-fg}DARK(${remaining}s){/white-fg}{/black-bg}`);
        }
        if (this.hasConfusion()) {
            const remaining = Math.ceil(this.getTimeRemaining('confusion') / 1000);
            parts.push(`{magenta-fg}CONFUSED(${remaining}s){/magenta-fg}`);
        }
        if (this.hasMutation()) {
            const remaining = this.getMutationRemaining();
            parts.push(`{green-fg}MUTATED(${remaining}pc){/green-fg}`);
        }
        return parts.join(' ');
    }
    /**
     * Serialize state
     */
    getState() {
        return this.getActiveEffects();
    }
    /**
     * Load state
     */
    loadState(effects) {
        this.activeEffects.clear();
        for (const effect of effects) {
            if (isContinuousEffect(effect.type)) {
                this.activeEffects.set(effect.type, effect);
            }
        }
    }
}
exports.ContinuousEffectManager = ContinuousEffectManager;
//# sourceMappingURL=continuous-effects.js.map