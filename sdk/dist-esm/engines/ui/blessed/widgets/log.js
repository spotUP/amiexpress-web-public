/**
 * Log widget - Scrolling log viewer
 *
 * Responsive features:
 * - Touch-friendly scrolling on mobile
 */
import { Element } from '../core/element';
export class Log extends Element {
    constructor(options = {}) {
        // Amiga-safe scrollbar: space with bg colors (no Unicode needed)
        let scrollbarConfig;
        if (options.scrollbar && typeof options.scrollbar === 'object') {
            // User provided scrollbar config - merge with Amiga-safe defaults
            scrollbarConfig = {
                ch: options.scrollbar.ch || ' ',
                track: options.scrollbar.track || { ch: ' ', style: { bg: 'black' } },
                style: options.scrollbar.style || { bg: 'cyan' },
            };
        }
        else {
            // No scrollbar config provided - use Amiga-safe defaults
            scrollbarConfig = {
                ch: ' ',
                track: { ch: ' ', style: { bg: 'black' } },
                style: { bg: 'cyan' },
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
        const content = lines.join('\n');
        this.setContent(content);
        // ALWAYS scroll to bottom to show new content (regardless of scrollOnInput setting)
        // Use multiple methods to ensure scroll happens
        const scrollHeight = this.getScrollHeight();
        const maxScroll = Math.max(0, scrollHeight - (this.height || 10));
        // Method 1: setScrollPerc to 100%
        this.setScrollPerc(100);
        // Method 2: setScroll to max
        this.setScroll(maxScroll);
        // Method 3: Set childBase directly (internal scroll position)
        this.childBase = maxScroll;
        this.emit('log', text);
    }
    clear() {
        this.setContent('');
    }
    /**
     * Set content of a specific line by index (for animations)
     * Uses the inherited getLines() from Element
     */
    setLine(index, content) {
        const lines = this.getLines();
        if (index >= 0 && index < lines.length) {
            lines[index] = content;
            this.setContent(lines.join('\n'));
        }
    }
    /**
     * Get the number of lines
     */
    getLineCount() {
        return this.getLines().length;
    }
    /**
     * Get visible range of lines
     */
    getVisibleRange() {
        const childBase = this.childBase || 0;
        const height = this.height || 10;
        return {
            start: childBase,
            end: childBase + height,
        };
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Ensure scroll position is valid after resize
        const scrollHeight = this.getScrollHeight();
        const maxScroll = Math.max(0, scrollHeight - (this.height || 10));
        const currentScroll = this.childBase || 0;
        if (currentScroll > maxScroll) {
            this.setScroll(maxScroll);
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
