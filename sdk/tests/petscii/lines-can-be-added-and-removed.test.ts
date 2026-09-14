/**
 * Adding and removing a line on a PETSCII screen.
 *
 * "we need buttons in all screen editors to add and remove lines", and then
 * "yes fix petscii" (the sysop, 2026-09-14). The ANSI editor got this first;
 * a PETSCII artist had the same problem and no way to solve it but redrawing.
 *
 * 40x25 IS THE HARDWARE, not a preference - it is the VIC's text screen - so
 * inserting a line cannot make the picture taller. The bottom row falls off
 * and removing one pulls a blank up. The editor's undo is a stack of whole
 * surfaces, so one step puts the lost row back.
 *
 * The blank row takes the CURRENT colour rather than 0: a row of black spaces
 * on a black screen is invisible, and an artist who adds a line and types on
 * it expects to see what they type.
 */
import { blankSurface, insertLine, removeLine } from '../../petscii/editor-surface';

/** A surface whose every row is identifiable by its first screen code. */
function numbered() {
  const surface = blankSurface();
  for (let y = 0; y < surface.rows; y++) {
    surface.screen[y * surface.cols] = y + 1;      // 1-based so 0 reads as blank
    surface.colorRam[y * surface.cols] = 7;
  }
  return surface;
}

/** The first column, top to bottom. */
const spine = (s: ReturnType<typeof numbered>) =>
  Array.from({ length: s.rows }, (_, y) => s.screen[y * s.cols]);

describe('a line on a PETSCII screen', () => {
  it('is pushed in at the cursor, moving the rest down', () => {
    const after = insertLine(numbered(), 2);

    expect(after.screen[2 * after.cols]).toBe(0x20);   // the new blank
    expect(after.screen[3 * after.cols]).toBe(3);      // what was row 2
    expect(after.screen[4 * after.cols]).toBe(4);
  });

  it('does not make the screen taller than the VIC can show', () => {
    const before = numbered();

    expect(insertLine(before, 0).rows).toBe(before.rows);
    expect(removeLine(before, 0).rows).toBe(before.rows);
    expect(insertLine(before, 0).screen.length).toBe(before.screen.length);
  });

  it('drops the bottom row rather than growing', () => {
    const before = numbered();
    const lastBefore = before.screen[(before.rows - 1) * before.cols];

    const after = insertLine(before, 0);

    expect(lastBefore).toBe(before.rows);                       // it was there
    expect(after.screen[(after.rows - 1) * after.cols]).toBe(before.rows - 1);
  });

  it('is taken out, pulling the rest up', () => {
    const after = removeLine(numbered(), 1);

    expect(after.screen[1 * after.cols]).toBe(3);
    expect(after.screen[2 * after.cols]).toBe(4);
  });

  it('blanks the last row when one is removed', () => {
    const after = removeLine(numbered(), 0);

    expect(after.screen[(after.rows - 1) * after.cols]).toBe(0x20);
  });

  it('gives the blank row a colour that can be seen', () => {
    // Colour 0 is black, and a black row on a black screen is invisible.
    const after = insertLine(numbered(), 3, 5);

    expect(after.colorRam[3 * after.cols]).toBe(5);
  });

  it('leaves the surface it was given untouched', () => {
    // Every operation in this module is pure - that is what makes the
    // editor's undo a stack of snapshots rather than a byte log.
    const before = numbered();
    const spineBefore = spine(before);

    insertLine(before, 0);
    removeLine(before, 0);

    expect(spine(before)).toEqual(spineBefore);
  });

  it('carries the colours of the rows it moves', () => {
    const before = blankSurface();
    before.screen[1 * before.cols] = 42;
    before.colorRam[1 * before.cols] = 9;

    const after = insertLine(before, 0);

    expect(after.screen[2 * after.cols]).toBe(42);
    expect(after.colorRam[2 * after.cols]).toBe(9);
  });

  it('refuses a row that is not on the screen', () => {
    const before = numbered();

    expect(insertLine(before, -1)).toBe(before);
    expect(insertLine(before, 99)).toBe(before);
    expect(removeLine(before, -1)).toBe(before);
    expect(removeLine(before, 99)).toBe(before);
  });
});
