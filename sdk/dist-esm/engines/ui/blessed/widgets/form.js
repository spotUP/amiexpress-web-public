/**
 * Form widget - Container for form elements with focus management
 */
import { Element } from '../core/element';
export class Form extends Element {
    constructor(options = {}) {
        super({
            focusable: true,
            keys: true,
            ...options,
        });
        this.focusableChildren = [];
        this.focusIndex = 0;
        // Key handlers
        if (options.keys !== false) {
            this.on('keypress', this._onKeypress.bind(this));
        }
    }
    _onKeypress(ch, key) {
        if (!this.focused)
            return;
        if (key.name === 'tab') {
            if (key.shift) {
                this.focusPrevious();
            }
            else {
                this.focusNext();
            }
            return;
        }
        if (key.name === 'enter') {
            this.submit();
            return;
        }
        if (key.name === 'escape') {
            this.cancel();
            return;
        }
    }
    append(element) {
        super.append(element);
        this._updateFocusable();
    }
    remove(element) {
        super.remove(element);
        this._updateFocusable();
    }
    _updateFocusable() {
        this.focusableChildren = this.children.filter((child) => child.options.focusable !== false);
    }
    focusNext() {
        if (this.focusableChildren.length === 0)
            return;
        this.focusIndex = (this.focusIndex + 1) % this.focusableChildren.length;
        this.focusableChildren[this.focusIndex].focus();
    }
    focusPrevious() {
        if (this.focusableChildren.length === 0)
            return;
        this.focusIndex = (this.focusIndex - 1 + this.focusableChildren.length) % this.focusableChildren.length;
        this.focusableChildren[this.focusIndex].focus();
    }
    focusFirst() {
        if (this.focusableChildren.length === 0)
            return;
        this.focusIndex = 0;
        this.focusableChildren[0].focus();
    }
    focusLast() {
        if (this.focusableChildren.length === 0)
            return;
        this.focusIndex = this.focusableChildren.length - 1;
        this.focusableChildren[this.focusIndex].focus();
    }
    submit() {
        this.emit('submit');
    }
    cancel() {
        this.emit('cancel');
    }
    reset() {
        this.emit('reset');
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Re-update focusable list in case layout changed
        this._updateFocusable();
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
