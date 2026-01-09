/**
 * Text widget - Simple text display (no border by default)
 */
import { Element } from '../core/element';
export class Text extends Element {
    constructor(options = {}) {
        super({
            ...options,
            border: options.border !== undefined ? options.border : undefined,
        });
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
