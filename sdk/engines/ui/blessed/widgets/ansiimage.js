"use strict";
/**
 * ANSIImage - ANSI art display widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANSIImage = void 0;
const box_1 = require("./box");
class ANSIImage extends box_1.Box {
    constructor(options = {}) {
        super({
            ...options,
            width: options.width || 'shrink',
            height: options.height || 'shrink',
            scrollable: options.scrollable !== false,
            tags: false, // Disable tag parsing for ANSI
        });
        this.ansi = '';
        this.animationTimer = null;
        this.animationFrame = 0;
        this.frames = [];
        this.animate = options.animate || false;
        this.animationSpeed = options.animationSpeed || 100;
        if (options.ansi) {
            this.setANSI(options.ansi);
        }
    }
    /**
     * Set ANSI content
     */
    setANSI(ansi) {
        this.ansi = ansi;
        if (this.animate) {
            // Split into frames (assuming frames are separated by form feed)
            this.frames = ansi.split('\f').filter(f => f.trim());
            if (this.frames.length > 0) {
                this.setContent(this.frames[0]);
                this.startAnimation();
            }
        }
        else {
            this.setContent(ansi);
        }
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Load ANSI from file (requires file content to be passed)
     */
    loadANSI(content) {
        this.setANSI(content);
    }
    /**
     * Start animation
     */
    startAnimation() {
        if (this.animationTimer || this.frames.length <= 1)
            return;
        this.animationTimer = setInterval(() => {
            this.animationFrame = (this.animationFrame + 1) % this.frames.length;
            this.setContent(this.frames[this.animationFrame]);
            if (this.screen) {
                this.screen.render();
            }
        }, this.animationSpeed);
    }
    /**
     * Stop animation
     */
    stopAnimation() {
        if (this.animationTimer) {
            clearInterval(this.animationTimer);
            this.animationTimer = null;
        }
    }
    /**
     * Set animation speed (ms per frame)
     */
    setAnimationSpeed(speed) {
        this.animationSpeed = speed;
        if (this.animationTimer) {
            this.stopAnimation();
            this.startAnimation();
        }
    }
    /**
     * Clear ANSI content
     */
    clearImage() {
        this.ansi = '';
        this.frames = [];
        this.setContent('');
        this.stopAnimation();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Destroy and cleanup
     */
    destroy() {
        this.stopAnimation();
        super.destroy();
    }
    /**
     * Get ANSI content
     */
    getANSI() {
        return this.ansi;
    }
    /**
     * Get current frame (for animated ANSI)
     */
    getCurrentFrame() {
        return this.animationFrame;
    }
    /**
     * Get total frames (for animated ANSI)
     */
    getFrameCount() {
        return this.frames.length;
    }
    /**
     * Set specific frame
     */
    setFrame(frame) {
        if (frame >= 0 && frame < this.frames.length) {
            this.animationFrame = frame;
            this.setContent(this.frames[frame]);
            if (this.screen) {
                this.screen.render();
            }
        }
    }
}
exports.ANSIImage = ANSIImage;
