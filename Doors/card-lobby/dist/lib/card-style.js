"use strict";
/**
 * How big a card should be drawn, and in what style.
 *
 * UNO's discard card was hardcoded `size: 'mini'` with the comment "because
 * the panel is four rows tall" - true of the 80x25 board it was written for,
 * and wrong the moment the sysop pressed Alt+Enter: "uno in cardlobby doesnt
 * show the full size cards when it can" (2026-09-02). Poker had the rule
 * already (GameViews: seven rows or more and the card is full size), so this
 * is that rule in one place, for both games, with the player's own preference
 * on top of it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MINI_CARD_ROWS = exports.FULL_CARD_ROWS = void 0;
exports.resolveCardStyle = resolveCardStyle;
exports.cardRows = cardRows;
/** A full-size card is seven rows tall; a mini is four. */
exports.FULL_CARD_ROWS = 7;
exports.MINI_CARD_ROWS = 4;
/**
 * Decide how to draw a card in a panel `panelRows` tall.
 *
 * `unicodeCapable` is the session's own answer: a player can ask for unicode
 * faces, but a terminal that cannot draw them gets ASCII regardless, because
 * a box of question marks is worse than a plain card.
 */
function resolveCardStyle(preferences, panelRows, unicodeCapable = false) {
    const wantsMini = preferences?.size === 'mini';
    const fits = panelRows >= exports.FULL_CARD_ROWS;
    return {
        style: preferences?.style === 'unicode' && unicodeCapable ? 'unicode' : 'ascii',
        size: !wantsMini && fits ? 'full' : 'mini',
        back: preferences?.back ?? 'lined',
    };
}
/** How many rows a card of this size occupies, for laying a panel out. */
function cardRows(size) {
    return size === 'full' ? exports.FULL_CARD_ROWS : exports.MINI_CARD_ROWS;
}
