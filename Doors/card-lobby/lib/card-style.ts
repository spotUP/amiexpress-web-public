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

import type { CardPreferences } from './types';

/** A full-size card is seven rows tall; a mini is four. */
export const FULL_CARD_ROWS = 7;
export const MINI_CARD_ROWS = 4;

export interface ResolvedCardStyle {
  style: 'ascii' | 'unicode';
  size: 'full' | 'mini';
  back: 'lined' | 'dotted' | 'classic' | 'shiny';
}

/**
 * Decide how to draw a card in a panel `panelRows` tall.
 *
 * `unicodeCapable` is the session's own answer: a player can ask for unicode
 * faces, but a terminal that cannot draw them gets ASCII regardless, because
 * a box of question marks is worse than a plain card.
 */
export function resolveCardStyle(
  preferences: CardPreferences | undefined,
  panelRows: number,
  unicodeCapable = false,
): ResolvedCardStyle {
  const wantsMini = preferences?.size === 'mini';
  const fits = panelRows >= FULL_CARD_ROWS;

  return {
    style: preferences?.style === 'unicode' && unicodeCapable ? 'unicode' : 'ascii',
    size: !wantsMini && fits ? 'full' : 'mini',
    back: preferences?.back ?? 'lined',
  };
}

/** How many rows a card of this size occupies, for laying a panel out. */
export function cardRows(size: 'full' | 'mini'): number {
  return size === 'full' ? FULL_CARD_ROWS : MINI_CARD_ROWS;
}
