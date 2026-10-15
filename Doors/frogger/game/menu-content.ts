/**
 * What the Frogger main menu says, as lines.
 *
 * Lifted out of index.ts so the layout test can measure the REAL menu.
 *
 * The test that was supposed to catch the box overflowing the game area
 * built its own copy of this composition, so it asserted what the test
 * author believed the door did rather than what the door does - and it
 * passed while the door was broken. The same fault as
 * `highScoresAreWrittenOutsideDist` this morning. One definition, two
 * callers, and the test can no longer disagree with the door.
 *
 * Pure: no blessed, no screen, no door state beyond what is passed in.
 */

import { arcadeMenu } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
import { MENU_OPTIONS } from './constants';

/** The tagline under the logo. */
export const MENU_TAGLINE = 'Classic 1981 Konami Arcade Game';

/**
 * Centre a plain string and colour it.
 *
 * The padding goes OUTSIDE the tag. Inside it, a row with a background
 * colour paints its own centring - which is what made the arcade menu's
 * selected row bleed blue to the left edge of the box.
 */
export function centred(text: string, width: number, colour: string): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return `${' '.repeat(pad)}{${colour}-fg}${text}{/${colour}-fg}`;
}

export interface MenuContentSpec {
  /** How many frogs a new game starts with - the cabinet's operator switch. */
  startingLives: number;
  /** Which row is selected, 0-based. */
  selection: number;
  /** How wide the menu is drawn, in columns. */
  width: number;
}

/**
 * The menu's lines, in order, ready to drop into a box.
 *
 * No hint line is added here: arcadeMenu already draws one. The door used to
 * push its own on top, which read twice AND made the box one row taller than
 * the game area - and blessed resolves `top: "center"` on an oversized child
 * to a negative offset, so the box climbed over the HUD.
 */
export function menuLines(spec: MenuContentSpec): string[] {
  const lines: string[] = [];

  lines.push(centred(MENU_TAGLINE, spec.width, 'white'));
  lines.push('');

  // The lives row keeps its value - on the cabinet this was an operator
  // switch (FAQ 6.3) - which is what MenuOption's `value` is for.
  lines.push(...arcadeMenu({
    title: [],
    options: MENU_OPTIONS.map(option => option === 'Lives'
      ? { label: option, value: String(spec.startingLives) }
      : option),
    selection: spec.selection,
    width: spec.width,
  }));

  return lines;
}

/** The box height those lines need, counting its two border rows. */
export function menuBoxHeight(spec: MenuContentSpec): number {
  return menuLines(spec).length + 2;
}
