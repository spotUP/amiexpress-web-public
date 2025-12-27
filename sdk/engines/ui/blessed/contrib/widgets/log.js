"use strict";
/**
 * Log Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/log.js
 * Scrollable log viewer with buffer management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Log = void 0;
exports.log = log;
const element_1 = require("../../core/element");
/**
 * Log Widget
 * Displays scrolling log messages with automatic buffer management
 * Unlike List, Log doesn't add selection markers to preserve text width
 */
class Log extends element_1.Element {
    constructor(options = {}) {
        super({
            scrollable: true,
            focusable: true,
            mouse: true,
            wrap: true, // Enable word wrapping
            ...options,
        });
        this.logLines = [];
        this.options.bufferLength = this.options.bufferLength || 30;
    }
    log(str) {
        this.logLines.push(str);
        if (this.logLines.length > this.options.bufferLength) {
            this.logLines.shift();
        }
        this._updateContent();
        this.scrollTo(this.logLines.length);
    }
    _updateContent() {
        // Join lines without adding markers - preserve full width for text
        this.setContent(this.logLines.join('\n'));
    }
    setItems(items) {
        this.logLines = items;
        this._updateContent();
    }
    scrollTo(line) {
        // Calculate scroll position to show the specified line
        const pos = this._getCoords();
        if (!pos)
            return;
        const border = this.options.border ? 1 : 0;
        const height = pos.yl - pos.yi - border * 2;
        const maxScroll = Math.max(0, this.logLines.length - height);
        const targetScroll = Math.min(line, maxScroll);
        this.setScroll(targetScroll);
    }
    get type() {
        return 'log';
    }
}
exports.Log = Log;
/**
 * Factory function
 */
function log(options = {}) {
    return new Log(options);
}
