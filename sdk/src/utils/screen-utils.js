"use strict";
/**
 * Screen Utilities
 *
 * Helper functions for BBS terminal dimensions and constraints
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BBS_CONSTANTS = void 0;
exports.getUserLinesPerScreen = getUserLinesPerScreen;
exports.getTerminalHeight = getTerminalHeight;
exports.getContentHeight = getContentHeight;
exports.getTerminalWidth = getTerminalWidth;
exports.getTerminalDimensions = getTerminalDimensions;
exports.truncateLine = truncateLine;
exports.wrapText = wrapText;
exports.centerText = centerText;
exports.padRight = padRight;
exports.padLeft = padLeft;
exports.validateDimensions = validateDimensions;
/**
 * BBS Terminal Constants
 */
exports.BBS_CONSTANTS = {
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
};
/**
 * Get user's configured lines per screen
 * Defaults to 23 if not set
 *
 * @param user User object from context
 * @returns User's configured lines per screen (20-23)
 */
function getUserLinesPerScreen(user) {
    var lines = user.linesPerScreen || exports.BBS_CONSTANTS.DEFAULT_LINES;
    return Math.max(exports.BBS_CONSTANTS.MIN_LINES, Math.min(lines, exports.BBS_CONSTANTS.MAX_LINES));
}
/**
 * Get total terminal height including prompt lines
 *
 * @param user User object from context
 * @returns Total terminal height (22-25)
 */
function getTerminalHeight(user) {
    return getUserLinesPerScreen(user) + exports.BBS_CONSTANTS.PROMPT_LINES;
}
/**
 * Get content area height (excluding prompt lines)
 *
 * @param user User object from context
 * @returns Content area height (20-23)
 */
function getContentHeight(user) {
    return getUserLinesPerScreen(user);
}
/**
 * Get terminal width (always 80)
 *
 * @returns Terminal width (always 80)
 */
function getTerminalWidth() {
    return exports.BBS_CONSTANTS.WIDTH;
}
/**
 * Get terminal dimensions for blessed screen
 *
 * @param context Door context
 * @returns Dimensions object for blessed screen constructor
 */
function getTerminalDimensions(context) {
    var linesPerScreen = getUserLinesPerScreen(context.user);
    return {
        width: exports.BBS_CONSTANTS.WIDTH,
        height: linesPerScreen + exports.BBS_CONSTANTS.PROMPT_LINES,
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
function truncateLine(text, maxWidth) {
    if (maxWidth === void 0) { maxWidth = exports.BBS_CONSTANTS.WIDTH; }
    if (text.length <= maxWidth)
        return text;
    return text.substring(0, maxWidth);
}
/**
 * Wrap text to multiple lines of maximum 80 columns each
 *
 * @param text Text to wrap
 * @param maxWidth Maximum width per line (default 80)
 * @returns Array of wrapped lines
 */
function wrapText(text, maxWidth) {
    if (maxWidth === void 0) { maxWidth = exports.BBS_CONSTANTS.WIDTH; }
    var lines = [];
    var words = text.split(' ');
    var currentLine = '';
    for (var _i = 0, words_1 = words; _i < words_1.length; _i++) {
        var word = words_1[_i];
        var testLine = currentLine ? "".concat(currentLine, " ").concat(word) : word;
        if (testLine.length <= maxWidth) {
            currentLine = testLine;
        }
        else {
            if (currentLine) {
                lines.push(currentLine);
            }
            // If single word exceeds maxWidth, break it
            if (word.length > maxWidth) {
                var start = 0;
                while (start < word.length) {
                    lines.push(word.substring(start, start + maxWidth));
                    start += maxWidth;
                }
                currentLine = '';
            }
            else {
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
function centerText(text, width) {
    if (width === void 0) { width = exports.BBS_CONSTANTS.WIDTH; }
    var textLen = text.length;
    if (textLen >= width)
        return truncateLine(text, width);
    var padding = Math.floor((width - textLen) / 2);
    return ' '.repeat(padding) + text + ' '.repeat(width - textLen - padding);
}
/**
 * Pad text to exact width (right-pad with spaces)
 *
 * @param text Text to pad
 * @param width Total width (default 80)
 * @returns Padded text
 */
function padRight(text, width) {
    if (width === void 0) { width = exports.BBS_CONSTANTS.WIDTH; }
    if (text.length >= width)
        return truncateLine(text, width);
    return text + ' '.repeat(width - text.length);
}
/**
 * Pad text to exact width (left-pad with spaces)
 *
 * @param text Text to pad
 * @param width Total width (default 80)
 * @returns Padded text
 */
function padLeft(text, width) {
    if (width === void 0) { width = exports.BBS_CONSTANTS.WIDTH; }
    if (text.length >= width)
        return truncateLine(text, width);
    return ' '.repeat(width - text.length) + text;
}
/**
 * Validate screen dimensions
 *
 * @param width Screen width
 * @param height Screen height
 * @throws Error if dimensions violate BBS constraints
 */
function validateDimensions(width, height) {
    if (width !== exports.BBS_CONSTANTS.WIDTH) {
        throw new Error("Invalid screen width: ".concat(width, ". BBS terminal must be exactly 80 columns wide."));
    }
    if (height < exports.BBS_CONSTANTS.MIN_LINES + exports.BBS_CONSTANTS.PROMPT_LINES) {
        throw new Error("Invalid screen height: ".concat(height, ". Minimum is ").concat(exports.BBS_CONSTANTS.MIN_LINES + exports.BBS_CONSTANTS.PROMPT_LINES, " rows."));
    }
    if (height > exports.BBS_CONSTANTS.MAX_HEIGHT) {
        throw new Error("Invalid screen height: ".concat(height, ". Maximum is ").concat(exports.BBS_CONSTANTS.MAX_HEIGHT, " rows."));
    }
}
