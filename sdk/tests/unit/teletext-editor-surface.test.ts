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
  attributesAt,
  attributeRun,
  paintMosaic,
  typeCharColoured,
  eraseAt,
  sixelLine,
  sixelBox,
  paintSixels,
  fillSixels,
  pickColours,
  COLOUR_NEEDS_ROOM,
  CODE_CELL_TAKEN,
  DOUBLE_HEIGHT_LOWER_ROW,
} from '../../teletext/editor-surface';
import { processRow } from '../../teletext/marco/state-machine/state-machine';
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

  it('clearSurface drops X/26 enhancement packets, which would draw over the cleared page', () => {
    const head = ['PN,10000', 'OL,26,@AB', 'OL,27,@CD', 'OL,28,@EF'];
    const cleared = clearSurface({ ...blankSurface(), meta: { head, tail: [], eol: '\n' } });
    expect(cleared.meta.head).toEqual(['PN,10000', 'OL,27,@CD', 'OL,28,@EF']);
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

  describe('colours the artist picks', () => {
    const row = (cells: Uint8Array, y: number): number[] => Array.from(cells.subarray(y * FRAME_COLS, (y + 1) * FRAME_COLS));

    it('paintMosaic puts the graphics colour code left of a blank row and draws the sixel', () => {
      const { surface, blocked } = paintMosaic(blankSurface(), 10, 3, 1, 0); // cell (5, 1), top-left
      expect(blocked).toBeNull();
      expect(at(surface.cells, 4, 1)).toBe(0x11);
      expect(at(surface.cells, 5, 1)).toBe(0x21);
      expect(frameToTti(surface.cells, surface.meta)).toBe('PN,10000\nOL,1,    \x91!\n');
      // The next sixel in the same colour needs no second code.
      const again = paintMosaic(surface, 12, 3, 1, 0).surface;
      expect(row(again.cells, 1).slice(4, 7)).toEqual([0x11, 0x21, 0x21]);
    });

    it('a background costs New Background between two colour codes; black costs Black Background', () => {
      const blue = paintMosaic(blankSurface(), 10, 0, 7, 4).surface;
      expect(row(blue.cells, 0).slice(2, 6)).toEqual([0x14, 0x1d, 0x17, 0x21]);
      expect(attributesAt(blue, 5, 0)).toEqual({ fg: 7, bg: 4, graphics: true });
      expect(attributeRun({ fg: 7, bg: 4, graphics: true }, { fg: 7, bg: 0, graphics: true })).toEqual([0x1c]);
      expect(attributeRun({ fg: 7, bg: 4, graphics: false }, { fg: 2, bg: 0, graphics: true })).toEqual([0x1c, 0x12]);
    });

    it('does not draw when the cell left of the run is a letter, or the run starts in column 0', () => {
      const hello = typeChar(blankSurface(), 0, 0, 0x48).surface;
      const left = paintMosaic(hello, 2, 0, 1, 0); // cell 1; its left is the H
      expect(left.blocked).toBe(COLOUR_NEEDS_ROOM);
      expect(left.surface).toBe(hello);
      expect(paintMosaic(blankSurface(), 0, 0, 1, 0).blocked).toBe(COLOUR_NEEDS_ROOM);
      expect(typeCharColoured(hello, 1, 0, 0x41, 2, 0).blocked).toBe(COLOUR_NEEDS_ROOM);
    });

    it('gives the next thing on the row its own colour back', () => {
      // "AB" in white at 10-11; red text typed at 4 must not turn them red.
      let s = typeChar(blankSurface(), 10, 0, 0x41).surface;
      s = typeChar(s, 11, 0, 0x42).surface;
      const typed = typeCharColoured(s, 4, 0, 0x58, 1, 0);
      expect(typed.blocked).toBeNull();
      expect(typed.cursor).toEqual({ x: 5, y: 0 });
      expect(at(typed.surface.cells, 3, 0)).toBe(0x01);
      expect(at(typed.surface.cells, 4, 0)).toBe(0x58);
      expect(at(typed.surface.cells, 9, 0)).toBe(0x07);
      expect(attributesAt(typed.surface, 10, 0)).toEqual(attributesAt(s, 10, 0));
      // Typing on in red needs no new code.
      expect(at(typeCharColoured(typed.surface, 5, 0, 0x59, 1, 0).surface.cells, 4, 0)).toBe(0x58);
    });

    it('a stroke drawn on leftwards pushes its colour code ahead instead of leaving a hole', () => {
      // Started at cell 10, the code sits in cell 9. Drawing on over cells
      // 9, 8, 7 used to skip 9 for good: a black column inside the shape.
      let s = paintMosaic(blankSurface(), 20, 0, 7, 0).surface;
      expect(at(s.cells, 9, 0)).toBe(0x17);
      for (const px of [18, 16, 14]) {
        const edit = paintMosaic(s, px, 0, 7, 0);
        expect(edit.blocked).toBeNull();
        s = edit.surface;
      }
      expect(row(s.cells, 0).slice(6, 11)).toEqual([0x17, 0x21, 0x21, 0x21, 0x21]);
      // A background run (three codes) slides as one, in order.
      let blue = paintMosaic(blankSurface(), 20, 0, 7, 4).surface;
      expect(row(blue.cells, 0).slice(7, 11)).toEqual([0x14, 0x1d, 0x17, 0x21]);
      blue = paintMosaic(blue, 18, 0, 7, 4).surface;
      expect(row(blue.cells, 0).slice(6, 11)).toEqual([0x14, 0x1d, 0x17, 0x21, 0x21]);
      expect(attributesAt(blue, 9, 0)).toEqual({ fg: 7, bg: 4, graphics: true });
      // With no spaces to slide onto, the code cell stays as it is.
      const edge = paintMosaic(blankSurface(), 2, 0, 7, 0).surface;
      const stuck = paintMosaic(edge, 0, 0, 7, 0);
      expect(stuck.surface).toBe(edge);
      expect(stuck.blocked).toBe(CODE_CELL_TAKEN);
    });

    it('joining two blobs drawn apart fills the code cell left between them', () => {
      // Blob B at cell 6 (code in 5), then blob A from cell 2 (code in 1)
      // dragged right to cell 4. Cell 5's code now sits between two blocks
      // and repeats what cell 1 already says: it gives way to the sixel.
      let s = paintMosaic(blankSurface(), 12, 0, 7, 0).surface;
      for (const px of [4, 6, 8]) s = paintMosaic(s, px, 0, 7, 0).surface;
      expect(row(s.cells, 0).slice(1, 7)).toEqual([0x17, 0x21, 0x21, 0x21, 0x17, 0x21]);
      const joined = paintMosaic(s, 10, 0, 7, 0);
      expect(joined.blocked).toBeNull();
      expect(row(joined.surface.cells, 0).slice(1, 7)).toEqual([0x17, 0x21, 0x21, 0x21, 0x21, 0x21]);
      // A code that does change the colour after it is kept.
      let red = paintMosaic(blankSurface(), 12, 0, 1, 0).surface;
      for (const px of [4, 6, 8]) red = paintMosaic(red, px, 0, 7, 0).surface;
      expect(at(red.cells, 5, 0)).toBe(0x11);
      // It cannot slide onto the block left of it, so the artist is told why.
      const refused = paintMosaic(red, 10, 0, 7, 0);
      expect(refused.surface).toBe(red);
      expect(refused.blocked).toBe(CODE_CELL_TAKEN);
    });

    it('eraseAt clears a sixel in a block and blanks a letter, never an attribute', () => {
      const drawn = paintMosaic(blankSurface(), 10, 3, 1, 0).surface;
      expect(at(eraseAt(drawn, 10, 3).cells, 5, 1)).toBe(0x20);
      expect(eraseAt(drawn, 8, 3)).toBe(drawn); // the 0x11 code cell
      const hello = typeChar(blankSurface(), 0, 0, 0x48).surface;
      expect(at(eraseAt(hello, 0, 0).cells, 0, 0)).toBe(0x20);
    });
  });

  describe('the ANSI editor shape tools on the sixel grid', () => {
    it('sixelLine runs end to end; sixelBox is an edge or a whole rectangle', () => {
      expect(sixelLine({ px: 0, py: 0 }, { px: 3, py: 0 })).toHaveLength(4);
      expect(sixelLine({ px: 0, py: 0 }, { px: 2, py: 2 })).toEqual([
        { px: 0, py: 0 }, { px: 1, py: 1 }, { px: 2, py: 2 },
      ]);
      expect(sixelBox({ px: 4, py: 3 }, { px: 2, py: 5 }, false)).toHaveLength(8);
      expect(sixelBox({ px: 4, py: 3 }, { px: 2, py: 5 }, true)).toHaveLength(9);
    });

    it('paintSixels draws a filled two-cell block in one colour behind one code', () => {
      const { surface, blocked } = paintSixels(blankSurface(), sixelBox({ px: 4, py: 0 }, { px: 7, py: 2 }, true), 3, 0);
      expect(blocked).toBeNull();
      expect(Array.from(surface.cells.subarray(1, 4))).toEqual([0x13, 0x7f, 0x7f]);
    });

    it('fillSixels fills the empty sixels a box walls in, and pickColours reads them back', () => {
      const box = paintSixels(blankSurface(), sixelBox({ px: 4, py: 3 }, { px: 9, py: 8 }, false), 7, 0).surface;
      const filled = fillSixels(box, { px: 6, py: 5 }, 7, 0);
      expect(filled.blocked).toBeNull();
      // Cells (2..4, 1..2) are every sixel lit now.
      for (let y = 1; y <= 2; y++) for (let x = 2; x <= 4; x++) expect(at(filled.surface.cells, x, y)).toBe(0x7f);
      expect(at(filled.surface.cells, 5, 1)).toBe(0x20); // outside the wall
      expect(pickColours(filled.surface, 3, 1)).toEqual({ fg: 7, bg: 0 });
      expect(fillSixels(box, { px: 4, py: 3 }, 7, 0).surface).toBe(box); // a lit sixel
    });
  });

  describe('agrees with the renderer (ETSI EN 300 706 s.12.2)', () => {
    const withRow = (y: number, bytes: number[]) => {
      const s = blankSurface();
      bytes.forEach((b, i) => { s.cells[y * FRAME_COLS + i] = b; });
      return s;
    };

    it('reads Level 2.5 black colour codes 0x00 and 0x10 as black, like the renderer', () => {
      const alpha = withRow(1, [0x01, 0x41, 0x00, 0x41]);
      expect(attributesAt(alpha, 3, 1)).toEqual({ fg: 0, bg: 0, graphics: false });
      const mosaic = withRow(1, [0x11, 0x3f, 0x10, 0x3f]);
      expect(attributesAt(mosaic, 3, 1)).toEqual({ fg: 0, bg: 0, graphics: true });
      const back = withRow(1, [0x11, 0x00, 0x41]);
      expect(graphicsAt(back, 2, 1)).toBe(false);
      expect(processRow(back.cells.subarray(FRAME_COLS, 2 * FRAME_COLS))[2].charsetMode).toBe(0);
    });

    it('matches the renderer\'s colours for every cell of a row', () => {
      const s = withRow(1, [0x01, 0x1d, 0x41, 0x12, 0x00, 0x1d, 0x1c, 0x10, 0x3f, 0x04, 0x41]);
      const cells = processRow(s.cells.subarray(FRAME_COLS, 2 * FRAME_COLS));
      for (let x = 0; x < 12; x++) {
        if (s.cells[FRAME_COLS + x] < 0x20) continue; // what a character there would get
        const a = attributesAt(s, x, 1);
        expect([x, a.fg, a.bg]).toEqual([x, cells[x].fgColor, cells[x].bgColor]);
      }
    });

    it('refuses to draw or type on the row below a double-height row', () => {
      const s = withRow(1, [0x0d, 0x41]);
      const painted = paintMosaic(s, 10, 6, 1, 0); // cell (5, 2)
      expect(painted).toEqual({ surface: s, blocked: DOUBLE_HEIGHT_LOWER_ROW });
      const typed = typeCharColoured(s, 5, 2, 0x41, 7, 0);
      expect(typed).toEqual({ surface: s, blocked: DOUBLE_HEIGHT_LOWER_ROW, cursor: { x: 5, y: 2 } });
      // The row after the lower row is a row like any other.
      expect(paintMosaic(s, 10, 9, 1, 0).blocked).toBeNull();
      expect(typeCharColoured(s, 5, 3, 0x41, 7, 0).blocked).toBeNull();
    });
  });
});
