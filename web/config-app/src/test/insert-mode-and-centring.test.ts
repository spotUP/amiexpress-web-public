/**
 * Two things the artists asked the studio for (2026-09-14):
 *
 *   "users needs to be able to toggle insert mode on/off"
 *   "we need a function to center lines"
 *
 * Insert is the commonest job there is - dropping a missing letter into a
 * finished line without redrawing the rest of it - and overwrite was the only
 * thing this editor could do. Centring by counting columns and typing spaces
 * is how it was done before, and it is wrong every time the line changes.
 *
 * These drive the surface the editor actually edits, so a test fails if the
 * cells move the wrong way rather than if a helper's name changes.
 */
import { describe, expect, it } from 'vitest';
import {
  createSurface, insertCharacter, centreLine, typeCharacter, undo,
  type EditorSurface,
} from '../pages/screen-editor-state';
import { blankCanvas } from '../pages/screen-editor-state';

/** A surface holding one row of the given text, in a screen `width` wide. */
function surfaceWith(text: string, width = 20): EditorSurface {
  const canvas = blankCanvas(3, width);
  [...text].forEach((char, index) => {
    canvas[0][index] = { char, fg: 7, bg: 0 };
  });
  return createSurface(canvas);
}

/** Row `y` of a surface, as a string. */
function rowText(surface: EditorSurface, y = 0): string {
  return surface.canvas[y].map(cell => cell.char).join('');
}

describe('insert mode', () => {
  it('pushes the rest of the row right', () => {
    const before = surfaceWith('ABC');
    const after = insertCharacter(before, 1, 0, 'X');
    expect(rowText(after).trimEnd()).toBe('AXBC');
  });

  it('drops what falls off the right-hand edge, because the row ends there', () => {
    const before = surfaceWith('ABCDE', 5);
    const after = insertCharacter(before, 0, 0, 'X');
    expect(rowText(after)).toBe('XABCD');
  });

  it('writes the character in the colours the artist picked', () => {
    const before = { ...surfaceWith('AB'), fg: 11, bg: 4 };
    const after = insertCharacter(before, 0, 0, 'X');
    expect(after.canvas[0][0]).toMatchObject({ char: 'X', fg: 11, bg: 4 });
    // And the character it pushed keeps ITS colours.
    expect(after.canvas[0][1]).toMatchObject({ char: 'A', fg: 7, bg: 0 });
  });

  it('is one undo step for the whole shift', () => {
    const before = surfaceWith('ABC');
    const after = insertCharacter(before, 0, 0, 'X');
    expect(rowText(after).trimEnd()).toBe('XABC');
    expect(rowText(undo(after)).trimEnd()).toBe('ABC');
  });

  it('leaves overwriting alone - it is still what typing does by default', () => {
    const before = surfaceWith('ABC');
    const after = typeCharacter(before, 1, 0, 'X');
    expect(rowText(after).trimEnd()).toBe('AXC');
  });

  it('refuses a column that is not on the row', () => {
    const before = surfaceWith('ABC', 5);
    expect(insertCharacter(before, 9, 0, 'X')).toBe(before);
    expect(insertCharacter(before, -1, 0, 'X')).toBe(before);
  });
});

describe('centring a line', () => {
  it('puts the ink in the middle of the row', () => {
    const before = surfaceWith('HELLO', 11);
    const after = centreLine(before, 0);
    expect(rowText(after)).toBe('   HELLO   ');
  });

  it('moves a line that starts anywhere, not just at column 0', () => {
    const canvas = blankCanvas(1, 11);
    [...'HI'].forEach((char, index) => { canvas[0][index + 8] = { char, fg: 7, bg: 0 }; });
    const after = centreLine(createSurface(canvas), 0);
    expect(rowText(after)).toBe('    HI     ');
  });

  it('centres the whole block, spaces inside it included', () => {
    const before = surfaceWith('A B', 9);
    const after = centreLine(before, 0);
    expect(rowText(after)).toBe('   A B   ');
  });

  it('treats a space on a coloured background as ink, because it is', () => {
    // Half the art on this board is blocks of colour with no glyph in them.
    const canvas = blankCanvas(1, 7);
    canvas[0][0] = { char: ' ', fg: 7, bg: 4 };
    canvas[0][1] = { char: ' ', fg: 7, bg: 4 };
    const after = centreLine(createSurface(canvas), 0);
    expect(after.canvas[0][2].bg).toBe(4);
    expect(after.canvas[0][3].bg).toBe(4);
    expect(after.canvas[0][0].bg).toBe(0);
  });

  it('leaves an empty row exactly as it was', () => {
    const before = surfaceWith('', 10);
    expect(centreLine(before, 0)).toBe(before);
  });

  it('leaves a row that is already centred alone', () => {
    const before = surfaceWith('', 11);
    const typed = [...'HELLO'].reduce(
      (surface, char, index) => typeCharacter(surface, index + 3, 0, char),
      before,
    );
    expect(centreLine(typed, 0)).toBe(typed);
  });

  it('is one undo step', () => {
    const before = surfaceWith('HELLO', 11);
    const after = centreLine(before, 0);
    expect(rowText(after)).toBe('   HELLO   ');
    expect(rowText(undo(after)).trimEnd()).toBe('HELLO');
  });

  it('refuses a row that is not on the screen', () => {
    const before = surfaceWith('HELLO', 11);
    expect(centreLine(before, 99)).toBe(before);
  });
});
