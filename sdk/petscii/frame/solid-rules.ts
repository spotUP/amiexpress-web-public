/**
 * A RUN OF DASHES IS A LINE, AND A C64 CAN DRAW A LINE.
 *
 * The sysop, 2026-09-22, looking at JoinCnf on a C64: "petscii has better
 * characters than ---- etc to create solid lines". He is right - `-` is a
 * hyphen in the middle of a cell with a gap either side, so a rule drawn with
 * it comes out as a dotted line, while PETSCII has a horizontal line glyph
 * that meets its neighbours. The transducer already maps `U+2500` to it
 * (`unicode-to-petscii.ts`), so the substitution is one character.
 *
 * WHAT IT DOES NOT TOUCH, and why the rule is a RUN rather than a glyph:
 *
 *   A hyphen in a word. `Up Rough - Internal`, `discord-bridge`, `1-14` - one
 *   or two dashes are punctuation and stay punctuation. Three in a row are
 *   never a word.
 *
 *   `=` and the column ticks in a table rule. MultiTop's
 *   `===-===========================-======` uses single dashes to mark where
 *   one column ends and the next begins; solidifying it would erase exactly
 *   the structure it is drawn to show.
 *
 * It runs on the ADAPTED frame - the 40-column one - so an eighty-column
 * caller's screen is untouched, and so is a `.seq` the artist drew by hand
 * (those never pass through the ladder).
 */
import type { Cell } from './types';

/** The PETSCII horizontal line, by the Unicode name the transducer maps. */
export const RULE_GLYPH = '─';

/** Three is the shortest run no word can be. */
export const MIN_RULE_RUN = 3;

/** One row, its dash runs drawn as lines. Colour and reverse are untouched. */
export function solidifyRules(cells: readonly Cell[]): Cell[] {
  const out = cells.map(c => ({ ...c }));
  let run = 0;
  const close = (end: number): void => {
    if (run >= MIN_RULE_RUN) {
      for (let k = end - run; k < end; k++) out[k].ch = RULE_GLYPH;
    }
    run = 0;
  };
  for (let x = 0; x < out.length; x++) {
    // A REVERSED cell is a filled block in the pen colour, not a glyph the
    // caller reads as a dash; leaving it alone keeps a reverse-video bar a bar.
    if (out[x].ch === '-' && !out[x].rvs) run++;
    else close(x);
  }
  close(out.length);
  return out;
}

/** Every row of an adapted screen. */
export function solidifyRuleRows(rows: readonly (readonly Cell[])[]): Cell[][] {
  return rows.map(solidifyRules);
}
