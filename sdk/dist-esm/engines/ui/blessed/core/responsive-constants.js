/**
 * Responsive Constants
 *
 * Defines constants for responsive and mobile-friendly behavior
 * across all blessed widgets.
 */
// ============================================================================
// Touch Target Constants
// ============================================================================
/** Minimum touch target height in terminal rows (equivalent to ~44px) */
export const MIN_TOUCH_HEIGHT = 3;
/** Minimum touch target width in terminal columns */
export const MIN_TOUCH_WIDTH = 6;
/** Default padding for touch-friendly elements */
export const TOUCH_PADDING = 1;
// ============================================================================
// Breakpoint Constants
// ============================================================================
/** Extra small - mobile phones in portrait */
export const BREAKPOINT_XS = 50;
/** Small - mobile phones in landscape, small tablets */
export const BREAKPOINT_SM = 80;
/** Medium - tablets, small desktops */
export const BREAKPOINT_MD = 120;
/** Large - desktops and above */
export const BREAKPOINT_LG = 160;
/** Breakpoint configuration object */
export const BREAKPOINTS = {
    xs: BREAKPOINT_XS,
    small: BREAKPOINT_SM,
    medium: BREAKPOINT_MD,
    large: BREAKPOINT_LG,
};
// ============================================================================
// Swipe/Gesture Constants
// ============================================================================
/** Minimum distance (in columns) to trigger a swipe */
export const SWIPE_THRESHOLD = 5;
/** Minimum distance (in rows) for vertical swipe */
export const SWIPE_THRESHOLD_VERTICAL = 3;
/** Maximum time (ms) for a swipe gesture */
export const SWIPE_MAX_TIME = 500;
/** Minimum time (ms) for a long press */
export const LONG_PRESS_TIME = 500;
/** Double-tap maximum interval (ms) */
export const DOUBLE_TAP_INTERVAL = 300;
// ============================================================================
// Dialog/Modal Constants
// ============================================================================
/** Maximum dialog width on mobile (xs breakpoint) */
export const MAX_DIALOG_WIDTH_MOBILE = 45;
/** Maximum dialog width as percentage of screen */
export const MAX_DIALOG_WIDTH_PERCENT = 0.8;
/** Minimum dialog width */
export const MIN_DIALOG_WIDTH = 20;
/** Dialog padding from screen edges on mobile */
export const DIALOG_EDGE_PADDING = 2;
// ============================================================================
// Layout Constants
// ============================================================================
/** Default gap between flex/grid children */
export const DEFAULT_GAP = 1;
/** Default padding for containers */
export const DEFAULT_PADDING = 1;
/** Mobile-specific gap (smaller) */
export const MOBILE_GAP = 0;
/** Mobile-specific padding */
export const MOBILE_PADDING = 0;
// ============================================================================
// Animation/Timing Constants
// ============================================================================
/** Default transition duration (ms) for layout changes */
export const TRANSITION_DURATION = 150;
/** Scroll momentum decay factor */
export const SCROLL_MOMENTUM_DECAY = 0.95;
/** Minimum scroll velocity to trigger momentum */
export const MIN_SCROLL_VELOCITY = 0.5;
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Get the breakpoint name for a given width
 */
export function getBreakpointName(width) {
    if (width < BREAKPOINT_XS)
        return 'xs';
    if (width < BREAKPOINT_SM)
        return 'small';
    if (width < BREAKPOINT_MD)
        return 'medium';
    return 'large';
}
/**
 * Check if width is mobile (xs breakpoint)
 */
export function isMobileWidth(width) {
    return width < BREAKPOINT_XS;
}
/**
 * Check if width is small or mobile
 */
export function isSmallOrMobile(width) {
    return width < BREAKPOINT_SM;
}
/**
 * Get minimum touch target dimensions
 */
export function getMinTouchTarget() {
    return {
        width: MIN_TOUCH_WIDTH,
        height: MIN_TOUCH_HEIGHT,
    };
}
/**
 * Calculate dialog width for a given screen width
 */
export function calculateDialogWidth(screenWidth) {
    if (screenWidth < BREAKPOINT_XS) {
        // Mobile: nearly full width with padding
        return Math.min(MAX_DIALOG_WIDTH_MOBILE, screenWidth - DIALOG_EDGE_PADDING * 2);
    }
    // Desktop: percentage of screen
    return Math.min(Math.floor(screenWidth * MAX_DIALOG_WIDTH_PERCENT), screenWidth - DIALOG_EDGE_PADDING * 2);
}
/**
 * Enforce minimum touch target height
 */
export function enforceMinTouchHeight(height, touchFriendly) {
    if (!touchFriendly)
        return height;
    if (typeof height === 'number' && height < MIN_TOUCH_HEIGHT) {
        return MIN_TOUCH_HEIGHT;
    }
    return height;
}
