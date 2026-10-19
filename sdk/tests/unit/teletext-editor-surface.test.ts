/**
 * The .tti editor's pure model: every op returns a new surface over the
 * edit.tf frame, and a plotted mosaic is what the board renders.
 */
import {
  blankSurface,
  typeChar,
  setCode,
  graphicsAt,
  plotMosaic,
  insertLine,
  removeLine,
  clearSurface,
  liftRegion,
  stampRegion,
  TELETEXT_CODES,
} from '../../teletext/editor-surface';
import { frameToTti, FRAME_COLS } from '../../teletext/edittf-frame';
import { renderNativeTti } from '../../teletext/render-native';

const at = (cells: Uint8Array, x: number, y: number): number => cells[y * FRAME_COLS + x];

describe('teletext editor surface', () => {
  it('blankSurface is 1000 spaces with no records', () => {
    const s = blankSurface();
    expect(s.cells).toHaveLength(1000);
    expect(s.cells.every((b) => b === 0x20)).toBe(true);
    expect(s.meta).toEqual({ head: [], tail: [], eol: '\n' });
  });

  it('typeChar writes at the cursor, advances, wraps, and leaves the input alone', () => {
    const blank = blankSurface();
    const a = typeChar(blank, 39, 0, 0x41);
    expect(at(a.surface.cells, 39, 0)).toBe(0x41);
    expect(a.cursor).toEqual({ x: 0, y: 1 });
    expect(at(blank.cells, 39, 0)).toBe(0x20);
    expect(typeChar(blank, 39, 24, 0x41).cursor).toEqual({ x: 39, y: 24 });
  });

  it('setCode places the named spacing attribute', () => {
    const s = setCode(blankSurface(), 3, 2, 'separated');
    expect(at(s.cells, 3, 2)).toBe(0x1a);
    expect(TELETEXT_CODES.graphicsWhite).toBe(0x17);
    expect(TELETEXT_CODES.alphaRed).toBe(0x01);
  });

  it('graphicsAt follows set-after colour codes left of x', () => {
    let s = setCode(blankSurface(), 2, 0, 'graphicsRed');
    s = setCode(s, 6, 0, 'alphaGreen');
    expect(graphicsAt(s, 2, 0)).toBe(false);
    expect(graphicsAt(s, 3, 0)).toBe(true);
    expect(graphicsAt(s, 6, 0)).toBe(true);
    expect(graphicsAt(s, 7, 0)).toBe(false);
    expect(graphicsAt(s, 3, 1)).toBe(false);
  });

  it('plotMosaic sets and clears sixels only in graphics cells', () => {
    const blank = blankSurface();
    expect(plotMosaic(blank, 2, 0, true)).toBe(blank);

    let s = setCode(blank, 0, 0, 'graphicsWhite');
    expect(plotMosaic(s, 0, 0, true)).toBe(s); // the attribute cell itself
    s = plotMosaic(s, 2, 0, true); // cell 1, top-left -> bit 1
    expect(at(s.cells, 1, 0)).toBe(0x21);
    s = plotMosaic(s, 3, 2, true); // cell 1, bottom-right -> bit 64
    expect(at(s.cells, 1, 0)).toBe(0x61);
    s = plotMosaic(s, 2, 0, false);
    expect(at(s.cells, 1, 0)).toBe(0x60);
  });

  it('a plotted mosaic renders as the matching sextant through the board renderer', () => {
    let s = setCode(blankSurface(), 0, 0, 'graphicsWhite');
    s = plotMosaic(s, 2, 0, true);
    const rendered = renderNativeTti(frameToTti(s.cells, { ...s.meta, head: ['PN,10000'] }));
    expect(rendered).not.toBeNull();
    const row0 = Array.from((rendered?.ansi ?? '').split('\n')[0].replace(/\x1b\[[0-9;]*m/g, ''));
    expect(row0[1]).toBe('\u{1FB00}');
  });

  it('insertLine and removeLine shift rows within the fixed 25', () => {
    const typed = typeChar(blankSurface(), 0, 5, 0x41).surface;
    const down = insertLine(typed, 5);
    expect(at(down.cells, 0, 5)).toBe(0x20);
    expect(at(down.cells, 0, 6)).toBe(0x41);
    const up = removeLine(down, 5);
    expect(Array.from(up.cells)).toEqual(Array.from(typed.cells));
  });

  it('clearSurface blanks cells and keeps the records', () => {
    const typed = typeChar({ ...blankSurface(), meta: { head: ['PN,10000'], tail: [], eol: '\n' } }, 4, 4, 0x41).surface;
    const cleared = clearSurface(typed);
    expect(cleared.cells.every((b) => b === 0x20)).toBe(true);
    expect(cleared.meta.head).toEqual(['PN,10000']);
  });

  it('liftRegion / stampRegion copy a rectangle and clip at the edge', () => {
    let s = typeChar(blankSurface(), 1, 1, 0x41).surface;
    s = typeChar(s, 2, 2, 0x42).surface;
    const region = liftRegion(s, { x: 2, y: 2 }, { x: 1, y: 1 });
    expect(region).toMatchObject({ cols: 2, rows: 2 });
    const stamped = stampRegion(blankSurface(), 39, 23, region);
    expect(at(stamped.cells, 39, 23)).toBe(0x41);
    expect(stamped.cells.filter((b) => b !== 0x20)).toHaveLength(1); // B clipped, not wrapped
  });
});
