/**
 * Responsive Constants
 *
 * Defines constants for responsive and mobile-friendly behavior
 * across all blessed widgets.
 */
/** Minimum touch target height in terminal rows (equivalent to ~44px) */
export declare const MIN_TOUCH_HEIGHT = 3;
/** Minimum touch target width in terminal columns */
export declare const MIN_TOUCH_WIDTH = 6;
/** Default padding for touch-friendly elements */
export declare const TOUCH_PADDING = 1;
/** Extra small - mobile phones in portrait */
export declare const BREAKPOINT_XS = 50;
/** Small - mobile phones in landscape, small tablets */
export declare const BREAKPOINT_SM = 80;
/** Medium - tablets, small desktops */
export declare const BREAKPOINT_MD = 120;
/** Large - desktops and above */
export declare const BREAKPOINT_LG = 160;
/** Breakpoint names for type safety */
export type BreakpointName = 'xs' | 'small' | 'medium' | 'large';
/** Breakpoint configuration object */
export declare const BREAKPOINTS: {
    readonly xs: 50;
    readonly small: 80;
    readonly medium: 120;
    readonly large: 160;
};
/** Minimum distance (in columns) to trigger a swipe */
export declare const SWIPE_THRESHOLD = 5;
/** Minimum distance (in rows) for vertical swipe */
export declare const SWIPE_THRESHOLD_VERTICAL = 3;
/** Maximum time (ms) for a swipe gesture */
export declare const SWIPE_MAX_TIME = 500;
/** Minimum time (ms) for a long press */
export declare const LONG_PRESS_TIME = 500;
/** Double-tap maximum interval (ms) */
export declare const DOUBLE_TAP_INTERVAL = 300;
/** Maximum dialog width on mobile (xs breakpoint) */
export declare const MAX_DIALOG_WIDTH_MOBILE = 45;
/** Maximum dialog width as percentage of screen */
export declare const MAX_DIALOG_WIDTH_PERCENT = 0.8;
/** Minimum dialog width */
export declare const MIN_DIALOG_WIDTH = 20;
/** Dialog padding from screen edges on mobile */
export declare const DIALOG_EDGE_PADDING = 2;
/** Default gap between flex/grid children */
export declare const DEFAULT_GAP = 1;
/** Default padding for containers */
export declare const DEFAULT_PADDING = 1;
/** Mobile-specific gap (smaller) */
export declare const MOBILE_GAP = 0;
/** Mobile-specific padding */
export declare const MOBILE_PADDING = 0;
/** Default transition duration (ms) for layout changes */
export declare const TRANSITION_DURATION = 150;
/** Scroll momentum decay factor */
export declare const SCROLL_MOMENTUM_DECAY = 0.95;
/** Minimum scroll velocity to trigger momentum */
export declare const MIN_SCROLL_VELOCITY = 0.5;
/**
 * Get the breakpoint name for a given width
 */
export declare function getBreakpointName(width: number): BreakpointName;
/**
 * Check if width is mobile (xs breakpoint)
 */
export declare function isMobileWidth(width: number): boolean;
/**
 * Check if width is small or mobile
 */
export declare function isSmallOrMobile(width: number): boolean;
/**
 * Get minimum touch target dimensions
 */
export declare function getMinTouchTarget(): {
    width: number;
    height: number;
};
/**
 * Calculate dialog width for a given screen width
 */
export declare function calculateDialogWidth(screenWidth: number): number;
/**
 * Enforce minimum touch target height
 */
export declare function enforceMinTouchHeight(height: number | string | undefined, touchFriendly: boolean): number | string | undefined;
