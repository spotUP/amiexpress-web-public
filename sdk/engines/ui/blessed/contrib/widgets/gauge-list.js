"use strict";
/**
 * Gauge List Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/gauge-list.js
 * Multiple gauges displayed in a vertical list
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GaugeList = void 0;
exports.gaugeList = gaugeList;
const canvas_1 = require("./canvas");
/**
 * Gauge List Widget
 * Displays multiple progress gauges in a vertical list
 */
class GaugeList extends canvas_1.Canvas {
    constructor(options = {}) {
        super(options);
        this._pendingGauges = null;
        this.options.stroke = this.options.stroke || 'magenta';
        this.options.fill = this.options.fill || 'white';
        this.options.showLabel = this.options.showLabel !== false;
        this.options.gaugeSpacing = this.options.gaugeSpacing || 0;
        this.options.gaugeHeight = this.options.gaugeHeight || 1;
        // Apply pending gauges or initial gauges once attached
        const applyData = () => {
            if (this._pendingGauges) {
                this._renderGauges(this._pendingGauges);
                this._pendingGauges = null;
            }
            else if (this.options.gauges) {
                this.gauges = this.options.gauges;
                this._renderGauges(this.gauges);
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
        // Calculate canvas size
        let width = widgetWidth - 2;
        let height = widgetHeight;
        // Ensure minimum canvas size
        width = Math.max(4, width);
        height = Math.max(4, height);
        // Round to required multiples (width: 2, height: 4)
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 4) * 4;
        this.canvasSize = { width, height };
    }
    get type() {
        return 'gauge';
    }
    setData() {
        // Empty implementation as in original
    }
    setGauges(gauges) {
        if (!this.ctx) {
            this._pendingGauges = gauges;
            return;
        }
        this._renderGauges(gauges);
    }
    _renderGauges(gauges) {
        if (!this.ctx)
            return;
        const c = this.ctx;
        c.clearRect(0, 0, this.canvasSize.width, this.canvasSize.height);
        for (let i = 0; i < gauges.length; i++) {
            this.setSingleGauge(gauges[i], i);
        }
        // Sync canvas content to element
        this.syncContent();
    }
    setSingleGauge(gauge, offset) {
        const colors = ['green', 'magenta', 'cyan', 'red', 'blue'];
        const stack = gauge.stack;
        const c = this.ctx;
        let leftStart = 3;
        let textLeft = 5;
        c.strokeStyle = 'normal';
        c.fillStyle = 'white';
        c.fillText(offset.toString(), 0, offset * (this.options.gaugeHeight + this.options.gaugeSpacing));
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
            const width = (percent / 100) * (this.canvasSize.width - 5);
            c.fillRect(leftStart, offset * (this.options.gaugeHeight + this.options.gaugeSpacing), width, this.options.gaugeHeight - 1);
            textLeft = width / 2 - 1;
            const textX = leftStart + textLeft;
            if (leftStart + width < textX) {
                c.strokeStyle = 'normal';
            }
            if (gauge.showLabel) {
                c.fillText(percent + '%', textX, 3);
            }
            leftStart += width;
        }
    }
    getOptionsPrototype() {
        return {
            gauges: [{
                    showLabel: true,
                    stack: [{ percent: 10, stroke: 'green' }]
                }]
        };
    }
}
exports.GaugeList = GaugeList;
/**
 * Factory function
 */
function gaugeList(options = {}) {
    return new GaugeList(options);
}
