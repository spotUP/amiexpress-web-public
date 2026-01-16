/**
 * Responsive Mixin
 *
 * Provides responsive behavior hooks and breakpoint detection
 * that can be mixed into Element-based widgets.
 */
import { BreakpointName } from './responsive-constants';
import { SwipeOptions, LongPressOptions } from './touch-gestures';
export interface ResponsiveOptions {
    /** Enable responsive features (default: true) */
    responsive?: boolean;
    /** Enable touch-friendly sizing (default: false) */
    touchFriendly?: boolean;
    /** Enable swipe gestures (default: false) */
    swipeEnabled?: boolean;
    /** Custom mobile breakpoint override */
    mobileBreakpoint?: number;
}
export interface ResponsiveState {
    /** Current breakpoint name */
    breakpoint: BreakpointName;
    /** Previous breakpoint name */
    previousBreakpoint: BreakpointName;
    /** Whether currently in mobile mode (xs breakpoint) */
    isMobile: boolean;
    /** Screen width */
    screenWidth: number;
    /** Screen height */
    screenHeight: number;
}
export type BreakpointChangeHandler = (breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState) => void;
export type ResizeHandler = (width: number, height: number, state: ResponsiveState) => void;
/**
 * Mixin class that provides responsive behavior to widgets.
 * Use applyResponsiveMixin() to add these capabilities to an Element.
 */
export declare class ResponsiveBehavior {
    private element;
    private options;
    private state;
    private breakpointHandlers;
    private resizeHandlers;
    private gestureHandler?;
    private unsubscribeResize?;
    private initialized;
    constructor(element: any, options?: ResponsiveOptions);
    /**
     * Initialize responsive behavior (call after element is attached to screen)
     */
    initialize(): void;
    /**
     * Clean up responsive behavior
     */
    destroy(): void;
    /**
     * Get current responsive state
     */
    getState(): Readonly<ResponsiveState>;
    /**
     * Get current breakpoint
     */
    getBreakpoint(): BreakpointName;
    /**
     * Check if currently mobile
     */
    isMobile(): boolean;
    /**
     * Register a breakpoint change handler
     * Returns unsubscribe function
     */
    onBreakpointChange(handler: BreakpointChangeHandler): () => void;
    /**
     * Register a resize handler
     * Returns unsubscribe function
     */
    onResize(handler: ResizeHandler): () => void;
    /**
     * Enable swipe gestures
     */
    enableSwipe(options: SwipeOptions): () => void;
    /**
     * Enable long press gesture
     */
    enableLongPress(options: LongPressOptions): () => void;
    /**
     * Force recalculation of responsive state
     */
    recalculate(): void;
    /**
     * Called when screen resizes
     * Override in widgets for custom resize behavior
     */
    protected handleResize(width: number, height: number): void;
    /**
     * Called when breakpoint changes
     * Override in widgets for custom breakpoint behavior
     */
    protected handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName): void;
    private handleScreenResize;
    private applyTouchFriendlySizing;
}
/**
 * Apply responsive behavior to an element
 * Returns the ResponsiveBehavior instance for further configuration
 */
export declare function applyResponsiveMixin(element: any, options?: ResponsiveOptions): ResponsiveBehavior;
/**
 * Check if an element has responsive behavior applied
 */
export declare function hasResponsiveBehavior(element: any): boolean;
/**
 * Get the responsive behavior instance from an element
 */
export declare function getResponsiveBehavior(element: any): ResponsiveBehavior | undefined;
