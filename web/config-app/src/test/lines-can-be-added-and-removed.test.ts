/**
 * Adding and removing a line in the screen editor.
 *
 * "we need buttons in all screen editors to add and remove lines" (the sysop,
 * 2026-09-14). Until now the only way to move art down a row was to select it
 * and paste it a line lower, which is a redraw rather than an edit.
 *
 * THE GRID DOES NOT CHANGE HEIGHT, and that is the decision worth pinning. A
 * screen is a fixed 80x25 - that is what the board sends and what the caller's
 * terminal shows without scrolling - so inserting a line pushes the bottom row
 * off and removing one pulls a blank in at the end. Growing the canvas would
 * produce a screen the board cannot send.
 *
 * Undo covers the lost row: the snapshot is taken before the shift, so one
 * Ctrl+Z puts it back. That is what makes dropping it acceptable rather than
 * destructive.
 */
import { describe, it, expect } from 'vitest';
import { createSurface, insertLine, removeLine, undo, blankCanvas } from '../pages/screen-editor-state';
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

    // Rows 2,3 move down; the blank lands at 2; row 4 falls off the bottom.
    expect(spine(after.canvas)).toBe('01 23');
  });

  it('does not make the screen taller than the board can send', () => {
    const surface = numbered();

    expect(insertLine(surface, 0).canvas).toHaveLength(5);
    expect(removeLine(surface, 0).canvas).toHaveLength(5);
  });

  it('is taken out, pulling the rest up', () => {
    const surface = numbered();

    const after = removeLine(surface, 1);

    // 1 goes, 2,3,4 come up, and the bottom row is blank.
    expect(spine(after.canvas)).toBe('0234 ');
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

    expect(spine(insertLine(surface, 4).canvas)).toBe('0123 ');
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
