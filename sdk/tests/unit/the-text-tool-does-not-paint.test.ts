/**
 * `getToolHandler('text')` used to answer `drawTool`.
 *
 * 'text' is in the DrawingTool union because the widget's tool row lists it
 * beside the nine canvas tools, but it is not a canvas tool at all: typing
 * puts characters at the cursor, and the widget handles that itself
 * (`handleToolClick`'s own `case 'text'`). The dispatcher's fallback meant
 * that ANY route which did go through it - a future caller, a host reusing
 * the library without the widget's switch - would paint with the draw tool
 * while the artist believed they were typing, and would push undo states for
 * strokes nobody asked for.
 *
 * The honest answer is a handler that does nothing. It keeps the dispatcher
 * total (every member of the union returns something, so the widget's
 * `getToolHandler(this.currentTool).onCancel(...)` is still safe to call
 * with the default tool) without inventing a canvas edit.
 */
import { EditorState } from '../../engines/ui/ansi-editor/core/editor-state';
import {
  getToolHandler,
  drawTool,
  undoDrawing,
} from '../../engines/ui/ansi-editor/tools/drawing-tools';
import * as Canvas from '../../engines/ui/ansi-editor/core/canvas';

function stateWithCanvas(): EditorState {
  const state = new EditorState();
  state.setCanvas(Canvas.createCanvas(10, 5));
  state.setCurrentChar('X');
  return state;
}

describe("the 'text' tool", () => {
  it('is not the draw tool', () => {
    expect(getToolHandler('text')).not.toBe(drawTool);
  });

  it('leaves the canvas alone when it is dispatched through', () => {
    const state = stateWithCanvas();
    const before = JSON.stringify(state.getCanvas());

    const handler = getToolHandler('text');
    handler.onStart(state, 2, 2);
    handler.onMove(state, 3, 2);
    handler.onEnd(state, 4, 2);

    expect(JSON.stringify(state.getCanvas())).toBe(before);
  });

  it('records nothing to undo', () => {
    const state = stateWithCanvas();
    const handler = getToolHandler('text');
    handler.onStart(state, 1, 1);
    handler.onEnd(state, 1, 1);

    // Nothing was drawn, so there is nothing to step back to.
    expect(undoDrawing(state)).toBe(false);
  });

  it('can be cancelled without throwing, which is what the widget does', () => {
    const state = stateWithCanvas();
    expect(() => getToolHandler('text').onCancel(state)).not.toThrow();
  });

  it('still answers the real handler for every canvas tool', () => {
    for (const tool of ['draw', 'line', 'box', 'box-fill', 'ellipse', 'ellipse-fill', 'fill', 'pick', 'select'] as const) {
      expect(getToolHandler(tool)).toBeDefined();
      expect(getToolHandler(tool)).not.toBe(getToolHandler('text'));
    }
  });
});
