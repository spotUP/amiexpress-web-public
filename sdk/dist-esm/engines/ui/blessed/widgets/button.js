/**
 * Button widget - Clickable button
 *
 * Responsive features:
 * - Touch-friendly minimum height on mobile (3 rows)
 * - Visual tap feedback (flash effect)
 * - Responsive padding
 */
import { Element } from '../core/element';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';
export class Button extends Element {
    constructor(options = {}) {
        const baseStyle = options.style ?? {};
        const focusStyle = {
            fg: 'black',
            bg: 'yellow',
            ...(baseStyle.focus ?? {}),
        };
        const hoverStyle = {
            fg: 'black',
            bg: 'cyan',
            ...(baseStyle.hover ?? {}),
        };
        super({
            focusable: true,
            clickable: true,
            keys: true,
            border: 'line',
            align: 'center',
            valign: 'middle',
            padding: { left: 1, right: 1, top: 0, bottom: 0 },
            touchFriendly: true, // Enable touch-friendly sizing by default
            ...options,
            style: {
                fg: baseStyle.fg ?? 'white',
                bg: baseStyle.bg ?? 'black',
                ...baseStyle,
                focus: focusStyle,
                hover: hoverStyle,
            },
        });
        this._tapFeedback = options.tapFeedback !== false; // Default: enabled
        this._tapFeedbackDuration = options.tapFeedbackDuration ?? 100;
        this._desktopHeight = options.height;
        this._mobileHeight = options.mobileHeight ?? MIN_TOUCH_HEIGHT;
        this._originalStyle = { ...this.style };
        // Key handlers
        if (options.keys !== false) {
            this.on('keypress', this._onKeypress.bind(this));
        }
        // Mouse handlers
        if (options.mouse !== false) {
            this.on('click', this._onClick.bind(this));
        }
        // Focus/blur handlers - trigger re-render to show focus style
        this.on('focus', () => {
            if (this.screen) {
                this.screen.render();
            }
        });
        this.on('blur', () => {
            if (this.screen) {
                this.screen.render();
            }
        });
    }
    _onKeypress(ch, key) {
        if (!this.focused) {
            return false;
        }
        if (key.name === 'enter' || key.name === 'space') {
            this.press();
            return true;
        }
        return false;
    }
    _onClick() {
        this.press();
    }
    press() {
        // Show tap feedback
        if (this._tapFeedback) {
            this._showTapFeedback();
        }
        this.emit('press');
        this.emit('action');
    }
    /**
     * Show visual tap feedback (flash effect)
     */
    _showTapFeedback() {
        // Save current style
        const currentBg = this.style.bg;
        const currentFg = this.style.fg;
        // Flash with inverted/highlight colors
        this.style.bg = 'white';
        this.style.fg = 'black';
        if (this.screen) {
            this.screen.render();
        }
        // Restore after duration
        setTimeout(() => {
            this.style.bg = currentBg;
            this.style.fg = currentFg;
            if (this.screen) {
                this.screen.render();
            }
        }, this._tapFeedbackDuration);
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle breakpoint change - adjust height
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        // Update height based on breakpoint
        if (state.isMobile) {
            this._setMobileHeight();
        }
        else {
            this._setDesktopHeight();
        }
        // Emit for custom handling
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    /**
     * Called when entering mobile mode - increase height for touch targets
     */
    _enterMobileMode() {
        this._setMobileHeight();
        this.emit('enter-mobile');
    }
    /**
     * Called when exiting mobile mode - restore desktop height
     */
    _exitMobileMode() {
        this._setDesktopHeight();
        this.emit('exit-mobile');
    }
    /**
     * Set mobile-friendly height
     */
    _setMobileHeight() {
        const currentHeight = typeof this.height === 'number' ? this.height : 1;
        if (currentHeight < this._mobileHeight) {
            this.height = this._mobileHeight;
            if (this.screen) {
                this.screen.render();
            }
        }
    }
    /**
     * Restore desktop height
     */
    _setDesktopHeight() {
        if (this._desktopHeight !== undefined) {
            this.height = this._desktopHeight;
            if (this.screen) {
                this.screen.render();
            }
        }
    }
    /**
     * Enable/disable tap feedback
     */
    setTapFeedback(enabled) {
        this._tapFeedback = enabled;
    }
    /**
     * Set tap feedback duration
     */
    setTapFeedbackDuration(duration) {
        this._tapFeedbackDuration = duration;
    }
}
