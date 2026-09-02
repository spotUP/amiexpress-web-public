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

/**
 * Extra-extra small - 40-column C64/PETSCII screens.
 *
 * A C64 text screen is 40x25. Every width below this constant is one of
 * those (or something even narrower), and gets the compact profile below:
 * borderless, single column, no decorative effects. 41 rather than 40 so
 * `width < BREAKPOINT_XXS` reads the same way as every other breakpoint
 * comparison in this file.
 */
export const BREAKPOINT_XXS = 41;

/** Extra small - mobile phones in portrait */
export const BREAKPOINT_XS = 50;

/** Small - mobile phones in landscape, small tablets */
export const BREAKPOINT_SM = 80;

/** Medium - tablets, small desktops */
export const BREAKPOINT_MD = 120;

/** Large - desktops and above */
export const BREAKPOINT_LG = 160;

/** Breakpoint names for type safety */
export type BreakpointName = 'xxs' | 'xs' | 'small' | 'medium' | 'large';

/** Breakpoint configuration object */
export const BREAKPOINTS = {
  xxs: BREAKPOINT_XXS,
  xs: BREAKPOINT_XS,
  small: BREAKPOINT_SM,
  medium: BREAKPOINT_MD,
  large: BREAKPOINT_LG,
} as const;

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
export function getBreakpointName(width: number): BreakpointName {
  if (width < BREAKPOINT_XXS) return 'xxs';
  if (width < BREAKPOINT_XS) return 'xs';
  if (width < BREAKPOINT_SM) return 'small';
  if (width < BREAKPOINT_MD) return 'medium';
  return 'large';
}

/**
 * Check if width is mobile (xs breakpoint)
 */
export function isMobileWidth(width: number): boolean {
  return width < BREAKPOINT_XS;
}

/**
 * Check if width is small or mobile
 */
export function isSmallOrMobile(width: number): boolean {
  return width < BREAKPOINT_SM;
}

/**
 * Get minimum touch target dimensions
 */
export function getMinTouchTarget(): { width: number; height: number } {
  return {
    width: MIN_TOUCH_WIDTH,
    height: MIN_TOUCH_HEIGHT,
  };
}

/**
 * Calculate dialog width for a given screen width
 */
export function calculateDialogWidth(screenWidth: number): number {
  if (screenWidth < BREAKPOINT_XXS) {
    // 40-col: nearly full width, borderless margins (compact profile).
    // DIALOG_EDGE_PADDING*2 would cost 4 of 40 columns - too much here.
    return Math.max(MIN_DIALOG_WIDTH, screenWidth - 2);
  }
  if (screenWidth < BREAKPOINT_XS) {
    // Mobile: nearly full width with padding
    return Math.min(MAX_DIALOG_WIDTH_MOBILE, screenWidth - DIALOG_EDGE_PADDING * 2);
  }
  // Desktop: percentage of screen
  return Math.min(
    Math.floor(screenWidth * MAX_DIALOG_WIDTH_PERCENT),
    screenWidth - DIALOG_EDGE_PADDING * 2
  );
}

/**
 * Enforce minimum touch target height
 */
export function enforceMinTouchHeight(height: number | string | undefined, touchFriendly: boolean): number | string | undefined {
  if (!touchFriendly) return height;
  if (typeof height === 'number' && height < MIN_TOUCH_HEIGHT) {
    return MIN_TOUCH_HEIGHT;
  }
  return height;
}

// ============================================================================
// Compact (XXS / 40-column) profile
// ============================================================================

/**
 * Layout rules for a 40-column screen, in one place (single source of
 * truth - doors consume this instead of inventing their own width
 * checks). Borders cost 2 of 40 columns, so XXS is borderless;
 * masthead/footer collapse to one line; wide tables become single-column.
 */
export interface CompactProfile {
  borders: boolean;
  singleColumn: boolean;
  collapseChrome: boolean;
  gap: number;
  padding: number;
}

export function getCompactProfile(width: number): CompactProfile {
  const xxs = isCompactWidth(width);
  return {
    borders: !xxs,
    singleColumn: xxs,
    collapseChrome: xxs,
    gap: xxs ? MOBILE_GAP : DEFAULT_GAP,
    padding: xxs ? MOBILE_PADDING : DEFAULT_PADDING,
  };
}

/**
 * True when this width is the XXS (40-column C64/PETSCII) tier.
 *
 * Always call it with a LIVE width - `screen.width`, `this.screen?.width` -
 * never with a constant. That is the whole point: a door that hardcodes 80
 * folds its rows on a 40-column canvas.
 */
export function isCompactWidth(width: number): boolean {
  return width < BREAKPOINT_XXS;
}

/**
 * Whether decorative effects (glitch, typewriter, marquee, scanline
 * animations) should run at this width.
 *
 * Sysop report, 2026-09-02: on the PETSCII canvas DOORMAN's glitch and
 * typewriter effects leave stray glyphs mid-row, because they are drawn
 * against an assumed 80-column line and the real screen is 40. At XXS the
 * honest answer is not to run them at all - a 40x25 screen has no spare
 * cells for decoration. Doors gate their effect setup on this.
 */
export function effectsAllowed(width: number): boolean {
  return !isCompactWidth(width);
}
