"use strict";
/**
 * Canvas Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/canvas.js
 * Provides a canvas widget with Braille-based drawing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Canvas = void 0;
exports.canvas = canvas;
const box_1 = require("../../widgets/box");
const drawille_canvas_1 = require("../utils/drawille-canvas");
/**
 * Canvas Widget
 * Box with Braille-based drawing canvas
 */
class Canvas extends box_1.Box {
    constructor(options = {}) {
        super(options);
        this.options = options;
        // Initialize canvas context when attached
        const initCanvas = () => {
            if (this.ctx)
                return; // Already initialized
            this.calcSize();
            this._canvas = new drawille_canvas_1.Canvas(this.canvasSize.width, this.canvasSize.height);
            this.ctx = this._canvas.getContext();
            if (this.options.data) {
                this.setData(this.options.data);
            }
        };
        // If already attached (parent was specified in options), initialize now
        if (this.screen) {
            initCanvas();
        }
        // Also listen for future attach events
        this.on('attach', initCanvas);
    }
    /**
     * Calculate canvas size based on widget dimensions
     * Braille characters are 2x4 pixels, so we multiply accordingly
     * Width must be multiple of 2, height must be multiple of 4
     */
    calcSize() {
        // Get widget dimensions, ensuring minimum sizes
        const widgetWidth = Math.max(8, this.width);
        const widgetHeight = Math.max(4, this.height);
        // Calculate canvas size
        let width = widgetWidth * 2 - 12;
        let height = widgetHeight * 4;
        // Ensure minimum canvas size
        width = Math.max(4, width);
        height = Math.max(4, height);
        // Round to required multiples (width: 2, height: 4)
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 4) * 4;
        this.canvasSize = { width, height };
    }
    /**
     * Clear the canvas
     */
    clear() {
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvasSize.width, this.canvasSize.height);
        }
    }
    /**
     * Set data (override in subclasses)
     */
    setData(data) {
        // Override in subclasses
    }
    /**
     * Sync canvas content to element content
     * Call this after drawing operations to make content visible
     */
    syncContent() {
        if (this.ctx) {
            const frame = this.ctx._canvas.frame();
            super.setContent(frame);
        }
    }
    /**
     * Render the canvas
     */
    render() {
        if (!this.ctx)
            return super.render();
        this.syncContent();
        return super.render();
    }
}
exports.Canvas = Canvas;
/**
 * Factory function
 */
function canvas(options = {}) {
    return new Canvas(options);
}
