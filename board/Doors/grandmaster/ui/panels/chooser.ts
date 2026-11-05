/**
 * The lists TETRIS ATTACK asks its questions with.
 *
 * Split out of app.ts because all four of them - mode, puzzle set, replay,
 * and anything added later - had the same defect for the same reason: a box
 * fifty-six columns wide, written while looking at an eighty-column terminal,
 * on a door that is marked for forty. On a C64 that box is wider than the
 * screen.
 *
 * So the width comes from the screen, and the labels come in two lengths. The
 * long one explains; the short one names. Neither is truncated at paint time,
 * because a truncated row of a menu is how a caller ends up choosing the wrong
 * mode.
 */

import { calculateDialogWidth, isCompactWidth } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

/** A row: what it says on a wide screen, and what it says on a C64. */
export interface ChooserRow {
  wide: string;
  compact: string;
}

export interface ChooserLayout {
  /** Width of the surrounding box. */
  width: number;
  /** Width of the list inside it. */
  innerWidth: number;
  /** Height of the box, including its border. */
  height: number;
  /** Height of the list inside it. */
  innerHeight: number;
  compact: boolean;
}

/** Two rows of border plus a row of padding top and bottom. */
const CHROME_ROWS = 3;
/** A border column each side, plus one of padding. */
const CHROME_COLUMNS = 4;

export function chooserLayout(
  screenWidth: number, screenHeight: number, rowCount: number,
): ChooserLayout {
  const compact = isCompactWidth(screenWidth);
  const width = Math.min(calculateDialogWidth(screenWidth), screenWidth);
  // Never taller than the screen: a list that runs off the bottom cannot be
  // scrolled to on a terminal that does not scroll.
  const height = Math.min(rowCount + CHROME_ROWS, Math.max(5, screenHeight - 2));

  return {
    width,
    innerWidth: Math.max(1, width - CHROME_COLUMNS),
    height,
    innerHeight: Math.max(1, height - CHROME_ROWS),
    compact,
  };
}

/** The labels to show, at the length this screen has room for. */
export function chooserLabels(rows: ChooserRow[], layout: ChooserLayout): string[] {
  return rows.map((row) => {
    const text = layout.compact ? row.compact : row.wide;
    return text.length > layout.innerWidth ? text.slice(0, layout.innerWidth) : text;
  });
}
