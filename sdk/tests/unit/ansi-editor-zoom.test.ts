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
