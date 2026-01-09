/**
 * Checkbox - Boolean toggle widget for forms
 *
 * Responsive features:
 * - Touch-friendly height on mobile (min 3 rows)
 * - Full-row clickable area
 * - Visual tap feedback
 */
import { Box } from './box';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';
export class Checkbox extends Box {
    constructor(options = {}) {
        const baseStyle = options.style || {};
        const focusStyle = {
            fg: 'black',
            bg: 'yellow',
            ...(baseStyle.focus || {}),
        };
        const hoverStyle = {
            fg: 'black',
            bg: 'cyan',
            ...(baseStyle.hover || {}),
        };
        super({
            ...options,
            focusable: true,
            clickable: true,
            touchFriendly: true, // Enable touch-friendly sizing
            height: options.height || 1,
            width: options.width || (options.text ? options.text.length + 4 : 3),
            style: {
                ...baseStyle,
                focus: focusStyle,
                hover: hoverStyle,
            },
        });
        this._checked = false;
        this._checked = options.checked || false;
        this._text = options.text || '';
        this.checkChar = options.checkChar || 'X';
        this.uncheckChar = options.uncheckChar || ' ';
        this._tapFeedback = options.tapFeedback !== false;
        this._desktopHeight = options.height || 1;
        this._mobileHeight = options.mobileHeight ?? MIN_TOUCH_HEIGHT;
        this.enableMouse();
        this.enableKeys();
        // Update display
        this.updateContent();
        // Toggle on click
        this.on('click', () => {
            this.toggle();
        });
        // Toggle on space/enter
        this.key(['space', 'enter'], () => {
            this.toggle();
            return true;
        });
        // Focus/blur handlers
        this.on('focus', () => {
            this.screen?.render();
        });
        this.on('blur', () => {
            this.screen?.render();
        });
    }
    /**
     * Update checkbox display
     */
    updateContent() {
        const checkbox = `[${this._checked ? this.checkChar : this.uncheckChar}]`;
        this.setContent(this._text ? `${checkbox} ${this._text}` : checkbox);
    }
    /**
     * Check the checkbox
     */
    check() {
        if (this._checked)
            return;
        this._checked = true;
        this.updateContent();
        this.emit('check');
        this.emit('change', this._checked);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Uncheck the checkbox
     */
    uncheck() {
        if (!this._checked)
            return;
        this._checked = false;
        this.updateContent();
        this.emit('uncheck');
        this.emit('change', this._checked);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Toggle checkbox state
     */
    toggle() {
        this._showTapFeedback();
        if (this._checked) {
            this.uncheck();
        }
        else {
            this.check();
        }
    }
    /**
     * Get checked state
     */
    isChecked() {
        return this._checked;
    }
    /**
     * Set checked state
     */
    setChecked(checked) {
        if (checked) {
            this.check();
        }
        else {
            this.uncheck();
        }
    }
    /**
     * Get checkbox value (for form compatibility)
     */
    getValue() {
        return this._checked;
    }
    /**
     * Set checkbox value (for form compatibility)
     */
    setValue(value) {
        this.setChecked(value);
    }
    /**
     * Get checkbox text/label
     */
    getText() {
        return this._text;
    }
    /**
     * Set checkbox text/label
     */
    setText(text) {
        this._text = text;
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle breakpoint change - adjust height for touch targets
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        // Call parent handler
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
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
     * Show visual tap feedback
     */
    _showTapFeedback() {
        if (!this._tapFeedback)
            return;
        const currentBg = this.style.bg;
        this.style.bg = 'white';
        if (this.screen)
            this.screen.render();
        setTimeout(() => {
            this.style.bg = currentBg;
            if (this.screen)
                this.screen.render();
        }, 100);
    }
}
