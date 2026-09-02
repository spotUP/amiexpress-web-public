"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripperHeader = stripperHeader;
exports.stripperRule = stripperRule;
exports.pathColumn = pathColumn;
exports.showsReason = showsReason;
/**
 * AmiStripper's line widths, in one place.
 *
 * The door drew a header padded to 80, a rule of 80 dashes and rows with a
 * 38- or 40-character path column - none of which a 40-column C64 caller
 * can hold. Every rule here takes the LIVE terminal width and asks the
 * SDK's single compact profile what to do with it; at 80 every one of them
 * returns exactly the string the door emitted before.
 *
 * Its own module so the rules are testable without the door runtime.
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/** The banner: title on the left, the pattern count on the right. */
function stripperHeader(patternCount, width) {
    const compact = (0, blessed_1.getCompactProfile)(width);
    const left = compact.collapseChrome ? ' ARCHIVE STRIPPER' : ' AMIGA ARCHIVE STRIPPER';
    const right = compact.collapseChrome ? `[db ${patternCount}]` : `[scene db: ${patternCount} patterns]`;
    const pad = width - left.length - right.length;
    return left + ' '.repeat(Math.max(0, pad)) + right;
}
/** The rule under the listing, as wide as the screen and no wider. */
function stripperRule(width) {
    return '─'.repeat(Math.max(1, width));
}
/**
 * How many characters the path column may use.
 * Wide keeps the literals the door has always used (38 stripped, 40 kept);
 * narrow leaves room for the two-space indent, the size and a gap.
 */
function pathColumn(wide, width) {
    return (0, blessed_1.getCompactProfile)(width).singleColumn ? Math.max(8, width - 12) : wide;
}
/** True when the `[reason]` tail has nowhere to go. */
function showsReason(width) {
    return !(0, blessed_1.getCompactProfile)(width).singleColumn;
}
//# sourceMappingURL=layout.js.map