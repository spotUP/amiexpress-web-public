/**
 * A ROW MEETS THE ROW UNDER IT, THE WAY A GLYPH MEETS THE ONE BESIDE IT.
 *
 * "the doubled texts in text-tv modes has lines in them", and the same
 * hairlines in the ANSI editor and in ordinary ANSI art (the sysop,
 * 2026-09-17). Teletext showed it worst because a double-height headline is
 * drawn as TWO glyphs in two rows (teletext-double-height.ts), so the seam
 * runs through the middle of the letter instead of between letters.
 *
 * The cause is one number. Dropping xterm's canvas renderer for the DOM one
 * (5c4cab6b1, 2026-09-14) fixed a seam down the right edge of every glyph and
 * introduced one along the bottom of every row: the canvas painted all rows
 * into a single canvas at device-pixel positions, where a fractional cell was
 * invisible, while the DOM renderer gives each row its own box and sets its
 * height to `dimensions.css.cell.height`.
 *
 * `seamlessSize` was written for the width alone. It floors the CELL and
 * divides back through the face's advance, which makes the width whole and
 * says nothing about the height. Every shipped face declares a line box of
 * exactly one em, on hhea and on OS/2 alike, so the cell HEIGHT is the font
 * size itself - and for a face whose advance is not a half, dividing back
 * lands on a fraction: TeletextUPR advances 0.6, and 24px snapped to 23.333.
 * Whole cell across, third of a pixel down, a hairline under every row.
 *
 * So the rule is both axes: the size must be whole AND its cell must be whole.
 */
import { describe, it, expect } from 'vitest';

import {
  seamlessSize,
  seamlessTeletextSize,
  advanceRatioFor,
  BBS_FONTS,
  TELETEXT_FONT,
} from '../../../../../packages/terminal/src/utils/session-font';

/** Every face the terminal can be put into, the teletext one included. */
const FACES = [...BBS_FONTS, TELETEXT_FONT, 'PetMe64'];

const isWhole = (n: number) => Math.abs(n - Math.round(n)) < 1e-9;

describe('the size a face is given cannot leave a seam on either axis', () => {
  for (const font of FACES) {
    it(`${font}: whole cell across and a whole row down`, () => {
      const ratio = advanceRatioFor(font);
      for (let size = 8; size <= 64; size += 0.5) {
        const snapped = seamlessSize(size, font);

        // Down the row: the line box is one em, so the cell height IS the
        // font size. A fractional size is a fractional row box.
        expect(isWhole(snapped)).toBe(true);
        // Across the row: what seamlessSize was written for.
        expect(isWhole(snapped * ratio)).toBe(true);
      }
    });
  }

  it('never grows the size it was handed', () => {
    for (const font of FACES) {
      for (const size of [12.7, 25.4, 29.95, 36, 41.5, 43.5]) {
        expect(seamlessSize(size, font)).toBeLessThanOrEqual(size);
      }
    }
  });

  it('gives back a usable size rather than collapsing to nothing', () => {
    for (const font of FACES) {
      expect(seamlessSize(8, font)).toBeGreaterThan(0);
      expect(seamlessSize(0.1, font)).toBeGreaterThan(0);
    }
  });
});

describe('the teletext face, which is where the sysop saw it', () => {
  it('lands whole where it used to land on a third of a pixel', () => {
    // 24 -> 23.333 before: cell 14 across, and 23.333 down.
    const snapped = seamlessTeletextSize(24);
    expect(isWhole(snapped)).toBe(true);
    expect(isWhole(snapped * advanceRatioFor(TELETEXT_FONT))).toBe(true);
  });

  it('is whole at every size a doubled headline can ask for', () => {
    // The mode opens at twice the 80-column size and the page's fit walks
    // from there, so the doubled sizes are the ones that matter.
    for (let base = 9; base <= 32; base += 0.5) {
      const snapped = seamlessTeletextSize(base * 2);
      expect(isWhole(snapped)).toBe(true);
      expect(isWhole(snapped * advanceRatioFor(TELETEXT_FONT))).toBe(true);
    }
  });

  it('still steps by no more than one cell, so the fit is not starved', () => {
    for (let size = 20; size <= 60; size += 0.5) {
      const snapped = seamlessTeletextSize(size);
      // The step for a 0.6 advance is 5px of size (3px of cell); losing a
      // whole step plus a fraction would mean the floor is wrong.
      expect(size - snapped).toBeLessThan(5);
    }
  });
});
