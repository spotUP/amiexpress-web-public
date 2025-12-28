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
        console.log('[Log.add] Adding text:', text.substring(0, 100));
        const lines = this.getLines();
        console.log('[Log.add] Current lines count:', lines.length);
        lines.push(text);
        console.log('[Log.add] After push, lines count:', lines.length);
        // Enforce scrollback limit
        while (lines.length > this.scrollback) {
            lines.shift();
        }
        const content = lines.join('\n');
        console.log('[Log.add] Setting content, length:', content.length);
        this.setContent(content);
        console.log('[Log.add] After setContent, _lines count:', this._lines?.length);
        // ALWAYS scroll to bottom to show new content (regardless of scrollOnInput setting)
        // Use multiple methods to ensure scroll happens
        const scrollHeight = this.getScrollHeight();
        const childBase = this.childBase || 0;
        const maxScroll = Math.max(0, scrollHeight - (this.height || 10));
        console.log('[Log.add] Scroll info - height:', this.height, 'scrollHeight:', scrollHeight, 'childBase:', childBase, 'maxScroll:', maxScroll);
        // Method 1: setScrollPerc to 100%
        this.setScrollPerc(100);
        // Method 2: setScroll to max
        this.setScroll(maxScroll);
        // Method 3: Set childBase directly (internal scroll position)
        this.childBase = maxScroll;
        console.log('[Log.add] After scroll, childBase:', this.childBase);
        this.emit('log', text);
    }
    clear() {
        this.setContent('');
    }
}
