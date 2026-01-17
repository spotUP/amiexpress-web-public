"use strict";
/**
 * Log widget - Scrolling log viewer
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Log = void 0;
const element_1 = require("../core/element");
class Log extends element_1.Element {
    constructor(options = {}) {
        super({
            scrollable: true,
            alwaysScroll: true,
            clickable: true,
            mouse: true,
            ...options,
            // Add scrollbar by default (unless explicitly disabled)
            scrollbar: options.scrollbar === undefined || options.scrollbar ? {
                ch: '█',
                track: {
                    ch: '│',
                },
                style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || options.style,
            } : undefined,
        });
        this.scrollback = 1000;
        this.scrollOnInput = false;
        this.scrollback = options.scrollback || 1000;
        this.scrollOnInput = options.scrollOnInput !== false;
        // Mouse wheel scrolling
        this.on('wheelup', () => {
            this.scroll(-1);
        });
        this.on('wheeldown', () => {
            this.scroll(1);
        });
    }
    log(text) {
        this.add(text);
    }
    add(text) {
        const lines = this.getLines();
        lines.push(text);
        // Enforce scrollback limit
        while (lines.length > this.scrollback) {
            lines.shift();
        }
        this.setContent(lines.join('\n'));
        // Auto-scroll to bottom
        if (this.scrollOnInput) {
            this.setScroll(this.getScrollHeight());
        }
        this.emit('log', text);
    }
    clear() {
        this.setContent('');
    }
}
exports.Log = Log;
