/**
 * Line - Horizontal or vertical line widget
 *
 * Responsive features:
 * - Auto-updates content on resize
 */
import { Box } from './box';
export class Line extends Box {
    constructor(options = {}) {
        const orientation = options.orientation || 'horizontal';
        super({
            ...options,
            width: orientation === 'horizontal' ? options.width || '100%' : options.width || 1,
            height: orientation === 'horizontal' ? options.height || 1 : options.height || '100%',
        });
        this.orientation = orientation;
        this.lineChar = options.ch || this.getLineChar(options.type || 'line');
        this.on('attach', () => {
            this.updateContent();
        });
        if (this.screen) {
            this.updateContent();
        }
    }
    /**
     * Get line character based on type
     */
    getLineChar(type) {
        if (this.orientation === 'horizontal') {
            const chars = {
                line: '─',
                heavy: '━',
                double: '═',
                ascii: '-',
            };
            return chars[type] || chars.line;
        }
        else {
            const chars = {
                line: '│',
                heavy: '┃',
                double: '║',
                ascii: '|',
            };
            return chars[type] || chars.line;
        }
    }
    /**
     * Update line content
     */
    updateContent() {
        if (this.orientation === 'horizontal') {
            const width = this.iwidth || (typeof this.width === 'number' ? this.width : 0);
            this.setContent(this.lineChar.repeat(width));
        }
        else {
            const height = this.iheight || (typeof this.height === 'number' ? this.height : 0);
            const lines = [];
            for (let i = 0; i < height; i++) {
                lines.push(this.lineChar);
            }
            this.setContent(lines.join('\n'));
        }
    }
    /**
     * Set line character
     */
    setChar(ch) {
        this.lineChar = ch;
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Set line type
     */
    setType(type) {
        this.lineChar = this.getLineChar(type);
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        this.updateContent();
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
/**
 * Factory function
 */
export function line(options = {}) {
    return new Line(options);
}
