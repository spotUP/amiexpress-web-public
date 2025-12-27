"use strict";
/**
 * Sparkline Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/sparkline.js
 * Displays sparkline charts using Unicode sparkline characters
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sparkline = void 0;
exports.sparkline = sparkline;
const box_1 = require("../../widgets/box");
const sparkline_1 = require("../utils/sparkline");
/**
 * Sparkline Widget
 * Displays multiple sparklines with titles
 */
class Sparkline extends box_1.Box {
    constructor(options = {}) {
        options = options || {};
        options.bufferLength = options.bufferLength || 30;
        options.tags = true; // Enable tag parsing for color formatting
        super(options);
        this.options = options;
        this.titleFg = 'white';
        this.on('attach', () => {
            if (this.options.data) {
                this.setData(this.options.data.titles, this.options.data.data);
            }
        });
    }
    /**
     * Set sparkline data
     * @param titles Array of titles for each sparkline
     * @param datasets Array of data arrays for each sparkline
     */
    setData(titles, datasets) {
        let res = '\r\n';
        for (let i = 0; i < titles.length; i++) {
            res +=
                '{bold}{' +
                    this.titleFg +
                    '-fg}' +
                    titles[i] +
                    ':{/' +
                    this.titleFg +
                    '-fg}{/bold}\r\n';
            res += (0, sparkline_1.sparkline)(datasets[i].slice(0, this.width - 2)) + '\r\n\r\n';
        }
        this.setContent(res);
    }
    /**
     * Get default options (for reference/examples)
     */
    getOptionsPrototype() {
        return {
            label: 'Sparkline',
            tags: true,
            border: { type: 'line', fg: 'cyan' },
            width: '50%',
            height: '50%',
            style: { fg: 'blue' },
            data: {
                titles: ['Sparkline1', 'Sparkline2'],
                data: [
                    [10, 20, 30, 20, 50, 70, 60, 30, 35, 38],
                    [40, 10, 40, 50, 20, 30, 20, 20, 19, 40]
                ]
            }
        };
    }
    get type() {
        return 'sparkline';
    }
}
exports.Sparkline = Sparkline;
/**
 * Factory function
 */
function sparkline(options = {}) {
    return new Sparkline(options);
}
