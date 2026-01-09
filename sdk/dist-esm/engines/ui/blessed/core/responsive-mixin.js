/**
 * Responsive Mixin
 *
 * Provides responsive behavior hooks and breakpoint detection
 * that can be mixed into Element-based widgets.
 */
import { getBreakpointName, isMobileWidth, MIN_TOUCH_HEIGHT, enforceMinTouchHeight, } from './responsive-constants';
import { TouchGestureHandler } from './touch-gestures';
// ============================================================================
// Responsive Behavior Mixin
// ============================================================================
/**
 * Mixin class that provides responsive behavior to widgets.
 * Use applyResponsiveMixin() to add these capabilities to an Element.
 */
export class ResponsiveBehavior {
    constructor(element, options = {}) {
        this.breakpointHandlers = new Set();
        this.resizeHandlers = new Set();
        this.initialized = false;
        this.element = element;
        this.options = {
            responsive: true,
            touchFriendly: false,
            swipeEnabled: false,
            ...options,
        };
        // Initialize state with defaults
        this.state = {
            breakpoint: 'large',
            previousBreakpoint: 'large',
            isMobile: false,
            screenWidth: 80,
            screenHeight: 24,
        };
    }
    /**
     * Initialize responsive behavior (call after element is attached to screen)
     */
    initialize() {
        if (this.initialized)
            return;
        if (!this.element.screen)
            return;
        const screen = this.element.screen;
        // Get initial state
        this.state.screenWidth = screen.width || 80;
        this.state.screenHeight = screen.height || 24;
        this.state.breakpoint = getBreakpointName(this.state.screenWidth);
        this.state.previousBreakpoint = this.state.breakpoint;
        this.state.isMobile = isMobileWidth(this.state.screenWidth);
        // Subscribe to resize events via ResponsiveLayoutManager
        if (screen.responsiveLayout && this.options.responsive) {
            this.unsubscribeResize = screen.responsiveLayout.onResize(this.handleScreenResize.bind(this));
        }
        // Apply touch-friendly sizing
        if (this.options.touchFriendly) {
            this.applyTouchFriendlySizing();
        }
        // Create gesture handler if swipe enabled
        if (this.options.swipeEnabled) {
            this.gestureHandler = new TouchGestureHandler(this.element);
        }
        this.initialized = true;
    }
    /**
     * Clean up responsive behavior
     */
    destroy() {
        if (this.unsubscribeResize) {
            this.unsubscribeResize();
            this.unsubscribeResize = undefined;
        }
        if (this.gestureHandler) {
            this.gestureHandler.destroy();
            this.gestureHandler = undefined;
        }
        this.breakpointHandlers.clear();
        this.resizeHandlers.clear();
        this.initialized = false;
    }
    // ============================================================================
    // Public API
    // ============================================================================
    /**
     * Get current responsive state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Get current breakpoint
     */
    getBreakpoint() {
        return this.state.breakpoint;
    }
    /**
     * Check if currently mobile
     */
    isMobile() {
        return this.state.isMobile;
    }
    /**
     * Register a breakpoint change handler
     * Returns unsubscribe function
     */
    onBreakpointChange(handler) {
        this.breakpointHandlers.add(handler);
        return () => this.breakpointHandlers.delete(handler);
    }
    /**
     * Register a resize handler
     * Returns unsubscribe function
     */
    onResize(handler) {
        this.resizeHandlers.add(handler);
        return () => this.resizeHandlers.delete(handler);
    }
    /**
     * Enable swipe gestures
     */
    enableSwipe(options) {
        if (!this.gestureHandler) {
            this.gestureHandler = new TouchGestureHandler(this.element);
        }
        return this.gestureHandler.enableSwipe(options);
    }
    /**
     * Enable long press gesture
     */
    enableLongPress(options) {
        if (!this.gestureHandler) {
            this.gestureHandler = new TouchGestureHandler(this.element);
        }
        return this.gestureHandler.enableLongPress(options);
    }
    /**
     * Force recalculation of responsive state
     */
    recalculate() {
        if (!this.element.screen)
            return;
        const screen = this.element.screen;
        this.handleScreenResize(screen.width || 80, screen.height || 24);
    }
    // ============================================================================
    // Protected Methods (for widget overrides)
    // ============================================================================
    /**
     * Called when screen resizes
     * Override in widgets for custom resize behavior
     */
    handleResize(width, height) {
        // Notify resize handlers
        for (const handler of this.resizeHandlers) {
            handler(width, height, this.state);
        }
        // Call element's _handleResize if it exists
        if (typeof this.element._handleResize === 'function') {
            this.element._handleResize(width, height, this.state);
        }
    }
    /**
     * Called when breakpoint changes
     * Override in widgets for custom breakpoint behavior
     */
    handleBreakpointChange(breakpoint, previousBreakpoint) {
        // Notify breakpoint handlers
        for (const handler of this.breakpointHandlers) {
            handler(breakpoint, previousBreakpoint, this.state);
        }
        // Call element's _handleBreakpointChange if it exists
        if (typeof this.element._handleBreakpointChange === 'function') {
            this.element._handleBreakpointChange(breakpoint, previousBreakpoint, this.state);
        }
        // Handle mobile mode transitions
        if (this.state.isMobile && !isMobileWidth(this.state.screenWidth)) {
            // Exiting mobile mode
            if (typeof this.element._exitMobileMode === 'function') {
                this.element._exitMobileMode();
            }
        }
        else if (!this.state.isMobile && isMobileWidth(this.state.screenWidth)) {
            // Entering mobile mode
            if (typeof this.element._enterMobileMode === 'function') {
                this.element._enterMobileMode();
            }
        }
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    handleScreenResize(width, height) {
        const newBreakpoint = getBreakpointName(width);
        const breakpointChanged = newBreakpoint !== this.state.breakpoint;
        // Update state
        this.state.previousBreakpoint = this.state.breakpoint;
        this.state.breakpoint = newBreakpoint;
        this.state.screenWidth = width;
        this.state.screenHeight = height;
        this.state.isMobile = isMobileWidth(width);
        // Handle resize
        this.handleResize(width, height);
        // Handle breakpoint change
        if (breakpointChanged) {
            this.handleBreakpointChange(newBreakpoint, this.state.previousBreakpoint);
        }
    }
    applyTouchFriendlySizing() {
        // Enforce minimum height for touch targets
        const currentHeight = this.element.height;
        if (typeof currentHeight === 'number' && currentHeight < MIN_TOUCH_HEIGHT) {
            this.element.position.height = MIN_TOUCH_HEIGHT;
        }
        // Also check options height
        if (this.element.options) {
            this.element.options.height = enforceMinTouchHeight(this.element.options.height, true);
        }
    }
}
// ============================================================================
// Mixin Application Function
// ============================================================================
/**
 * Apply responsive behavior to an element
 * Returns the ResponsiveBehavior instance for further configuration
 */
export function applyResponsiveMixin(element, options = {}) {
    // Create behavior instance
    const behavior = new ResponsiveBehavior(element, options);
    // Store reference on element
    element._responsiveBehavior = behavior;
    // Add convenience methods to element
    element.getResponsiveState = () => behavior.getState();
    element.getBreakpoint = () => behavior.getBreakpoint();
    element.isMobile = () => behavior.isMobile();
    element.onBreakpointChange = (handler) => behavior.onBreakpointChange(handler);
    element.enableSwipe = (swipeOptions) => behavior.enableSwipe(swipeOptions);
    element.enableLongPress = (lpOptions) => behavior.enableLongPress(lpOptions);
    // Initialize when attached to screen
    if (element.screen) {
        behavior.initialize();
    }
    else {
        element.once('attach', () => {
            behavior.initialize();
        });
    }
    // Cleanup on destroy
    const originalDestroy = element.destroy?.bind(element);
    element.destroy = () => {
        behavior.destroy();
        if (originalDestroy) {
            originalDestroy();
        }
    };
    return behavior;
}
/**
 * Check if an element has responsive behavior applied
 */
export function hasResponsiveBehavior(element) {
    return !!element._responsiveBehavior;
}
/**
 * Get the responsive behavior instance from an element
 */
export function getResponsiveBehavior(element) {
    return element._responsiveBehavior;
}
