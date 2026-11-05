/**
 * Adding and removing a line in the screen editor.
 *
 * "we need buttons in all screen editors to add and remove lines" (the sysop,
 * 2026-09-14), and then, the same evening: "ctrl+k in the editor should remove
 * lines for real though".
 *
 * REMOVING MAKES THE SCREEN SHORTER, and that is the decision worth pinning.
 * It used to pull the rest up and slide a blank row in at the bottom so the
 * grid stayed 25 tall. On screen that looks the same; in the FILE it is not,
 * because the editor saves `canvas.length` rows - so a six-row logo was
 * written out as twenty-four rows, six of art and eighteen of spaces. The
 * sysop cut the SAmiLog logo to six lines and the bulletin did not get one
 * line shorter, because the height it costs is the height of the file.
 *
 * The original rule was written against GROWING - a screen taller than 25 is
 * one the board cannot send - and that half still holds, so `insertLine` keeps
 * the cap and `removeLine` does not. Below the cap, inserting grows the screen
 * back; at the cap the bottom row falls off as it always did.
 *
 * The alternative was to trim trailing blank rows when the bulletin is built.
 * The sysop rejected it and was right to: "automatically trimming is not nice
 * sometimes we need blank lines". Trailing blanks can be deliberate, so the
 * artist says how tall the screen is and nothing guesses it for them.
 *
 * Undo covers a removal: the snapshot is taken before the splice.
 */
import { describe, it, expect } from 'vitest';
import { createSurface, insertLine, removeLine, undo, blankCanvas } from '../src/pages/screen-editor-state';
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';

/** A canvas whose every row is identifiable by its first character. */
function numbered(rows = 5, cols = 4) {
  const canvas = blankCanvas(rows, cols);
  for (let y = 0; y < rows; y++) canvas[y][0] = { char: String(y), fg: 7, bg: 0 };
  return createSurface(canvas);
}

/** The first column, top to bottom - the row order, readable. */
const spine = (canvas: Cell[][]) => canvas.map(row => row[0].char).join('');

describe('a line in the screen editor', () => {
  it('is pushed in at the cursor, moving the rest down', () => {
    const surface = numbered();

    const after = insertLine(surface, 2);

    // Rows 2,3,4 move down and the blank lands at 2. Nothing falls off: the
    // screen is under the cap, so it grows by one instead.
    expect(spine(after.canvas)).toBe('01 234');
  });

  it('removes for real - the screen gets shorter, and the file with it', () => {
    const surface = numbered();

    expect(removeLine(surface, 0).canvas).toHaveLength(4);
  });

  it('grows back when a line is added, up to what the board can send', () => {
    const surface = numbered();

    expect(insertLine(surface, 0).canvas).toHaveLength(6);
  });

  it('never grows past the 25 rows the board sends', () => {
    const full = numbered(25);

    expect(insertLine(full, 0).canvas).toHaveLength(25);
  });

  it('keeps at least one row - a screen with no rows is not a screen', () => {
    const single = numbered(1);

    expect(removeLine(single, 0)).toBe(single);
  });

  it('is taken out, pulling the rest up', () => {
    const surface = numbered();

    const after = removeLine(surface, 1);

    // 1 goes, 2,3,4 come up, and the bottom row is blank.
    expect(spine(after.canvas)).toBe('0234');
  });

  it('gives the pushed-off row back on undo', () => {
    // What makes losing the bottom row a bargain rather than a loss.
    const surface = numbered();

    const after = undo(insertLine(surface, 0));

    expect(spine(after.canvas)).toBe('01234');
  });

  it('gives a removed line back on undo', () => {
    const surface = numbered();

    const after = undo(removeLine(surface, 2));

    expect(spine(after.canvas)).toBe('01234');
  });

  it('inserting at the last row only blanks it', () => {
    const surface = numbered();

    expect(spine(insertLine(surface, 4).canvas)).toBe('0123 4');
  });

  it('refuses a row that is not on the canvas', () => {
    // Out of range is a no-op, not a crash and not a silent edit elsewhere.
    const surface = numbered();

    expect(insertLine(surface, -1)).toBe(surface);
    expect(insertLine(surface, 99)).toBe(surface);
    expect(removeLine(surface, -1)).toBe(surface);
    expect(removeLine(surface, 99)).toBe(surface);
  });

  it('keeps the colours of the rows it moves', () => {
    // A shift that dropped attributes would silently repaint the art.
    const canvas = blankCanvas(3, 2);
    canvas[1][0] = { char: 'A', fg: 4, bg: 6 };
    const surface = createSurface(canvas);

    const after = insertLine(surface, 0);

    expect(after.canvas[2][0]).toMatchObject({ char: 'A', fg: 4, bg: 6 });
  });
});
