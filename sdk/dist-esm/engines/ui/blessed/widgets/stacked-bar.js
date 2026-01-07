/**
 * Stacked Bar Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/stacked-bar.js
 * Vertical stacked bar chart with legend
 */
import { ContribCanvas as Canvas } from './contrib-canvas';
import { Box } from './box';
import * as utils from '../utils/contrib-utils/utils';
/**
 * Stacked Bar Chart Widget
 * Displays vertical stacked bars with legend
 */
export class StackedBar extends Canvas {
    constructor(options = {}) {
        super(options);
        this._pendingData = null;
        const self = this; // Cast to access base properties like screen, on, append, remove
        this.options.barWidth = this.options.barWidth || 6;
        this.options.barSpacing = this.options.barSpacing || 9;
        this.options.barBgColor = this.options.barBgColor || [
            'green', 'magenta', 'cyan', 'red', 'blue', 'yellow', 'white'
        ];
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
        this.options.legend = this.options.legend || {};
        if (this.options.showLegend === false) {
            this.options.showLegend = false;
        }
        else {
            this.options.showLegend = true;
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
        if (self.screen && this.ctx) {
            applyData();
        }
        // Also listen for future attach events
        self.on('attach', applyData);
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
    getSummedBars(bars) {
        const res = [];
        bars.forEach(function (stackedValues) {
            const sum = stackedValues.reduce(function (a, b) {
                return a + b;
            }, 0);
            res.push(sum);
        });
        return res;
    }
    setData(bars) {
        if (!this.ctx) {
            // Defer rendering until attached to screen
            this._pendingData = bars;
            return;
        }
        this._renderData(bars);
    }
    _renderData(bars) {
        if (!this.ctx)
            return;
        this.clear();
        const summedBars = this.getSummedBars(bars.data);
        let maxBarValue = Math.max(...summedBars);
        if (this.options.maxValue) {
            maxBarValue = Math.max(maxBarValue, this.options.maxValue);
        }
        let x = this.options.xOffset;
        for (let i = 0; i < bars.data.length; i++) {
            this.renderBar(x, bars.data[i], summedBars[i], maxBarValue, bars.barCategory[i]);
            x += this.options.barSpacing;
        }
        this.addLegend(bars, x);
        // Sync canvas content to element
        this.syncContent();
    }
    renderBar(x, bar, curBarSummedValue, maxBarValue, category) {
        // First line is for label
        const BUFFER_FROM_TOP = 2;
        const BUFFER_FROM_BOTTOM = (this.options.border ? 2 : 0) + (this.options.showText ? 1 : 0);
        const c = this.ctx;
        c.strokeStyle = 'normal';
        c.fillStyle = 'white';
        if (this.options.labelColor) {
            c.fillStyle = this.options.labelColor;
        }
        if (this.options.showText) {
            c.fillText(category, x + 1, this.canvasSize.height - BUFFER_FROM_BOTTOM);
        }
        if (curBarSummedValue < 0)
            return;
        const maxBarHeight = this.canvasSize.height - BUFFER_FROM_TOP - BUFFER_FROM_BOTTOM;
        const currentBarHeight = Math.round(maxBarHeight * (curBarSummedValue / maxBarValue));
        // Start painting from bottom of bar, section by section
        let y = maxBarHeight + BUFFER_FROM_TOP;
        let availableBarHeight = currentBarHeight;
        for (let i = 0; i < bar.length; i++) {
            const currStackHeight = this.renderBarSection(x, y, bar[i], curBarSummedValue, currentBarHeight, availableBarHeight, this.options.barBgColor[i]);
            y -= currStackHeight;
            availableBarHeight -= currStackHeight;
        }
    }
    renderBarSection(x, y, data, curBarSummedValue, currentBarHeight, availableBarHeight, bg) {
        const c = this.ctx;
        const currStackHeight = currentBarHeight <= 0
            ? 0
            : Math.min(availableBarHeight, // round() can make total stacks exceed curr bar height so we limit it
            Math.round(currentBarHeight * (data / curBarSummedValue)));
        c.strokeStyle = bg;
        if (currStackHeight > 0) {
            const calcY = y - currStackHeight;
            // fillRect starts from the point bottom of start point so we compensate
            const calcHeight = Math.max(0, currStackHeight - 1);
            c.fillRect(x, calcY, this.options.barWidth, calcHeight);
            c.fillStyle = 'white';
            if (this.options.barFgColor) {
                c.fillStyle = this.options.barFgColor;
            }
            if (this.options.showText) {
                const str = String(utils.abbreviateNumber(data));
                c.fillText(str, Math.floor(x + this.options.barWidth / 2 + str.length / 2), calcY + Math.round(calcHeight / 2));
            }
        }
        return currStackHeight;
    }
    addLegend(bars, x) {
        const self = this;
        if (!this.options.showLegend)
            return;
        if (this.legend)
            self.remove(this.legend);
        const legendWidth = this.options.legend.width || 15;
        this.legend = new Box({
            height: bars.stackedCategory.length + 2,
            top: 1,
            width: legendWidth,
            left: x,
            content: '',
            tags: true,
            border: {
                type: 'line',
                fg: 'black'
            },
            style: {
                fg: 'green'
            },
            screen: self.screen
        });
        let legendText = '';
        const maxChars = legendWidth - 2;
        for (let i = 0; i < bars.stackedCategory.length; i++) {
            const color = utils.getColorCode(this.options.barBgColor[i]);
            legendText +=
                '{' +
                    color +
                    '-fg}' +
                    bars.stackedCategory[i].substring(0, maxChars) +
                    '{/' +
                    color +
                    '-fg}\r\n';
        }
        this.legend.setContent(legendText);
        self.append(this.legend);
    }
    getOptionsPrototype() {
        return {
            barWidth: 1,
            barSpacing: 1,
            xOffset: 1,
            maxValue: 1,
            barBgColor: ['s'],
            data: {
                barCategory: ['s'],
                stackedCategory: ['s'],
                data: [[1]]
            }
        };
    }
    get type() {
        return 'bar';
    }
}
/**
 * Factory function
 */
export function stackedBar(options = {}) {
    return new StackedBar(options);
}
