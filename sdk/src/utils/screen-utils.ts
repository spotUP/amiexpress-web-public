/**
 * Screen Utilities
 *
 * Helper functions for BBS terminal dimensions and constraints
 */

import type { User, DoorContext } from '../core/types';

/**
 * BBS Terminal Constants
 */
export const BBS_CONSTANTS = {
  /** Fixed terminal width (classic BBS standard) */
  WIDTH: 80,

  /** Default content lines (most common setting) */
  DEFAULT_LINES: 23,

  /** Minimum lines per screen (configurable by user) */
  MIN_LINES: 20,

  /** Maximum lines per screen (configurable by user) */
  MAX_LINES: 23,

  /** Reserved lines for prompts/status */
  PROMPT_LINES: 2,

  /** Maximum total terminal height */
  MAX_HEIGHT: 25,
} as const;

/**
 * Get user's configured lines per screen
 * Defaults to 23 if not set
 *
 * @param user User object from context
 * @returns User's configured lines per screen (20-23)
 */
export function getUserLinesPerScreen(user: User): number {
  const lines = user.linesPerScreen || BBS_CONSTANTS.DEFAULT_LINES;
  return Math.max(
    BBS_CONSTANTS.MIN_LINES,
    Math.min(lines, BBS_CONSTANTS.MAX_LINES)
  );
}

/**
 * Get total terminal height including prompt lines
 *
 * @param user User object from context
 * @returns Total terminal height (22-25)
 */
export function getTerminalHeight(user: User): number {
  return getUserLinesPerScreen(user) + BBS_CONSTANTS.PROMPT_LINES;
}

/**
 * Get content area height (excluding prompt lines)
 *
 * @param user User object from context
 * @returns Content area height (20-23)
 */
export function getContentHeight(user: User): number {
  return getUserLinesPerScreen(user);
}

/**
 * Get terminal width (always 80)
 *
 * @returns Terminal width (always 80)
 */
export function getTerminalWidth(): number {
  return BBS_CONSTANTS.WIDTH;
}

/**
 * Get terminal dimensions for blessed screen
 *
 * @param context Door context
 * @returns Dimensions object for blessed screen constructor
 */
export function getTerminalDimensions(context: DoorContext): {
  width: number;
  height: number;
  contentHeight: number;
} {
  const linesPerScreen = getUserLinesPerScreen(context.user);
  return {
    width: BBS_CONSTANTS.WIDTH,
    height: linesPerScreen + BBS_CONSTANTS.PROMPT_LINES,
    contentHeight: linesPerScreen,
  };
}

/**
 * Truncate text to fit within 80 columns
 *
 * @param text Text to truncate
 * @param maxWidth Maximum width (default 80)
 * @returns Truncated text
 */
export function truncateLine(text: string, maxWidth: number = BBS_CONSTANTS.WIDTH): string {
  if (text.length <= maxWidth) return text;
  return text.substring(0, maxWidth);
}

/**
 * Wrap text to multiple lines of maximum 80 columns each
 *
 * @param text Text to wrap
 * @param maxWidth Maximum width per line (default 80)
 * @returns Array of wrapped lines
 */
export function wrapText(text: string, maxWidth: number = BBS_CONSTANTS.WIDTH): string[] {
  const lines: string[] = [];
  const words = text.split(' ');
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }

      // If single word exceeds maxWidth, break it
      if (word.length > maxWidth) {
        let start = 0;
        while (start < word.length) {
          lines.push(word.substring(start, start + maxWidth));
          start += maxWidth;
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Center text within 80 columns
 *
 * @param text Text to center
 * @param width Total width (default 80)
 * @returns Centered text with padding
 */
export function centerText(text: string, width: number = BBS_CONSTANTS.WIDTH): string {
  const textLen = text.length;
  if (textLen >= width) return truncateLine(text, width);

  const padding = Math.floor((width - textLen) / 2);
  return ' '.repeat(padding) + text + ' '.repeat(width - textLen - padding);
}

/**
 * Pad text to exact width (right-pad with spaces)
 *
 * @param text Text to pad
 * @param width Total width (default 80)
 * @returns Padded text
 */
export function padRight(text: string, width: number = BBS_CONSTANTS.WIDTH): string {
  if (text.length >= width) return truncateLine(text, width);
  return text + ' '.repeat(width - text.length);
}

/**
 * Pad text to exact width (left-pad with spaces)
 *
 * @param text Text to pad
 * @param width Total width (default 80)
 * @returns Padded text
 */
export function padLeft(text: string, width: number = BBS_CONSTANTS.WIDTH): string {
  if (text.length >= width) return truncateLine(text, width);
  return ' '.repeat(width - text.length) + text;
}

/**
 * Validate screen dimensions
 *
 * @param width Screen width
 * @param height Screen height
 * @throws Error if dimensions violate BBS constraints
 */
export function validateDimensions(width: number, height: number): void {
  if (width !== BBS_CONSTANTS.WIDTH) {
    throw new Error(
      `Invalid screen width: ${width}. BBS terminal must be exactly 80 columns wide.`
    );
  }

  if (height < BBS_CONSTANTS.MIN_LINES + BBS_CONSTANTS.PROMPT_LINES) {
    throw new Error(
      `Invalid screen height: ${height}. Minimum is ${BBS_CONSTANTS.MIN_LINES + BBS_CONSTANTS.PROMPT_LINES} rows.`
    );
  }

  if (height > BBS_CONSTANTS.MAX_HEIGHT) {
    throw new Error(
      `Invalid screen height: ${height}. Maximum is ${BBS_CONSTANTS.MAX_HEIGHT} rows.`
    );
  }
}
