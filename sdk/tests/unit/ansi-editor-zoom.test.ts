/**
 * ANSIEditor draws a cell larger than one character.
 *
 * Task 1 of thoughts/shared/plans/2026-09-01-sprite-editor-on-the-ansi-editor.md.
 * The sprite studio edits 5x2 sprites; at one character per cell that is a
 * five-by-two smudge in a 44-column panel, which is why the door built its
 * own painter with a hardcoded two-characters-per-cell instead of hosting
 * this widget. Zoom is presentation ONLY: getCoreCanvas() must keep
 * returning the sprite's real grid whatever magnification it is drawn at,
 * or every host reading the canvas back would have to know the scale.
 *
 * The click assertions go through the widget's REAL mouse listener
 * (drawCanvas.emit('click', ...) with the same `ileft`/`itop` offsets the
 * handler itself subtracts), not through the private mapping helper - a
 * test that calls the helper directly proves the arithmetic and nothing
 * about whether the handler uses it.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({
    title: 'ansi-editor-zoom',
    responsive: true,
    width: 100,
    height: 40,
  } as any);
}

/** Click at canvas-local (x, y) - the widget's own `data.x - drawCanvas.ileft` math. */
function clickCanvasLocal(editor: any, x: number, y: number): void {
  editor.drawCanvas.emit('click', {
    x: editor.drawCanvas.ileft + x,
    y: editor.drawCanvas.itop + y,
    button: 'left',
  });
}

describe('ANSIEditor canvas zoom', () => {
  let screen: any;

  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const make = (scale: number): any => new ANSIEditor({
    parent: screen,
    canvasWidth: 5,
    canvasHeight: 2,
    cellScaleX: scale,
    cellScaleY: scale,
    initialMode: 'draw',
  } as any);

  describe('no regression at the default scale', () => {
    it('defaults to one character per cell', () => {
      const editor: any = new ANSIEditor({
        parent: screen, canvasWidth: 5, canvasHeight: 2, initialMode: 'draw',
      } as any);
      expect(editor.getCellScale()).toEqual({ x: 1, y: 1 });
    });

    it('renders one row per cell row at the default scale', () => {
      const editor: any = new ANSIEditor({
        parent: screen, canvasWidth: 5, canvasHeight: 2, initialMode: 'draw',
      } as any);
      const content: string = editor.buildCanvasContent(
        () => ({ char: 'x', fg: 7, bg: 0 })
      );
      expect(content.split('\n').length).toBe(2);
    });

    it('maps an unscaled click one-to-one', () => {
      const editor: any = new ANSIEditor({
        parent: screen, canvasWidth: 5, canvasHeight: 2, initialMode: 'draw',
      } as any);
      clickCanvasLocal(editor, 3, 1);
      expect(editor.cursor.col).toBe(3);
      expect(editor.cursor.line).toBe(1);
    });
  });

  it('reports the scale it was given', () => {
    expect(make(4).getCellScale()).toEqual({ x: 4, y: 4 });
  });

  it('clamps a nonsense scale to at least one character', () => {
    const editor: any = new ANSIEditor({
      parent: screen, canvasWidth: 5, canvasHeight: 2,
      cellScaleX: 0, cellScaleY: -3, initialMode: 'draw',
    } as any);
    expect(editor.getCellScale()).toEqual({ x: 1, y: 1 });
  });

  it('does not change the canvas the host reads back', () => {
    const canvas = make(4).getCoreCanvas();
    expect(canvas).not.toBeNull();
    expect(canvas!.length).toBe(2);
    expect(canvas![0].length).toBe(5);
  });

  it('renders each cell scaleX characters wide and scaleY rows tall', () => {
    const editor: any = make(3);
    const content: string = editor.buildCanvasContent(
      (x: number, _y: number) => ({ char: String(x), fg: 7, bg: 0 })
    );
    const rows = content.split('\n');
    expect(rows.length).toBe(2 * 3);      // two cell rows, three screen rows each
    expect(rows[0]).toBe(rows[1]);        // a cell row's copies are identical
    expect(rows[1]).toBe(rows[2]);
    expect(rows[0].includes('000')).toBe(true);   // cell column 0, three times over
  });

  it('maps a scaled click back to the cell under it', () => {
    const editor: any = make(4);
    // Rendered column 9 sits inside cell column 2 (columns 8..11);
    // rendered row 5 sits inside cell row 1 (rows 4..7).
    clickCanvasLocal(editor, 9, 5);
    expect(editor.cursor.col).toBe(2);
    expect(editor.cursor.line).toBe(1);
  });

  it('paints the cell the click landed on, not the one at the raw coordinates', () => {
    const editor: any = make(4);
    editor.currentChar = '#';
    clickCanvasLocal(editor, 9, 5);
    const canvas = editor.getCoreCanvas()!;
    expect(canvas[1][2].char).toBe('#');
    expect(canvas[0][0].char).not.toBe('#');
  });

  it('covers the whole magnified cell with the cursor overlay', () => {
    const editor: any = make(4);
    clickCanvasLocal(editor, 9, 5);
    expect(editor.drawCursor.width).toBe(4);
    expect(editor.drawCursor.height).toBe(4);
  });
});

/**
 * Magnifying half-block art.
 *
 * Reported from a screenshot of the sprite studio: a crocodile drawn in
 * half blocks came out as horizontal stripes. Repeating a '▀' four times
 * down gives four rows each showing "upper half filled" - a stripe pattern.
 * What magnification means for that cell is two solid rows of the TOP
 * colour then two of the BOTTOM one, because the glyph's two halves are
 * pixels, not decoration.
 */
describe('ANSIEditor zoom of half-block cells', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const rowsOf = (cell: any, scale: number): string[] => {
    const editor: any = new ANSIEditor({
      parent: screen, canvasWidth: 1, canvasHeight: 1,
      cellScaleX: scale, cellScaleY: scale, initialMode: 'draw',
    } as any);
    return (editor.buildCanvasContent(() => cell) as string).split('\n');
  };

  it('splits an upper-half block into top colour over bottom colour', () => {
    const rows = rowsOf({ char: '▀', fg: 2, bg: 4 }, 4);
    expect(rows.length).toBe(4);
    // The two halves must differ, and each half must be internally uniform.
    expect(rows[0]).toBe(rows[1]);
    expect(rows[2]).toBe(rows[3]);
    expect(rows[0]).not.toBe(rows[2]);
    // Solid, not striped: no half-block glyph survives magnification.
    for (const row of rows) {
      expect(row.includes('▀')).toBe(false);
      expect(row.includes('▄')).toBe(false);
    }
  });

  it('splits a lower-half block the other way up', () => {
    const upper = rowsOf({ char: '▀', fg: 2, bg: 4 }, 4);
    const lower = rowsOf({ char: '▄', fg: 2, bg: 4 }, 4);
    // '▄' is '▀' with the colours swapped, so its halves are the mirror.
    expect(lower[0]).toBe(upper[2]);
    expect(lower[3]).toBe(upper[1]);
  });

  it('magnifies a full block as one solid colour', () => {
    const rows = rowsOf({ char: '█', fg: 5, bg: 5 }, 4);
    expect(new Set(rows).size).toBe(1);
    expect(rows[0].includes('▀')).toBe(false);
  });

  it('still repeats an ordinary character, which is not a pixel pair', () => {
    const rows = rowsOf({ char: 'A', fg: 7, bg: 0 }, 3);
    expect(rows.length).toBe(3);
    expect(new Set(rows).size).toBe(1);
    expect(rows[0].includes('AAA')).toBe(true);
  });

  it('gives an odd scale the extra row to the top half', () => {
    const rows = rowsOf({ char: '▀', fg: 2, bg: 4 }, 5);
    expect(rows.length).toBe(5);
    expect(rows[0]).toBe(rows[2]);          // three rows of top colour
    expect(rows[3]).toBe(rows[4]);          // two of bottom
    expect(rows[2]).not.toBe(rows[3]);
  });
});

/**
 * The transparency guide is a marker, not a texture.
 *
 * A transparent cell paints a dim dot so an artist can tell a HOLE from an
 * opaque black cell. Magnified, that dot was repeated across every
 * character of the cell, so a zoomed hole became a filled grid of dots -
 * reported from a crocodile sprite as "dotted artefacts". One dot per cell
 * says the same thing without competing with the art.
 */
describe('ANSIEditor transparency guide when magnified', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const holeRows = (scale: number): string[] => {
    const editor: any = new ANSIEditor({
      parent: screen, canvasWidth: 1, canvasHeight: 1,
      cellScaleX: scale, cellScaleY: scale,
      initialMode: 'draw', transparentBackground: true,
    } as any);
    return (editor.buildCanvasContent(
      () => ({ char: ' ', fg: 7, bg: 0, transparent: true })
    ) as string).split('\n');
  };

  it('marks a magnified hole once, not in every character of it', () => {
    const rows = holeRows(4);
    const dots = rows.join('').split('.').length - 1;
    expect(dots).toBe(1);
  });

  it('puts the mark inside the cell, not at its corner', () => {
    const rows = holeRows(4);
    const marked = rows.findIndex(r => r.includes('.'));
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBeLessThan(rows.length - 1);
  });

  it('still marks every hole at actual size, where there is only one character', () => {
    const rows = holeRows(1);
    expect(rows.join('').split('.').length - 1).toBe(1);
  });

  it('keeps the magnified hole the right size', () => {
    const rows = holeRows(4);
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.replace(/\{[^}]*\}/g, '').length).toBe(4);
    }
  });
});
