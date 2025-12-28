/**
 * Log widget - Scrolling log viewer
 */
import { Element } from '../core/element';
export class Log extends Element {
    constructor(options = {}) {
        // Build scrollbar config - preserve user's settings if provided, otherwise use defaults
        let scrollbarConfig;
        if (options.scrollbar && typeof options.scrollbar === 'object') {
            // User provided scrollbar config
            scrollbarConfig = {
                ch: options.scrollbar.ch || '█'
            };
        }
        else {
            // No scrollbar config provided - use defaults
            scrollbarConfig = {
                ch: '█'
            };
        }
        super({
            scrollable: true,
            alwaysScroll: true,
            clickable: true,
            mouse: true,
            ...options,
            scrollbar: scrollbarConfig,
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
