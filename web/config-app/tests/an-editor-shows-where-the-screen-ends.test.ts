/**
 * An editor says where the caller's screen ends.
 *
 * "if i remove lines i need to see how big the actual screen is, and what is
 * outside the screen" (sysop, 2026-09-14). The rule is the BOARD'S:
 * `displayScreen` paginates at `pageHeight - 1`, keeping one row for the More
 * prompt (screen.handler.ts:2673-2675), so a 25-row terminal shows 24 lines
 * of art before it stops to ask.
 */
import { describe, expect, it } from 'vitest';
import { screenfulRows, foldRows, screenfuls, describeFold } from '../src/pages/screen-fold';

describe('where the caller\'s screen ends', () => {
  it('is one row short of the terminal, because the More prompt needs a line', () => {
    expect(screenfulRows(25)).toBe(24);
    expect(screenfulRows(24)).toBe(23);
  });

  it('never claims a screen shows nothing, however small the terminal says it is', () => {
    expect(screenfulRows(1)).toBe(1);
    expect(screenfulRows(0)).toBe(1);
  });

  it('folds after every screenful, and not at the very end', () => {
    // 24 lines is exactly one screenful: the caller is never stopped.
    expect(foldRows(24)).toEqual([]);
    expect(foldRows(25)).toEqual([24]);
    expect(foldRows(48)).toEqual([24]);
    expect(foldRows(49)).toEqual([24, 48]);
  });

  it('counts the screenfuls a caller walks through', () => {
    expect(screenfuls(1)).toBe(1);
    expect(screenfuls(24)).toBe(1);
    expect(screenfuls(25)).toBe(2);
    expect(screenfuls(48)).toBe(2);
  });

  it('says it in the artist\'s terms, not the board\'s', () => {
    expect(describeFold(20)).toMatch(/fits, 4 to spare/);
    expect(describeFold(24)).toMatch(/fills the caller's screen exactly/);
    expect(describeFold(30)).toMatch(/2 screenfuls; 6 past the first/);
    // One past the fold reads as "it", not "them".
    expect(describeFold(25)).toMatch(/1 past the first, so the caller presses a key to see it/);
  });
});
