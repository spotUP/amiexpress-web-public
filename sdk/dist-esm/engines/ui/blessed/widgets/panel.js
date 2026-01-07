/**
 * Panel widget - Box with focus group for multi-panel layouts
 *
 * Features:
 * - Visual indication when panel is active (has focused child)
 * - Can be activated with Alt+<number> shortcuts
 * - F6 cycles through panels
 */
import { Box } from './box';
export class Panel extends Box {
    constructor(options = {}) {
        super({
            ...options,
            border: options.border || { type: 'line', fg: 'blue' },
            focusable: true,
            keys: true,
            mouse: true,
            clickable: true, // Enable click events for panel activation
            style: {
                fg: 'white',
                bg: 'black',
                focus: {
                    fg: 'white',
                    bg: 'black',
                },
                ...options.style,
            },
        });
        this._isActive = false;
        this.lastFocusedChild = null;
        this._focusing = false;
        this.panelIndex = options.panelIndex;
        // Set label if title provided
        if (options.title) {
            this.options.label = ` ${options.title} `;
        }
        // Focus panel when clicked anywhere on it (including when children are clicked)
        this.on('click', () => {
            this.focus();
        });
        // Handle focus redirection to last active child
        this.on('focus', () => {
            if (this._focusing)
                return;
            if (this.lastFocusedChild && !this.lastFocusedChild.destroyed && this.lastFocusedChild.visible) {
                this._focusing = true;
                // Use setImmediate/timeout to avoid recursive focus calls during tree walk
                setTimeout(() => {
                    if (this.lastFocusedChild && !this.lastFocusedChild.destroyed) {
                        this.lastFocusedChild.focus();
                    }
                    this._focusing = false;
                }, 0);
            }
        });
        // Track active state based on child focus
        if (this.screen) {
            this.screen.on('element focus', (el) => {
                // Check if focused element is a descendant of this panel
                const isDescendant = this._isDescendantOf(el, this);
                if (isDescendant) {
                    if (el !== this) {
                        this.lastFocusedChild = el;
                    }
                    if (!this._isActive) {
                        this._activate();
                    }
                }
                else if (this._isActive) {
                    this._deactivate();
                }
            });
        }
        // Register Alt+<number> shortcut if panel index is set
        if (this.panelIndex && this.panelIndex >= 1 && this.panelIndex <= 9) {
            const altKey = `M-${this.panelIndex}`; // Alt+1, Alt+2, etc.
            if (this.screen) {
                this.screen.key([altKey], () => {
                    this.activate();
                });
            }
        }
    }
    /**
     * Check if element is a descendant of parent
     */
    _isDescendantOf(element, parent) {
        let current = element;
        while (current) {
            if (current === parent)
                return true;
            current = current.parent;
        }
        return false;
    }
    /**
     * Activate panel (focus first focusable child)
     */
    activate() {
        // Find first focusable child
        const focusable = this._getFirstFocusable(this);
        if (focusable) {
            focusable.focus();
        }
        else {
            // No focusable children, focus the panel itself
            this.focus();
        }
    }
    /**
     * Get first focusable descendant
     */
    _getFirstFocusable(element) {
        if (element.options.focusable && element !== this) {
            return element;
        }
        for (const child of element.children || []) {
            const focusable = this._getFirstFocusable(child);
            if (focusable)
                return focusable;
        }
        return null;
    }
    /**
     * Mark panel as active (internal)
     */
    _activate() {
        if (this._isActive)
            return;
        this._isActive = true;
        // Brighten style when active
        if (this.style) {
            this.style.fg = 'white';
            if (this.style.border)
                this.style.border.fg = 'cyan';
        }
        this.emit('activate');
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Mark panel as inactive (internal)
     */
    _deactivate() {
        if (!this._isActive)
            return;
        this._isActive = false;
        // Dim style when inactive
        if (this.style) {
            this.style.fg = 'gray';
            if (this.style.border)
                this.style.border.fg = 'blue';
        }
        this.emit('deactivate');
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Check if panel is currently active
     */
    isActive() {
        return this._isActive;
    }
}
