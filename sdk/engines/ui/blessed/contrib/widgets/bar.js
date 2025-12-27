"use strict";
/**
 * Bar Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/bar.js
 * Vertical bar chart with labels
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bar = void 0;
exports.bar = bar;
const canvas_1 = require("./canvas");
/**
 * Bar Chart Widget
 * Displays vertical bars with labels and values
 */
class Bar extends canvas_1.Canvas {
    constructor(options = {}) {
        super(options);
        this._pendingData = null;
        this.options.barWidth = this.options.barWidth || 6;
        this.options.barSpacing = this.options.barSpacing || 9;
        if (this.options.barSpacing - this.options.barWidth < 3) {
            this.options.barSpacing = this.options.barWidth + 3;
        }
        this.options.xOffset = this.options.xOffset == null ? 5 : this.options.xOffset;
        if (this.options.showText === false) {
            this.options.showText = false;
        }
        else {
            this.options.showText = true;
        }
        // Apply pending data or initial data once attached
        const applyData = () => {
            if (this._pendingData) {
                this._renderData(this._pendingData);
                this._pendingData = null;
            }
            else if (this.options.data) {
                this._renderData(this.options.data);
            }
        };
        // If already attached (parent was specified in options), apply data now
        if (this.screen && this.ctx) {
            applyData();
        }
        // Also listen for future attach events
        this.on('attach', applyData);
    }
    calcSize() {
        // Get widget dimensions, ensuring minimum sizes
        const widgetWidth = Math.max(8, this.width);
        const widgetHeight = Math.max(4, this.height);
        // Calculate canvas size with braille multipliers
        // Each terminal cell = 2 braille pixels wide, 4 braille pixels tall
        let width = (widgetWidth - 2) * 2;
        let height = widgetHeight * 4;
        // Ensure minimum canvas size for bar rendering
        width = Math.max(16, width);
        height = Math.max(16, height);
        // Round to required multiples (width: 2, height: 4) for braille mapping
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 4) * 4;
        this.canvasSize = { width, height };
    }
    setData(bar) {
        if (!this.ctx) {
            // Defer rendering until attached to screen
            this._pendingData = bar;
            return;
        }
        this._renderData(bar);
    }
    _renderData(bar) {
        if (!this.ctx)
            return;
        this.clear();
        const c = this.ctx;
        let max = Math.max(...bar.data);
        max = Math.max(max, this.options.maxHeight || 0);
        let x = this.options.xOffset;
        const barY = this.canvasSize.height - 5;
        for (let i = 0; i < bar.data.length; i++) {
            const h = Math.round(barY * (bar.data[i] / max));
            if (bar.data[i] > 0) {
                c.strokeStyle = 'blue';
                if (this.options.barBgColor) {
                    c.strokeStyle = this.options.barBgColor;
                }
                c.fillRect(x, barY - h + 1, this.options.barWidth, h);
            }
            else {
                c.strokeStyle = 'normal';
            }
            c.fillStyle = 'white';
            if (this.options.barFgColor) {
                c.fillStyle = this.options.barFgColor;
            }
            if (this.options.showText) {
                c.fillText(bar.data[i].toString(), x + 1, this.canvasSize.height - 4);
            }
            c.strokeStyle = 'normal';
            c.fillStyle = 'white';
            if (this.options.labelColor) {
                c.fillStyle = this.options.labelColor;
            }
            if (this.options.showText) {
                c.fillText(bar.titles[i], x + 1, this.canvasSize.height - 3);
            }
            x += this.options.barSpacing;
        }
        // Sync canvas content to element
        this.syncContent();
    }
    getOptionsPrototype() {
        return {
            barWidth: 1,
            barSpacing: 1,
            xOffset: 1,
            maxHeight: 1,
            data: {
                titles: ['s'],
                data: [1]
            }
        };
    }
    get type() {
        return 'bar';
    }
}
exports.Bar = Bar;
/**
 * Factory function
 */
function bar(options = {}) {
    return new Bar(options);
}
