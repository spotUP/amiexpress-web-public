/**
 * How cards are drawn: the player's choice, and what the panel allows.
 *
 * The SDK's card engine takes six things that change how a card or a hand
 * looks (sdk/engines/cards/card-engine.ts:49-101):
 *
 *   style      unicode or ascii faces
 *   size       full (7 rows) or mini (4)
 *   colour     ansi or none
 *   backStyle  lined, dotted, classic, shiny
 *   layout     flat, flat-condensed, arch, arch-condensed  (hands only)
 *   spacing    columns between neighbours; the engine's default overlaps a
 *              condensed layout by four columns
 *
 * The door offered three of them and hardcoded the rest, and UNO hardcoded
 * `mini` on top of that - "uno in cardlobby doesnt show the full size cards
 * when it can", and "we have much more to chose from when it comes to card
 * styles and hand layouts" (sysop, 2026-09-02). This module is the whole set,
 * resolved once for whatever panel is doing the drawing.
 */

import type { CardPreferences } from './types';

/** A full-size card is seven rows tall; a mini is four. */
export const FULL_CARD_ROWS = 7;
export const MINI_CARD_ROWS = 4;

/** Every value the player can pick, in the order the panel cycles them. */
export const CARD_STYLE_CHOICES = {
  size: ['auto', 'full', 'mini'],
  style: ['ascii', 'unicode'],
  colour: ['ansi', 'none'],
  back: ['lined', 'dotted', 'classic', 'shiny'],
  layout: ['flat-condensed', 'flat', 'arch', 'arch-condensed'],
  spacing: ['auto', 'tight', 'wide'],
} as const;

export interface ResolvedCardStyle {
  style: 'ascii' | 'unicode';
  size: 'full' | 'mini';
  color: 'ansi' | 'none';
  backStyle: 'lined' | 'dotted' | 'classic' | 'shiny';
  layout: 'flat' | 'flat-condensed' | 'arch' | 'arch-condensed';
  /** undefined lets the engine pick its own step for the layout. */
  spacing?: number;
}

/** 'tight' overlaps hard, 'wide' gives each card its own column run. */
const SPACING_COLUMNS: Record<string, number | undefined> = {
  auto: undefined,
  tight: 3,
  wide: 12,
};

/**
 * Decide how to draw in a panel `panelRows` tall.
 *
 * `unicodeCapable` is the session's own answer: a player may ask for unicode
 * faces, but a terminal that cannot draw them gets ASCII anyway, because a box
 * of question marks is worse than a plain card.
 */
export function resolveCardStyle(
  preferences: CardPreferences | undefined,
  panelRows: number,
  unicodeCapable = false,
): ResolvedCardStyle {
  const asked = preferences?.size ?? 'auto';
  const fits = panelRows >= FULL_CARD_ROWS;
  const size = asked === 'auto' ? (fits ? 'full' : 'mini') : asked;

  return {
    style: preferences?.style === 'unicode' && unicodeCapable ? 'unicode' : 'ascii',
    // A full card asked for in a panel that cannot hold one is still cut off,
    // so an explicit 'full' is honoured only where it fits.
    size: size === 'full' && !fits ? 'mini' : size,
    color: preferences?.colour === 'none' ? 'none' : 'ansi',
    backStyle: preferences?.back ?? 'lined',
    layout: preferences?.layout ?? 'flat-condensed',
    spacing: SPACING_COLUMNS[preferences?.spacing ?? 'auto'],
  };
}

/** How many rows a card of this size occupies, for laying a panel out. */
export function cardRows(size: 'full' | 'mini'): number {
  return size === 'full' ? FULL_CARD_ROWS : MINI_CARD_ROWS;
}

/** What the engine's renderHandLines/renderUnoCardLines want, from a resolved style. */
export function toRenderOptions(style: ResolvedCardStyle): Record<string, unknown> {
  return {
    style: style.style,
    size: style.size,
    color: style.color,
    backStyle: style.backStyle,
    layout: style.layout,
    ...(style.spacing === undefined ? {} : { spacing: style.spacing }),
  };
}
