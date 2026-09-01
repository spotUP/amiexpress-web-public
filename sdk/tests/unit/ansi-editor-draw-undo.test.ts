/**
 * ANSIEditor draw-mode undo/redo, driven through the widget's real
 * keyboard/mouse event paths.
 *
 * Task 4 of the "ansi-editor sprite-capable" plan
 * (.superpowers/sdd/2026-09-01-ansi-editor-sprite-capable/). Before this
 * change, the widget reimplemented every drawing tool inline
 * (handleToolClick()'s switch, the shape-preview switch) instead of calling
 * the ten imported core-library tool handlers (drawTool, lineTool, boxTool,
 * boxFillTool, ellipseTool, ellipseFillTool, fillTool, pickTool, selectTool,
 * getToolHandler) or the undo primitives (undoDrawing, clearUndoStack) - all
 * twelve were dead imports (research section 4-5). Ctrl+Z/Ctrl+Y/U were
 * wired in draw mode but inert: they only ever manipulated the unrelated
 * text-mode `this.undoStack` (an array of whole-document string snapshots),
 * which draw-mode operations never pushed onto.
 *
 * This file drives the widget exactly the way ansi-editor-dimensions.test.ts
 * does - real Screen, real `drawCanvas.emit('keypress'|'click'|'mouse', ...)`
 * calls - and asserts on the actual canvas content the widget renders from,
 * not on source text.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({
    title: 'ansi-editor-draw-undo',
    responsive: true,
    width: 100,
    height: 40,
  } as any);
}

/**
 * Switch drawing tool by calling the widget's real switchTool() directly.
 * The single-letter keyboard shortcuts (t/d/l/r/e/f/p/s) only work when the
 * CURRENT tool is not 'text' - the widget's default tool is 'text'
 * (Moebius-style: typing captures every key while active), so a keyboard
 * shortcut can never be the FIRST tool switch in a test. Calling switchTool()
 * directly still exercises the widget's real tool-switch code path
 * (including its in-progress-shape-cancel/chunk-flush behavior), it just
 * skips re-deriving "which key means which tool", which is not what these
 * tests are about.
 */
function switchToTool(editor: any, tool: string): void {
  editor.switchTool(tool);
}

/** Press a Ctrl+<key> combination on the draw canvas (Ctrl+Z / Ctrl+Y). */
function pressCtrl(editor: any, name: string): void {
  editor.drawCanvas.emit('keypress', '', { name, ctrl: true, shift: false, meta: false, alt: false });
}

/** Press Space on the draw canvas - draws at the cursor for non-text tools. */
function pressSpace(editor: any): void {
  editor.drawCanvas.emit('keypress', ' ', { name: 'space', ctrl: false, shift: false, meta: false, alt: false });
}

/** Simulate a left-mouse click at canvas-local (x, y), matching the widget's own ileft/itop math. */
function clickCanvasLocal(editor: any, x: number, y: number): void {
  editor.drawCanvas.emit('click', {
    x: editor.drawCanvas.ileft + x,
    y: editor.drawCanvas.itop + y,
    button: 'left',
  });
}

/** Simulate a mouse action (e.g. 'mousemove') at canvas-local (x, y). */
function mouseAction(editor: any, action: string, x: number, y: number): void {
  editor.drawCanvas.emit('mouse', {
    action,
    x: editor.drawCanvas.ileft + x,
    y: editor.drawCanvas.itop + y,
    button: 'left',
  });
}

describe('ANSIEditor draw-mode undo/redo (via real key/mouse dispatch)', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen } as any); // default 80x25, initialMode: draw
  });

  afterEach(() => screen?.destroy());

  it('drawing a character then Ctrl+Z reverts it, and Ctrl+Y redoes it', () => {
    switchToTool(editor, 'draw');
    editor.cursor = { line: 3, col: 4 };
    editor.currentChar = 'X';

    pressSpace(editor);
    expect(editor.getCoreCanvas()[3][4].char).toBe('X');

    pressCtrl(editor, 'z');
    expect(editor.getCoreCanvas()[3][4].char).toBe(' ');

    pressCtrl(editor, 'y');
    expect(editor.getCoreCanvas()[3][4].char).toBe('X');
  });

  it('a dragged line commits as ONE undo entry - one Ctrl+Z reverts the whole line, not just the last preview repaint', () => {
    switchToTool(editor, 'line');
    editor.currentChar = 'L';

    clickCanvasLocal(editor, 2, 2); // first click: start
    // Multiple preview repaints while dragging - must not create multiple
    // undo entries (each onMove replaces the canvas array, but only onStart
    // pushed to the undo stack).
    mouseAction(editor, 'mousemove', 3, 2);
    mouseAction(editor, 'mousemove', 4, 2);
    mouseAction(editor, 'mousemove', 5, 2);
    clickCanvasLocal(editor, 5, 2); // second click: commit

    const canvas = editor.getCoreCanvas();
    expect(canvas[2][2].char).toBe('L');
    expect(canvas[2][3].char).toBe('L');
    expect(canvas[2][4].char).toBe('L');
    expect(canvas[2][5].char).toBe('L');

    pressCtrl(editor, 'z');

    const reverted = editor.getCoreCanvas();
    expect(reverted[2][2].char).toBe(' ');
    expect(reverted[2][3].char).toBe(' ');
    expect(reverted[2][4].char).toBe(' ');
    expect(reverted[2][5].char).toBe(' ');

    // A single undo reverted the WHOLE line - there is nothing left from
    // this operation for a second Ctrl+Z to partially unwind further.
    // (The canvas started blank, so a second undo is a documented no-op.)
    pressCtrl(editor, 'z');
    const stillBlank = editor.getCoreCanvas();
    expect(stillBlank[2][2].char).toBe(' ');
  });

  it('flood fill then Ctrl+Z reverts the whole filled region', () => {
    switchToTool(editor, 'fill');
    editor.currentChar = 'F';

    clickCanvasLocal(editor, 10, 10);

    const filled = editor.getCoreCanvas();
    // A blank uniform canvas flood-fills entirely from any point.
    expect(filled[0][0].char).toBe('F');
    expect(filled[24][79].char).toBe('F');

    pressCtrl(editor, 'z');

    const reverted = editor.getCoreCanvas();
    expect(reverted[0][0].char).toBe(' ');
    expect(reverted[24][79].char).toBe(' ');
  });

  it('two editors open at once do not undo each other', () => {
    const screenB = makeScreen();
    const editorB: any = new ANSIEditor({ parent: screenB } as any);

    try {
      switchToTool(editor, 'draw');
      editor.cursor = { line: 1, col: 1 };
      editor.currentChar = 'A';
      pressSpace(editor);

      switchToTool(editorB, 'draw');
      editorB.cursor = { line: 1, col: 1 };
      editorB.currentChar = 'B';
      pressSpace(editorB);

      expect(editor.getCoreCanvas()[1][1].char).toBe('A');
      expect(editorB.getCoreCanvas()[1][1].char).toBe('B');

      // Undo editor A only.
      pressCtrl(editor, 'z');

      expect(editor.getCoreCanvas()[1][1].char).toBe(' ');
      // Editor B is completely unaffected by A's undo.
      expect(editorB.getCoreCanvas()[1][1].char).toBe('B');
    } finally {
      screenB.destroy();
    }
  });

  it("switching tools mid-shape-drag abandons the in-progress shape (matches today's behavior of never touching the canvas until the second click)", () => {
    switchToTool(editor, 'line');
    editor.currentChar = 'L';

    clickCanvasLocal(editor, 6, 6); // first click: start
    mouseAction(editor, 'mousemove', 8, 6); // in-progress preview paints onto the canvas

    // Abandon by switching tools instead of completing the shape.
    switchToTool(editor, 'draw');

    const canvas = editor.getCoreCanvas();
    expect(canvas[6][6].char).toBe(' ');
    expect(canvas[6][8].char).toBe(' ');
  });

  it('the ellipse tool now treats the two clicks as a bounding-box diagonal (library convention), not center+radius (the old inline convention) - a named, deliberate geometry change; Ctrl+Z still reverts it as one entry', () => {
    switchToTool(editor, 'ellipse');
    editor.currentChar = 'E';

    // A degenerate horizontal ellipse (ry=0) is easiest to pin exactly:
    // clicking (10,10) then (20,10) draws a straight horizontal segment.
    clickCanvasLocal(editor, 10, 10);
    clickCanvasLocal(editor, 20, 10);

    const canvas = editor.getCoreCanvas();
    // Library convention: center = floor(midpoint) = (15,10),
    // rx = floor(abs(20-10)/2) = 5 -> spans columns 10..20.
    expect(canvas[10][15].char).toBe('E'); // center
    expect(canvas[10][10].char).toBe('E'); // left edge of the bounding box
    expect(canvas[10][20].char).toBe('E'); // right edge of the bounding box
    // NOT the old inline convention, which would have centered the ellipse
    // AT the first click (10,10) with rx = full distance (10), spanning
    // columns 0..20 - column 5 would also be painted under that convention.
    expect(canvas[10][5].char).toBe(' ');

    pressCtrl(editor, 'z');
    const reverted = editor.getCoreCanvas();
    expect(reverted[10][15].char).toBe(' ');
  });
});

describe("ANSIEditor text mode's own undo is unchanged", () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen, initialMode: 'text' } as any);
  });

  afterEach(() => screen?.destroy());

  it('setContent() pushes text-mode undo snapshots and Ctrl+Z still reverts between them', () => {
    editor.setContent('first');
    editor.setContent('second');

    expect(editor.lines.join('\n')).toBe('second');

    editor.undo();

    expect(editor.lines.join('\n')).toBe('first');
  });
});
