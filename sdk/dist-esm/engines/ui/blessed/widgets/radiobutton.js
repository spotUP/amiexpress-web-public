/**
 * RadioButton - Single radio button (usually used within RadioSet)
 *
 * Responsive features:
 * - Touch-friendly height on mobile (min 3 rows)
 * - Visual tap feedback
 */
import { Box } from './box';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';
export class RadioButton extends Box {
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
            touchFriendly: true,
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
        this.checkChar = options.checkChar || 'O';
        this.uncheckChar = options.uncheckChar || ' ';
        this.value = options.value !== undefined ? options.value : this._text;
        this._tapFeedback = options.tapFeedback !== false;
        this._desktopHeight = options.height || 1;
        this._mobileHeight = options.mobileHeight ?? MIN_TOUCH_HEIGHT;
        this.enableMouse();
        this.enableKeys();
        // Update display
        this.updateContent();
        // Select on click
        this.on('click', () => {
            this.select();
        });
        // Select on space/enter
        this.key(['space', 'enter'], () => {
            this.select();
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
     * Update radio button display
     */
    updateContent() {
        const radio = `(${this._checked ? this.checkChar : this.uncheckChar})`;
        this.setContent(this._text ? `${radio} ${this._text}` : radio);
    }
    /**
     * Select this radio button
     */
    select() {
        if (this._checked)
            return;
        this._showTapFeedback();
        this._checked = true;
        this.updateContent();
        this.emit('select');
        this.emit('change', true);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Deselect this radio button
     */
    deselect() {
        if (!this._checked)
            return;
        this._checked = false;
        this.updateContent();
        this.emit('deselect');
        this.emit('change', false);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get selected state
     */
    isSelected() {
        return this._checked;
    }
    /**
     * Set selected state
     */
    setSelected(selected) {
        if (selected) {
            this.select();
        }
        else {
            this.deselect();
        }
    }
    /**
     * Get radio button value
     */
    getValue() {
        return this._checked ? this.value : null;
    }
    /**
     * Get radio button text/label
     */
    getText() {
        return this._text;
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle breakpoint change - adjust height for touch targets
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        if (state.isMobile) {
            this._setMobileHeight();
        }
        else {
            this._setDesktopHeight();
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    _enterMobileMode() {
        this._setMobileHeight();
        this.emit('enter-mobile');
    }
    _exitMobileMode() {
        this._setDesktopHeight();
        this.emit('exit-mobile');
    }
    _setMobileHeight() {
        const currentHeight = typeof this.height === 'number' ? this.height : 1;
        if (currentHeight < this._mobileHeight) {
            this.height = this._mobileHeight;
            if (this.screen)
                this.screen.render();
        }
    }
    _setDesktopHeight() {
        if (this._desktopHeight !== undefined) {
            this.height = this._desktopHeight;
            if (this.screen)
                this.screen.render();
        }
    }
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
