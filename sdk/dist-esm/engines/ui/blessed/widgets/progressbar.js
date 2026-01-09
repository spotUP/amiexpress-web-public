/**
 * ProgressBar widget - Visual progress indicator
 *
 * Responsive features:
 * - Auto-scales to container on resize
 * - Touch-friendly height on mobile
 */
import { Element } from '../core/element';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';
export class ProgressBar extends Element {
    constructor(options = {}) {
        super({
            border: 'line',
            // Default style: cyan fill on black background for visibility
            style: { bg: 'black', fg: 'cyan' },
            ...options,
        });
        this.filled = 0;
        this.orientation = 'horizontal';
        // Use space character - style.bg provides the fill color (Amiga-safe, no Unicode needed)
        this.ch = ' ';
        this.pch = ' ';
        this._isMobileMode = false;
        this.filled = options.filled || options.value || 0;
        this.orientation = options.orientation || 'horizontal';
        // Space character with background color for Amiga compatibility
        this.ch = options.ch || ' ';
        this.pch = options.pch || ' ';
        this._desktopHeight = options.height;
        this._updateContent();
        // Re-render on resize
        this.on('resize', () => {
            this._updateContent();
        });
    }
    _updateContent() {
        const pos = this._getCoords();
        if (!pos)
            return;
        const padding = this.options.padding || 0;
        const border = this.options.border ? 1 : 0;
        const padLeft = typeof padding === 'number' ? padding : padding.left || 0;
        const padTop = typeof padding === 'number' ? padding : padding.top || 0;
        const padRight = typeof padding === 'number' ? padding : padding.right || 0;
        const padBottom = typeof padding === 'number' ? padding : padding.bottom || 0;
        const width = pos.xl - pos.xi - border * 2 - padLeft - padRight;
        const height = pos.yl - pos.yi - border * 2 - padTop - padBottom;
        // Get fill color from style (default cyan)
        const fillBg = this.options.style?.fg || 'cyan';
        if (this.orientation === 'horizontal') {
            const filledWidth = Math.floor((width * this.filled) / 100);
            // Use blessed tags for filled portion with background color (Amiga-safe)
            const filledPart = filledWidth > 0 ? `{${fillBg}-bg}${this.ch.repeat(filledWidth)}{/${fillBg}-bg}` : '';
            const emptyPart = this.pch.repeat(width - filledWidth);
            this.setContent(filledPart + emptyPart);
        }
        else {
            const filledHeight = Math.floor((height * this.filled) / 100);
            const lines = [];
            for (let i = 0; i < height; i++) {
                if (i < height - filledHeight) {
                    lines.push(this.pch.repeat(width));
                }
                else {
                    // Use blessed tags for filled portion with background color
                    lines.push(`{${fillBg}-bg}${this.ch.repeat(width)}{/${fillBg}-bg}`);
                }
            }
            this.setContent(lines.join('\n'));
        }
    }
    setProgress(percent) {
        this.filled = Math.max(0, Math.min(100, percent));
        this._updateContent();
        this.emit('progress', this.filled);
    }
    getProgress() {
        return this.filled;
    }
    progress(amount) {
        this.setProgress(this.filled + amount);
    }
    reset() {
        this.setProgress(0);
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        if (state.isMobile) {
            this._enterMobileMode();
        }
        else {
            this._exitMobileMode();
        }
        this._updateContent();
    }
    _enterMobileMode() {
        this._isMobileMode = true;
        // Ensure minimum touch-friendly height for horizontal bars
        if (this.orientation === 'horizontal') {
            const currentHeight = typeof this.height === 'number' ? this.height : 1;
            if (currentHeight < MIN_TOUCH_HEIGHT) {
                this.height = MIN_TOUCH_HEIGHT;
            }
        }
        this.emit('enter-mobile');
    }
    _exitMobileMode() {
        this._isMobileMode = false;
        if (this._desktopHeight !== undefined) {
            this.height = this._desktopHeight;
        }
        this.emit('exit-mobile');
    }
}
