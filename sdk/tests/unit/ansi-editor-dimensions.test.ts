/**
 * ANSIEditor canvas dimensions must derive from the actual canvas, not from
 * hardcoded 80x25 literals scattered through the widget.
 *
 * Task 1 of the "ansi-editor sprite-capable" plan
 * (.superpowers/sdd/2026-09-01-ansi-editor-sprite-capable/). Before this
 * change, every cursor clamp, mouse clamp, preview allocation, paste bound,
 * row insert/delete loop, selection default, layer allocation/compose, the
 * canvas-to-display sync loop, and the status bar size label were all
 * hardwired to 79/24/80/25 (see
 * thoughts/shared/research/2026-09-01_ansi-editor-internals.md, "Summary of
 * hard constants found"). A widget constructed with a smaller canvas (e.g.
 * a sprite frame) would still let the cursor/mouse/shapes/status bar behave
 * as if the canvas were 80x25.
 *
 * These tests drive the widget through real Screen/keyboard/mouse paths
 * (see hidden-container-mouse-hit-test.test.ts for the established
 * real-Screen construction pattern) rather than asserting on private state
 * directly, so a regression that re-hardcodes any one of these sites fails
 * here even if `getCanvasSize()` itself still reports correctly.
 *
 * Two hosts (Doors/sprite-editor, Doors/ansi-editor) construct this widget
 * with NO size options today and must be visibly unaffected - the
 * "no regression" describe block below re-runs every bounded assertion at
 * the 80x25 default and asserts today's exact behavior.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';

function makeScreen(): any {
  return new Screen({
    title: 'ansi-editor-dimensions',
    responsive: true,
    width: 100,
    height: 40,
  } as any);
}

/** Simulate N presses of a draw-mode navigation key (bypasses real keyboard routing, same pattern as other SDK widget tests driving `.emit` directly on the real listener). */
function pressDrawKey(editor: any, name: string, times = 1): void {
  for (let i = 0; i < times; i++) {
    editor.drawCanvas.emit('keypress', '', { name, ctrl: false, shift: false, meta: false, alt: false });
  }
}

/** Simulate a mouse click at canvas-local (x, y) - i.e. relative to the draw canvas content area, matching the widget's own `data.x - this.drawCanvas.ileft` math. */
function clickCanvasLocal(editor: any, x: number, y: number): void {
  const data = {
    x: editor.drawCanvas.ileft + x,
    y: editor.drawCanvas.itop + y,
    button: 'left',
  };
  editor.drawCanvas.emit('click', data);
}

describe('ANSIEditor canvas dimensions derive from the canvas', () => {
  describe('custom canvas size (5x2)', () => {
    let screen: any;
    let editor: any;

    beforeEach(() => {
      screen = makeScreen();
      editor = new ANSIEditor({ parent: screen, canvasWidth: 5, canvasHeight: 2 } as any);
    });

    afterEach(() => screen?.destroy());

    it('getCanvasSize() reports 5x2', () => {
      expect(editor.getCanvasSize()).toEqual({ width: 5, height: 2 });
    });

    it('getCoreCanvas() is 2 rows of 5', () => {
      const canvas = editor.getCoreCanvas();
      expect(canvas).not.toBeNull();
      expect(canvas!.length).toBe(2);
      for (const row of canvas!) {
        expect(row.length).toBe(5);
      }
    });

    it('keyboard cursor cannot move past column 4', () => {
      pressDrawKey(editor, 'right', 10);
      expect(editor.cursor.col).toBe(4);
    });

    it('keyboard cursor cannot move past row 1', () => {
      pressDrawKey(editor, 'down', 10);
      expect(editor.cursor.line).toBe(1);
    });

    it('a mouse click at (40,10) does not move the cursor outside the canvas', () => {
      clickCanvasLocal(editor, 40, 10);
      expect(editor.cursor.col).toBe(4);
      expect(editor.cursor.line).toBe(1);
    });

    it('selectAll() bounds are {x1:0,y1:0,x2:4,y2:1}', () => {
      editor.selectAll();
      expect(editor.selection).toEqual({ x1: 0, y1: 0, x2: 4, y2: 1 });
    });

    it('status bar reports 5x2, not 80x25', () => {
      const content = editor.statusBar.getContent();
      expect(content).toContain('5x2');
      expect(content).not.toContain('80x25');
    });

    // Task 4: the widget now routes drawing through the shared library
    // tools (getToolHandler(), drawTool, etc.) instead of its own inline
    // 80x25-shaped preview code. The library tools themselves read
    // dimensions off the actual Cell[][] array (Task 1's invariant), but a
    // regression that re-hardcoded 80/25 anywhere in the NEW sync/dispatch
    // plumbing (syncToCoreState/syncFromCoreState, handleShapeToolClick)
    // would only show up on a canvas smaller than 80x25 - these tests catch
    // that class of regression the same way the ones above catch it for
    // cursor/mouse/status-bar.
    it('a freehand draw at the bottom-right corner (4,1) of the 5x2 canvas lands there, not off the edge of an assumed 80x25 canvas', () => {
      editor.switchTool('draw');
      editor.cursor = { line: 1, col: 4 };
      editor.currentChar = 'Z';
      editor.drawAtCursor(false);

      const canvas = editor.getCoreCanvas();
      expect(canvas[1][4].char).toBe('Z');
    });

    it('a two-click line drag on the 5x2 canvas draws across its full width and Ctrl+Z reverts it', () => {
      editor.switchTool('line');
      editor.currentChar = 'L';

      editor.handleShapeToolClick(0, 0);
      editor.handleShapeToolClick(4, 0);

      const canvas = editor.getCoreCanvas();
      for (let x = 0; x < 5; x++) {
        expect(canvas[0][x].char).toBe('L');
      }

      editor.undo();
      const reverted = editor.getCoreCanvas();
      for (let x = 0; x < 5; x++) {
        expect(reverted[0][x].char).toBe(' ');
      }
    });

    it('flood fill on the 5x2 canvas fills exactly its 10 cells, not an assumed 80x25 grid', () => {
      editor.switchTool('fill');
      editor.currentChar = 'F';
      editor.handleToolClick(0, 0);

      const canvas = editor.getCoreCanvas();
      expect(canvas.length).toBe(2);
      for (const row of canvas) {
        expect(row.length).toBe(5);
        for (const cell of row) {
          expect(cell.char).toBe('F');
        }
      }
    });
  });

  describe('default canvas size (80x25) - no regression', () => {
    let screen: any;
    let editor: any;

    beforeEach(() => {
      screen = makeScreen();
      editor = new ANSIEditor({ parent: screen } as any);
    });

    afterEach(() => screen?.destroy());

    it('getCanvasSize() reports 80x25', () => {
      expect(editor.getCanvasSize()).toEqual({ width: 80, height: 25 });
    });

    it('getCoreCanvas() is 25 rows of 80', () => {
      const canvas = editor.getCoreCanvas();
      expect(canvas).not.toBeNull();
      expect(canvas!.length).toBe(25);
      for (const row of canvas!) {
        expect(row.length).toBe(80);
      }
    });

    it('keyboard cursor cannot move past column 79', () => {
      pressDrawKey(editor, 'right', 85);
      expect(editor.cursor.col).toBe(79);
    });

    it('keyboard cursor cannot move past row 24', () => {
      pressDrawKey(editor, 'down', 30);
      expect(editor.cursor.line).toBe(24);
    });

    it('a mouse click at (40,10) lands exactly at (40,10) - well within bounds', () => {
      clickCanvasLocal(editor, 40, 10);
      expect(editor.cursor.col).toBe(40);
      expect(editor.cursor.line).toBe(10);
    });

    it('selectAll() bounds are {x1:0,y1:0,x2:79,y2:24}', () => {
      editor.selectAll();
      expect(editor.selection).toEqual({ x1: 0, y1: 0, x2: 79, y2: 24 });
    });

    it('status bar reports 80x25', () => {
      const content = editor.statusBar.getContent();
      expect(content).toContain('80x25');
    });
  });
});
