"use strict";
/**
 * Image - Browser-compatible image display widget
 * Note: Uses data URLs or external image sources
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Image = void 0;
const box_1 = require("./box");
class Image extends box_1.Box {
    constructor(options = {}) {
        const { src, file, type, scale, autoPlay, ...boxOptions } = options;
        super({
            ...boxOptions,
            width: options.width || 'shrink',
            height: options.height || 'shrink',
        });
        this.src = '';
        this.imageData = '';
        this.imageType = type || 'overlay';
        this.scale = scale || 1.0;
        this.autoPlay = autoPlay !== false;
        if (src) {
            this.setImage(src);
        }
        else if (file) {
            this.setImage(file);
        }
    }
    /**
     * Set image source (URL or data URL)
     */
    setImage(src) {
        this.src = src;
        this.emit('load', src);
        // For browser compatibility, we display ASCII representation
        // Real image rendering would require canvas integration
        const placeholder = this.generatePlaceholder();
        this.setContent(placeholder);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Generate ASCII placeholder for image
     */
    generatePlaceholder() {
        const w = typeof this.width === 'number' ? this.width : 40;
        const h = typeof this.height === 'number' ? this.height : 10;
        const lines = [];
        lines.push('┌' + '─'.repeat(w - 2) + '┐');
        for (let i = 0; i < h - 4; i++) {
            lines.push('│' + ' '.repeat(w - 2) + '│');
        }
        // Add image info in center
        const info = `[Image: ${this.src.substring(0, w - 10)}]`;
        const padding = Math.floor((w - info.length) / 2);
        lines.push('│' + ' '.repeat(padding) + info + ' '.repeat(w - 2 - padding - info.length) + '│');
        lines.push('└' + '─'.repeat(w - 2) + '┘');
        return lines.join('\n');
    }
    /**
     * Load image from data URL
     */
    loadImage(dataUrl) {
        this.imageData = dataUrl;
        this.setImage(dataUrl);
    }
    /**
     * Clear image
     */
    clearImage() {
        this.src = '';
        this.imageData = '';
        this.setContent('');
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get image source
     */
    getImage() {
        return this.src;
    }
    /**
     * Set image scale
     */
    setScale(scale) {
        this.scale = Math.max(0.1, Math.min(10.0, scale));
        this.setImage(this.src);
    }
    /**
     * Get image scale
     */
    getScale() {
        return this.scale;
    }
    /**
     * Play animation (for animated images)
     */
    play() {
        this.autoPlay = true;
        this.emit('play');
    }
    /**
     * Pause animation
     */
    pause() {
        this.autoPlay = false;
        this.emit('pause');
    }
    /**
     * Check if playing
     */
    isPlaying() {
        return this.autoPlay;
    }
    /**
     * Get image dimensions (placeholder)
     */
    getImageSize() {
        return {
            width: typeof this.width === 'number' ? this.width : 0,
            height: typeof this.height === 'number' ? this.height : 0,
        };
    }
}
exports.Image = Image;
