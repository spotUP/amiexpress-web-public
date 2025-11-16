"use strict";
/**
 * ANSI String Utilities
 *
 * Utilities for working with strings containing ANSI escape codes.
 * ANSI codes are invisible but count towards string length, which can
 * cause issues with text positioning, padding, and centering.
 *
 * @module ansi-string-utils
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatInBox = exports.measureWidth = exports.substringVisible = exports.truncateVisible = exports.getCenterX = exports.centerVisible = exports.padStartVisible = exports.padEndVisible = exports.visibleLength = exports.stripAnsi = void 0;
/**
 * Regular expression to match ANSI escape codes
 * Matches sequences like: \x1b[31m, \x1b[0m, \x1b[1;33m, etc.
 */
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
/**
 * Strip all ANSI escape codes from a string
 *
 * @param str - String that may contain ANSI codes
 * @returns String with all ANSI codes removed
 *
 * @example
 * ```typescript
 * const colored = '\x1b[31mRed Text\x1b[0m';
 * const plain = stripAnsi(colored); // 'Red Text'
 * ```
 */
function stripAnsi(str) {
    return str.replace(ANSI_REGEX, '');
}
exports.stripAnsi = stripAnsi;
/**
 * Get the visible length of a string (excluding ANSI codes)
 *
 * @param str - String that may contain ANSI codes
 * @returns The visible character count
 *
 * @example
 * ```typescript
 * const text = '\x1b[31mHello\x1b[0m';
 * console.log(text.length);        // 16 (includes ANSI codes)
 * console.log(visibleLength(text)); // 5 (visible chars only)
 * ```
 */
function visibleLength(str) {
    return stripAnsi(str).length;
}
exports.visibleLength = visibleLength;
/**
 * Pad a string to a specific visible width
 * Similar to String.padEnd() but accounts for ANSI codes
 *
 * @param str - String to pad (may contain ANSI codes)
 * @param targetWidth - Desired visible width
 * @param fillChar - Character to use for padding (default: space)
 * @returns Padded string
 *
 * @example
 * ```typescript
 * const colored = '\x1b[31mHi\x1b[0m';
 * const padded = padEndVisible(colored, 10);
 * // Result: '\x1b[31mHi\x1b[0m        ' (10 visible chars)
 * ```
 */
function padEndVisible(str, targetWidth, fillChar = ' ') {
    const currentVisibleWidth = visibleLength(str);
    const paddingNeeded = Math.max(0, targetWidth - currentVisibleWidth);
    return str + fillChar.repeat(paddingNeeded);
}
exports.padEndVisible = padEndVisible;
/**
 * Pad a string on the left to a specific visible width
 * Similar to String.padStart() but accounts for ANSI codes
 *
 * @param str - String to pad (may contain ANSI codes)
 * @param targetWidth - Desired visible width
 * @param fillChar - Character to use for padding (default: space)
 * @returns Padded string
 *
 * @example
 * ```typescript
 * const colored = '\x1b[31mHi\x1b[0m';
 * const padded = padStartVisible(colored, 10);
 * // Result: '        \x1b[31mHi\x1b[0m' (10 visible chars)
 * ```
 */
function padStartVisible(str, targetWidth, fillChar = ' ') {
    const currentVisibleWidth = visibleLength(str);
    const paddingNeeded = Math.max(0, targetWidth - currentVisibleWidth);
    return fillChar.repeat(paddingNeeded) + str;
}
exports.padStartVisible = padStartVisible;
/**
 * Center a string within a specific visible width
 * Accounts for ANSI codes when calculating padding
 *
 * @param str - String to center (may contain ANSI codes)
 * @param targetWidth - Desired total visible width
 * @param fillChar - Character to use for padding (default: space)
 * @returns Centered string
 *
 * @example
 * ```typescript
 * const colored = '\x1b[31mTitle\x1b[0m';
 * const centered = centerVisible(colored, 20);
 * // Result: '       \x1b[31mTitle\x1b[0m        ' (20 visible chars, 7 left, 8 right)
 * ```
 */
function centerVisible(str, targetWidth, fillChar = ' ') {
    const currentVisibleWidth = visibleLength(str);
    const totalPadding = Math.max(0, targetWidth - currentVisibleWidth);
    const leftPadding = Math.floor(totalPadding / 2);
    const rightPadding = totalPadding - leftPadding;
    return fillChar.repeat(leftPadding) + str + fillChar.repeat(rightPadding);
}
exports.centerVisible = centerVisible;
/**
 * Calculate the X position to center text on an 80-column screen
 *
 * @param str - String to center (may contain ANSI codes)
 * @param screenWidth - Width of the screen (default: 80)
 * @returns X position (1-based) for cursor positioning
 *
 * @example
 * ```typescript
 * const title = '\x1b[35mMy Title\x1b[0m';
 * const x = getCenterX(title); // Returns position to center "My Title" on 80-col screen
 * const output = `\x1b[10;${x}H${title}`;
 * ```
 */
function getCenterX(str, screenWidth = 80) {
    const width = visibleLength(str);
    return Math.max(1, Math.floor((screenWidth - width) / 2) + 1);
}
exports.getCenterX = getCenterX;
/**
 * Truncate a string to a specific visible width
 * Preserves ANSI codes and adds ellipsis if truncated
 *
 * @param str - String to truncate (may contain ANSI codes)
 * @param maxWidth - Maximum visible width
 * @param ellipsis - String to append if truncated (default: '...')
 * @returns Truncated string
 *
 * @example
 * ```typescript
 * const long = '\x1b[31mThis is a very long string\x1b[0m';
 * const short = truncateVisible(long, 10);
 * // Result: '\x1b[31mThis is...\x1b[0m' (10 visible chars including ellipsis)
 * ```
 */
function truncateVisible(str, maxWidth, ellipsis = '...') {
    const visWidth = visibleLength(str);
    if (visWidth <= maxWidth) {
        return str;
    }
    const ellipsisWidth = ellipsis.length;
    const targetWidth = maxWidth - ellipsisWidth;
    // Extract ANSI codes and visible text separately
    let result = '';
    let visibleCount = 0;
    let i = 0;
    while (i < str.length && visibleCount < targetWidth) {
        // Check for ANSI code
        if (str.substr(i, 2) === '\x1b[') {
            // Find the end of the ANSI code (the 'm')
            const endIndex = str.indexOf('m', i);
            if (endIndex !== -1) {
                result += str.substring(i, endIndex + 1);
                i = endIndex + 1;
                continue;
            }
        }
        // Regular character
        result += str[i];
        visibleCount++;
        i++;
    }
    return result + ellipsis;
}
exports.truncateVisible = truncateVisible;
/**
 * Substring with visible character positions
 * Like String.substring() but uses visible character positions
 *
 * @param str - String that may contain ANSI codes
 * @param start - Start position (visible characters)
 * @param end - End position (visible characters, optional)
 * @returns Substring preserving ANSI codes
 *
 * @example
 * ```typescript
 * const text = '\x1b[31mHello World\x1b[0m';
 * const sub = substringVisible(text, 0, 5);
 * // Result: '\x1b[31mHello\x1b[0m' (first 5 visible chars with colors preserved)
 * ```
 */
function substringVisible(str, start, end) {
    let result = '';
    let visibleCount = 0;
    let i = 0;
    const endPos = end ?? visibleLength(str);
    while (i < str.length) {
        // Check for ANSI code
        if (str.substr(i, 2) === '\x1b[') {
            // Find the end of the ANSI code
            const endIndex = str.indexOf('m', i);
            if (endIndex !== -1) {
                // Include ANSI codes in result even outside range
                result += str.substring(i, endIndex + 1);
                i = endIndex + 1;
                continue;
            }
        }
        // Regular character
        if (visibleCount >= start && visibleCount < endPos) {
            result += str[i];
        }
        visibleCount++;
        if (visibleCount >= endPos) {
            break;
        }
        i++;
    }
    return result;
}
exports.substringVisible = substringVisible;
/**
 * Measure the width needed to display text (accounting for ANSI codes)
 * Useful for determining box sizes, alignment, etc.
 *
 * @param lines - Array of strings (may contain ANSI codes)
 * @returns Maximum visible width across all lines
 *
 * @example
 * ```typescript
 * const lines = [
 *   '\x1b[31mRed\x1b[0m',
 *   '\x1b[32mLonger green text\x1b[0m'
 * ];
 * const width = measureWidth(lines); // Returns 17
 * ```
 */
function measureWidth(lines) {
    return Math.max(...lines.map(line => visibleLength(line)));
}
exports.measureWidth = measureWidth;
/**
 * Format text for display within a fixed-width box
 * Ensures text fits within the box accounting for ANSI codes
 *
 * @param text - Text to format (may contain ANSI codes)
 * @param width - Target visible width
 * @param align - Alignment: 'left', 'center', or 'right'
 * @returns Formatted text
 *
 * @example
 * ```typescript
 * const text = '\x1b[35mTitle\x1b[0m';
 * const formatted = formatInBox(text, 20, 'center');
 * // Result will be centered within 20 visible characters
 * ```
 */
function formatInBox(text, width, align = 'left') {
    const visWidth = visibleLength(text);
    if (visWidth > width) {
        return truncateVisible(text, width);
    }
    switch (align) {
        case 'center':
            return centerVisible(text, width);
        case 'right':
            return padStartVisible(text, width);
        case 'left':
        default:
            return padEndVisible(text, width);
    }
}
exports.formatInBox = formatInBox;
