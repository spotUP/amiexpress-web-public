"use strict";
/**
 * Gauge Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/gauge.js
 * Progress bar gauge with single percent or stacked segments
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gauge = void 0;
exports.gauge = gauge;
const canvas_1 = require("./canvas");
/**
 * Gauge Widget
 * Displays progress bars with percentage labels
 */
class Gauge extends canvas_1.Canvas {
    constructor(options = {}) {
        super(options);
        this._pendingPercent = null;
        this._pendingStack = null;
        this.options.stroke = this.options.stroke || 'magenta';
        this.options.fill = this.options.fill || 'white';
        this.options.showLabel = this.options.showLabel !== false;
        // Apply pending data first, then options data
        const applyData = () => {
            if (this._pendingStack) {
                this._renderStack(this._pendingStack);
                this._pendingStack = null;
            }
            else if (this._pendingPercent !== null) {
                this._renderPercent(this._pendingPercent);
                this._pendingPercent = null;
            }
            else if (this.options.stack) {
                this.stack = this.options.stack;
                this._renderStack(this.stack);
            }
            else if (this.options.percent !== undefined) {
                this.percent = this.options.percent;
                this._renderPercent(this.percent);
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
        // Get widget dimensions with minimums
        const widgetWidth = Math.max(8, this.width);
        const widgetHeight = Math.max(4, this.height);
        // Calculate canvas size (gauge uses text-like coordinates, so multiply by braille factors)
        let width = widgetWidth * 2 - 4;
        let height = widgetHeight * 4;
        // Ensure minimum canvas size for gauge bar (needs y=2 + height=2)
        width = Math.max(8, width);
        height = Math.max(8, height);
        // Round to required multiples (width: 2, height: 4) for braille mapping
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 4) * 4;
        this.canvasSize = { width, height };
    }
    get type() {
        return 'gauge';
    }
    setData(data) {
        if (Array.isArray(data) && data.length > 0) {
            this.setStack(data);
        }
        else if (typeof data === 'number') {
            this.setPercent(data);
        }
    }
    setPercent(percent) {
        if (!this.ctx) {
            this._pendingPercent = percent;
            return;
        }
        this._renderPercent(percent);
    }
    _renderPercent(percent) {
        if (!this.ctx)
            return;
        const c = this.ctx;
        c.strokeStyle = this.options.stroke;
        c.fillStyle = this.options.fill;
        c.clearRect(0, 0, this.canvasSize.width, this.canvasSize.height);
        let adjustedPercent = percent;
        if (percent < 1.001) {
            adjustedPercent = percent * 100;
        }
        const width = (adjustedPercent / 100) * (this.canvasSize.width - 3);
        c.fillRect(1, 2, width, 2);
        let textX = 7;
        if (width < textX) {
            c.strokeStyle = 'normal';
        }
        if (this.options.showLabel) {
            c.fillText(Math.round(adjustedPercent) + '%', textX, 3);
        }
        // Sync canvas content to element
        this.syncContent();
    }
    setStack(stack) {
        if (!this.ctx) {
            this._pendingStack = stack;
            return;
        }
        this._renderStack(stack);
    }
    _renderStack(stack) {
        if (!this.ctx)
            return;
        const colors = ['green', 'magenta', 'cyan', 'red', 'blue'];
        const c = this.ctx;
        let leftStart = 1;
        let textLeft = 5;
        c.clearRect(0, 0, this.canvasSize.width, this.canvasSize.height);
        for (let i = 0; i < stack.length; i++) {
            const currentStack = stack[i];
            let percent;
            if (typeof currentStack === 'object') {
                percent = currentStack.percent;
            }
            else {
                percent = currentStack;
            }
            c.strokeStyle =
                (typeof currentStack === 'object' ? currentStack.stroke : undefined) ||
                    colors[i % colors.length];
            c.fillStyle = this.options.fill;
            textLeft = 5;
            if (percent < 1.001) {
                percent = percent * 100;
            }
            const width = (percent / 100) * (this.canvasSize.width - 3);
            c.fillRect(leftStart, 2, width, 2);
            textLeft = width / 2 - 1;
            const textX = leftStart + textLeft;
            if (leftStart + width < textX) {
                c.strokeStyle = 'normal';
            }
            if (this.options.showLabel) {
                c.fillText(percent + '%', textX, 3);
            }
            leftStart += width;
        }
        // Sync canvas content to element
        this.syncContent();
    }
    getOptionsPrototype() {
        return { percent: 10 };
    }
}
exports.Gauge = Gauge;
/**
 * Factory function
 */
function gauge(options = {}) {
    return new Gauge(options);
}
