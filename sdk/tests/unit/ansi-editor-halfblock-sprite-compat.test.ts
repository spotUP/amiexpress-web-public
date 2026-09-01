/**
 * The ANSI editor's half-block strokes must be legal sprite pixels.
 *
 * Task 3 of thoughts/shared/plans/2026-09-01-sprite-editor-on-the-ansi-editor.md,
 * and a MEASUREMENT before Task 4 depends on the answer. The studio's own
 * pixel mode (edit-doc's setPixel/floodFill) is being replaced by this
 * widget's half-block brush. decompilePixels() accepts exactly five cell
 * shapes and returns null for everything else - "cell-mode-only art" - so
 * if the widget paints a sixth shape, adopting it would silently cost the
 * studio pixel editing altogether. Both sides "use half blocks" is not
 * evidence; this is.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';
import { canvasToFrame } from '../../engines/graphics/cell-art/editor-canvas';
import { decompilePixels } from '../../engines/graphics/cell-art/halfblock';

function makeScreen(): any {
  return new Screen({
    title: 'ansi-editor-halfblock-compat',
    responsive: true,
    width: 100,
    height: 40,
  } as any);
}

describe('ANSIEditor half-block output is a decompilable sprite frame', () => {
  let screen: any;

  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const makeEditor = (): any => new ANSIEditor({
    parent: screen,
    canvasWidth: 2, canvasHeight: 1,
    initialMode: 'draw',
    transparentBackground: true,
  } as any);

  /**
   * Paint one half-cell through the widget's REAL mouse path. Half-block
   * strokes are dispatched from the 'mouse' handler's brushMode branch
   * (ansi-editor.ts's `if (this.brushMode === 'half-block') drawHalfBlock`)
   * - drawAtCursor() is the TEXT brush and paints a full block whatever the
   * brush mode says, so a probe calling it would measure the wrong path and
   * report a compatibility failure that does not exist.
   */
  const strokeHalfBlock = (editor: any, cellX: number, sub: 0 | 1, fg: number): void => {
    editor.switchBrushMode('half-block');
    editor.halfBlockSubY = sub;
    editor.currentFg = fg;
    editor.drawCanvas.emit('mouse', {
      x: editor.drawCanvas.ileft + cellX,
      y: editor.drawCanvas.itop,
      action: 'mousedown',
      button: 'left',
    });
  };

  /** One half-cell painted at (0,0), as a sprite frame. */
  const paint = (sub: 0 | 1, fg: number): any => {
    const editor = makeEditor();
    strokeHalfBlock(editor, 0, sub, fg);
    return canvasToFrame(editor.getCoreCanvas());
  };

  it('an upper-half stroke decompiles to a top pixel only', () => {
    const pixels = decompilePixels(paint(0, 4));
    expect(pixels).not.toBeNull();
    expect(pixels![0][0]).toBe(4);
    expect(pixels![1][0]).toBeNull();
  });

  it('a lower-half stroke decompiles to a bottom pixel only', () => {
    const pixels = decompilePixels(paint(1, 4));
    expect(pixels).not.toBeNull();
    expect(pixels![0][0]).toBeNull();
    expect(pixels![1][0]).toBe(4);
  });

  it('leaves untouched cells transparent, not black', () => {
    const pixels = decompilePixels(paint(0, 4));
    expect(pixels![0][1]).toBeNull();
    expect(pixels![1][1]).toBeNull();
  });

  it('stacks an upper and a lower stroke into one two-colour cell', () => {
    const editor = makeEditor();
    strokeHalfBlock(editor, 0, 0, 4);
    strokeHalfBlock(editor, 0, 1, 2);

    const pixels = decompilePixels(canvasToFrame(editor.getCoreCanvas()));
    expect(pixels).not.toBeNull();
    expect(pixels![0][0]).toBe(4);
    expect(pixels![1][0]).toBe(2);
  });
});

/**
 * Half-block strokes are undoable.
 *
 * Reported while drawing a sprite: "undo behaves weird". drawHalfBlock and
 * drawHalfBlockWithBg mutated the canvas directly and pushed NO undo state,
 * while every other painter went through the library. So in half-block mode
 * - which is how sprite art is drawn - Ctrl+Z skipped past every stroke to
 * whatever the last text-brush action had been.
 *
 * paintCell() exists for exactly this: its own doc comment names half-block
 * compositing as the case the ten ToolHandlers cannot express.
 */
describe('ANSIEditor half-block undo', () => {
  let screen: any;
  beforeEach(() => { screen = makeScreen(); });
  afterEach(() => screen?.destroy());

  const editorWith = (): any => new ANSIEditor({
    parent: screen, canvasWidth: 2, canvasHeight: 1,
    initialMode: 'draw', transparentBackground: true,
  } as any);

  const stroke = (editor: any, cellX: number, sub: 0 | 1, fg: number, action = 'mousedown') => {
    editor.switchBrushMode('half-block');
    editor.halfBlockSubY = sub;
    editor.currentFg = fg;
    editor.drawCanvas.emit('mouse', {
      x: editor.drawCanvas.ileft + cellX,
      y: editor.drawCanvas.itop,
      action, button: 'left',
    });
  };

  it('undoes one half-block stroke', () => {
    const editor = editorWith();
    expect(editor.getCoreCanvas()[0][0].transparent).toBe(true);

    stroke(editor, 0, 0, 4);
    editor.drawCanvas.emit('mouse', { x: 0, y: 0, action: 'mouseup' });
    expect(editor.getCoreCanvas()[0][0].transparent).toBeFalsy();

    editor.undo();
    expect(editor.getCoreCanvas()[0][0].transparent).toBe(true);
  });

  it('treats one drag as a single undo step, not one per cell', () => {
    const editor = editorWith();
    stroke(editor, 0, 0, 4, 'mousedown');
    stroke(editor, 1, 0, 4, 'mousemove');
    editor.drawCanvas.emit('mouse', { x: 0, y: 0, action: 'mouseup' });

    const painted = editor.getCoreCanvas();
    expect(painted[0][0].transparent).toBeFalsy();
    expect(painted[0][1].transparent).toBeFalsy();

    editor.undo();
    const after = editor.getCoreCanvas();
    expect(after[0][0].transparent).toBe(true);
    expect(after[0][1].transparent).toBe(true);
  });

  it('keeps separate strokes separately undoable', () => {
    const editor = editorWith();
    stroke(editor, 0, 0, 4);
    editor.drawCanvas.emit('mouse', { x: 0, y: 0, action: 'mouseup' });
    stroke(editor, 1, 0, 2);
    editor.drawCanvas.emit('mouse', { x: 0, y: 0, action: 'mouseup' });

    editor.undo();
    const after = editor.getCoreCanvas();
    expect(after[0][1].transparent).toBe(true);
    expect(after[0][0].transparent).toBeFalsy();
  });
});
