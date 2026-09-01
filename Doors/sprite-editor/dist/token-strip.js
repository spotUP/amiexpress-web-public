"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenAtColumn = tokenAtColumn;
/**
 * Fix round 1, minor: `tokenAtColumn` used to live in toolbar.ts, but its
 * real second consumer - the frames strip's click handler in
 * edit-screen.ts - has nothing to do with the toolbar. A generic "which
 * token does this column fall in" hit-test belongs in a module neither
 * of its callers owns, not borrowed from whichever one happened to need
 * it first.
 *
 * Which token (by index) a screen column falls in, for `tokens` joined
 * by a single space when rendered - the shared hit-test math for every
 * variable-width, space-joined strip this door renders (the toolbar's
 * tool row, the frames strip): one function both a render() and its
 * click handler read, so they can never disagree about where one token
 * ends and the next begins. Returns -1 for a click landing in a gap
 * between tokens or past the last one.
 */
function tokenAtColumn(tokens, col) {
    let pos = 0;
    for (let i = 0; i < tokens.length; i++) {
        if (col >= pos && col < pos + tokens[i].length)
            return i;
        pos += tokens[i].length + 1; // +1 for the single-space separator
    }
    return -1;
}
