/**
 * Box widget - Basic container with border support
 *
 * Responsive features:
 * - Breakpoint-aware padding (larger on desktop, smaller on mobile)
 * - Auto-resize handling
 * - Child layout recalculation on resize
 */
import { Element } from '../core/element';
import { MOBILE_PADDING, DEFAULT_PADDING } from '../core/responsive-constants';
export class Box extends Element {
    constructor(options = {}) {
        super(options);
        // Store responsive padding config
        if (options.responsivePadding) {
            this._responsivePadding = options.responsivePadding;
            this._originalPadding = options.padding;
        }
    }
    /**
     * Handle resize - update padding based on breakpoint
     */
    _handleResize(width, height, state) {
        // Apply responsive padding if configured
        if (this._responsivePadding) {
            this._applyResponsivePadding(state.breakpoint);
        }
        // Notify children of resize
        this._notifyChildrenResize(width, height);
    }
    /**
     * Handle breakpoint change
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        // Apply responsive padding
        if (this._responsivePadding) {
            this._applyResponsivePadding(breakpoint);
        }
        // Emit event for custom handling
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    /**
     * Apply padding based on breakpoint
     */
    _applyResponsivePadding(breakpoint) {
        if (!this._responsivePadding)
            return;
        let newPadding;
        // Try to get breakpoint-specific padding, fall back to smaller breakpoints
        switch (breakpoint) {
            case 'large':
                newPadding = this._responsivePadding.large ??
                    this._responsivePadding.medium ??
                    this._responsivePadding.small ??
                    this._responsivePadding.xs ??
                    this._originalPadding;
                break;
            case 'medium':
                newPadding = this._responsivePadding.medium ??
                    this._responsivePadding.small ??
                    this._responsivePadding.xs ??
                    this._originalPadding;
                break;
            case 'small':
                newPadding = this._responsivePadding.small ??
                    this._responsivePadding.xs ??
                    this._originalPadding;
                break;
            case 'xs':
                newPadding = this._responsivePadding.xs ?? this._originalPadding;
                break;
        }
        if (newPadding !== undefined) {
            this.options.padding = newPadding;
            // Trigger re-render to apply new padding
            if (this.screen) {
                this.screen.render();
            }
        }
    }
    /**
     * Notify all children of resize event
     */
    _notifyChildrenResize(width, height) {
        for (const child of this.children) {
            // Call child's resize handler if it exists
            if (typeof child._handleResize === 'function') {
                const state = this.getResponsiveState();
                if (state) {
                    child._handleResize(width, height, state);
                }
            }
        }
    }
    /**
     * Set responsive padding configuration
     */
    setResponsivePadding(config) {
        this._responsivePadding = config;
        // Apply immediately if we have responsive state
        const state = this.getResponsiveState();
        if (state) {
            this._applyResponsivePadding(state.breakpoint);
        }
    }
    /**
     * Get current effective padding
     */
    getEffectivePadding() {
        return this.options.padding ?? 0;
    }
    /**
     * Helper to get default responsive padding (mobile-aware)
     */
    static getDefaultResponsivePadding() {
        return {
            xs: MOBILE_PADDING,
            small: MOBILE_PADDING,
            medium: DEFAULT_PADDING,
            large: DEFAULT_PADDING,
        };
    }
}
