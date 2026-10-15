/**
 * In half-block mode the cursor marks the HALF you will paint.
 *
 * Asked while drawing a Pengo egg: "the red marker dont align with the
 * blocks, or is that becasue its halfblocks?" - the second. The cursor is
 * one cell, but half-block art has two pixels per cell vertically, so it
 * covers both and cannot say which one the next stroke lands on.
 *
 * At actual size a half-cell is half a character row and there is nothing
 * to draw it with, so the cursor stays whole. From 2:1 up, scaleY is at
 * least two rows per cell and the cursor can take the half it means.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({ title: 'halfblock-cursor', responsive: true, width: 100, height: 40 } as any);
}

describe('ANSIEditor half-block cursor', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const editorAt = (scale: number): any => new ANSIEditor({
    parent: screen, canvasWidth: 4, canvasHeight: 3,
    cellScaleX: scale, cellScaleY: scale, initialMode: 'draw',
  } as any);

  it('covers the whole cell in text mode', () => {
    const editor = editorAt(4);
    editor.cursor = { line: 1, col: 2 };
    editor.updateDrawCursor();
    expect(editor.drawCursor.height).toBe(4);
  });

  /**
   * Asserted as the OFFSET between the two halves, not against a computed
   * absolute top: blessed's `.top` getter does not report the same frame of
   * reference the widget assigns into, so an absolute expectation tests the
   * getter rather than the cursor. Measured, not assumed - a probe printed
   * position.top 2 against a cursor top of 7.
   */
  const cursorFor = (sub: 0 | 1): { top: number; height: number } => {
    const editor = editorAt(4);
    editor.switchBrushMode('half-block');
    editor.halfBlockSubY = sub;
    editor.cursor = { line: 1, col: 2 };
    editor.updateDrawCursor();
    return { top: editor.drawCursor.top as number, height: editor.drawCursor.height as number };
  };

  it('is half a cell tall in half-block mode', () => {
    expect(cursorFor(0).height).toBe(2);
    expect(cursorFor(1).height).toBe(2);
  });

  it('sits on the lower half exactly one half-cell below the upper one', () => {
    const upper = cursorFor(0);
    const lower = cursorFor(1);
    expect(lower.top - upper.top).toBe(upper.height);
  });

  it('puts the upper half where a whole-cell cursor starts', () => {
    const editor = editorAt(4);
    editor.cursor = { line: 1, col: 2 };
    editor.updateDrawCursor();
    const whole = editor.drawCursor.top as number;
    expect(cursorFor(0).top).toBe(whole);
  });

  it('stays a whole cell at actual size, where half a row cannot be drawn', () => {
    const editor = editorAt(1);
    editor.switchBrushMode('half-block');
    editor.halfBlockSubY = 1;
    editor.cursor = { line: 1, col: 2 };
    editor.updateDrawCursor();
    expect(editor.drawCursor.height).toBe(1);
  });

  it('is as wide as the cell either way', () => {
    const editor = editorAt(4);
    editor.switchBrushMode('half-block');
    editor.updateDrawCursor();
    expect(editor.drawCursor.width).toBe(4);
  });
});

/**
 * The cursor shows what is under it, reversed.
 *
 * "the ansi/sprited don't change to half char when i hover a halfchar...
 * invert cart so halfchars are always visible even with cursor on"
 * (2026-09-02). The cursor was an opaque red block with the BRUSH character
 * in it, so the cell you were about to paint - the one that matters most in
 * half-block art - was the one you could not see.
 */
describe('drawing cursor over art', () => {
  let screen: any;
  beforeEach(() => { screen = new Screen({ title: 'cursor', responsive: true, width: 100, height: 30 } as any); });
  afterEach(() => screen?.destroy());

  const cursorText = (editor: any): string =>
    String(editor.drawCursor.content ?? '');

  it('draws the cell’s own glyph, not the brush', () => {
    const editor: any = new ANSIEditor({
      parent: screen, canvasWidth: 8, canvasHeight: 4, cellScaleX: 2, cellScaleY: 2,
    } as any);
    editor.cellCanvas[0][0] = { char: '▀', fg: 6, bg: 0 };
    editor.currentChar = 'X';
    editor.cursor = { line: 0, col: 0 };
    editor.updateDrawCursor();

    const text = cursorText(editor);
    expect(text).not.toContain('X');            // not the brush
    expect(text.replace(/\{[^}]*\}/g, '').trim().length).toBeGreaterThan(0);
  });

  it('reverses the colours so the position still reads as a cursor', () => {
    const editor: any = new ANSIEditor({
      parent: screen, canvasWidth: 8, canvasHeight: 4,
    } as any);
    editor.cellCanvas[1][2] = { char: '█', fg: 6, bg: 0 };
    editor.cursor = { line: 1, col: 2 };
    editor.updateDrawCursor();

    const text = cursorText(editor);
    // The canvas would draw this cell as cyan on black; the cursor shows
    // the same glyph with those two swapped.
    expect(text).toMatch(/-bg\}/);
    expect(text).toMatch(/black-fg/);
  });

  it('is still a solid marker on an empty cell, where there is nothing to reverse', () => {
    const editor: any = new ANSIEditor({
      parent: screen, canvasWidth: 8, canvasHeight: 4,
    } as any);
    editor.currentChar = '#';
    editor.cursor = { line: 0, col: 0 };
    editor.updateDrawCursor();

    expect(cursorText(editor)).toContain('#');
    expect(editor.drawCursor.style.bg).toBe('red');
  });
});
