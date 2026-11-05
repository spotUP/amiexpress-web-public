"use strict";
/**
 * Screen Transition System
 *
 * Provides fade, wipe, and slide transitions between screens
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransitionManager = exports.Transition = exports.TRANSITION_PRESETS = void 0;
/**
 * Transition presets
 */
exports.TRANSITION_PRESETS = {
    // Quick fade for mode changes
    quickFade: {
        type: 'fade',
        duration: 200,
        easing: 'ease-out',
    },
    // Slow fade for dramatic moments
    slowFade: {
        type: 'fade',
        duration: 500,
        easing: 'ease-in-out',
    },
    // Wipe for menu transitions
    wipeRight: {
        type: 'wipe',
        duration: 300,
        direction: 'right',
        easing: 'ease-out',
    },
    wipeLeft: {
        type: 'wipe',
        duration: 300,
        direction: 'left',
        easing: 'ease-out',
    },
    // Slide for screen changes
    slideRight: {
        type: 'slide',
        duration: 250,
        direction: 'right',
        easing: 'ease-in-out',
    },
    slideLeft: {
        type: 'slide',
        duration: 250,
        direction: 'left',
        easing: 'ease-in-out',
    },
    // Instant (no transition)
    instant: {
        type: 'none',
        duration: 0,
    },
};
/**
 * Transition instance
 */
class Transition {
    constructor(config, direction = 'out') {
        this.elapsed = 0;
        this.config = config;
        this.direction = direction;
    }
    /**
     * Update transition
     */
    update(deltaTime) {
        this.elapsed += deltaTime;
    }
    /**
     * Get current progress (0-1)
     */
    getProgress() {
        if (this.config.duration === 0) {
            return 1;
        }
        const raw = Math.min(this.elapsed / this.config.duration, 1);
        return this.applyEasing(raw);
    }
    /**
     * Apply easing function to progress
     */
    applyEasing(t) {
        switch (this.config.easing) {
            case 'ease-in':
                return t * t;
            case 'ease-out':
                return t * (2 - t);
            case 'ease-in-out':
                return t < 0.5
                    ? 2 * t * t
                    : -1 + (4 - 2 * t) * t;
            case 'linear':
            default:
                return t;
        }
    }
    /**
     * Get fade alpha (0-1)
     */
    getFadeAlpha() {
        const progress = this.getProgress();
        return this.direction === 'out' ? progress : 1 - progress;
    }
    /**
     * Get wipe position (0-100, percentage of screen)
     */
    getWipePosition() {
        const progress = this.getProgress();
        return this.direction === 'out' ? progress * 100 : (1 - progress) * 100;
    }
    /**
     * Get slide offset (pixels)
     */
    getSlideOffset(screenWidth, screenHeight) {
        const progress = this.getProgress();
        const direction = this.config.direction || 'right';
        let x = 0;
        let y = 0;
        switch (direction) {
            case 'left':
                x = this.direction === 'out'
                    ? -screenWidth * progress
                    : screenWidth * (1 - progress);
                break;
            case 'right':
                x = this.direction === 'out'
                    ? screenWidth * progress
                    : -screenWidth * (1 - progress);
                break;
            case 'up':
                y = this.direction === 'out'
                    ? -screenHeight * progress
                    : screenHeight * (1 - progress);
                break;
            case 'down':
                y = this.direction === 'out'
                    ? screenHeight * progress
                    : -screenHeight * (1 - progress);
                break;
        }
        return { x: Math.round(x), y: Math.round(y) };
    }
    /**
     * Check if transition is complete
     */
    isDone() {
        return this.elapsed >= this.config.duration;
    }
    /**
     * Get transition type
     */
    getType() {
        return this.config.type;
    }
    /**
     * Get transition direction
     */
    getDirection() {
        return this.direction;
    }
}
exports.Transition = Transition;
/**
 * Transition manager
 */
class TransitionManager {
    constructor() {
        this.currentTransition = null;
        this.onComplete = null;
    }
    /**
     * Start a transition
     */
    start(preset, direction = 'out', onComplete) {
        const config = exports.TRANSITION_PRESETS[preset];
        if (!config)
            return;
        this.currentTransition = new Transition(config, direction);
        this.onComplete = onComplete || null;
    }
    /**
     * Start a custom transition
     */
    startCustom(config, direction = 'out', onComplete) {
        this.currentTransition = new Transition(config, direction);
        this.onComplete = onComplete || null;
    }
    /**
     * Update current transition
     */
    update(deltaTime) {
        if (!this.currentTransition)
            return;
        this.currentTransition.update(deltaTime);
        if (this.currentTransition.isDone()) {
            if (this.onComplete) {
                this.onComplete();
            }
            this.currentTransition = null;
            this.onComplete = null;
        }
    }
    /**
     * Get current transition
     */
    getTransition() {
        return this.currentTransition;
    }
    /**
     * Check if transitioning
     */
    isTransitioning() {
        return this.currentTransition !== null;
    }
    /**
     * Stop current transition
     */
    stop() {
        this.currentTransition = null;
        this.onComplete = null;
    }
}
exports.TransitionManager = TransitionManager;
//# sourceMappingURL=transitions.js.map