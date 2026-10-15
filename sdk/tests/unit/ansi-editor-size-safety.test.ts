/**
 * ANSIEditor's `setCoreCanvas()` and `newDocument()` must not leave a stale
 * reference behind when the underlying canvas is replaced.
 *
 * Fix round 1 on Task 1 of the "ansi-editor sprite-capable" plan
 * (.superpowers/sdd/2026-09-01-ansi-editor-sprite-capable/). Both methods
 * reassign `this.cellCanvas` to a new Cell[][] array, but `composeLayers()`
 * (and therefore `mergeLayerDown()`, `flattenLayers()`, and anything else
 * that reads layer content for output) reads `this.layers[activeLayerIndex]
 * .canvas` directly, NOT `this.cellCanvas`. Before this fix, that layer
 * entry kept pointing at the OLD canvas after either call, so a merge-down,
 * visibility toggle, or flatten-on-save after a frame swap or File > New
 * would silently emit stale content.
 *
 * `setCoreCanvas()` additionally has to keep the cursor and any live
 * selection inside the bounds of whatever canvas it was just handed -
 * swapping to a smaller canvas (a sprite frame, for a later task) must not
 * leave the cursor or selection pointing at cells that no longer exist.
 *
 * These tests drive the real methods on a real Screen/ANSIEditor and read
 * results back through the real layer-compose path (`composeLayers()`),
 * not just by asserting the reassigned reference looks right - see the
 * "drawing after a shrink" and "newDocument" tests, which fail if the fix
 * merely reassigns `this.cellCanvas` without also updating
 * `layers[activeLayerIndex].canvas`.
 */

import { Screen } from '../../engines/ui/blessed/core/screen';
import { ANSIEditor } from '../../engines/ui/blessed/widgets/ansi-editor';
import * as CoreCanvas from '../../engines/ui/ansi-editor/core/canvas';

function makeScreen(): any {
  return new Screen({
    title: 'ansi-editor-size-safety',
    responsive: true,
    width: 100,
    height: 40,
  } as any);
}

/** Depth-first search for the first descendant whose rendered content contains `substr`. */
function findTextContaining(root: any, substr: string): any {
  if (typeof root?.getContent === 'function') {
    const content = root.getContent();
    if (typeof content === 'string' && content.includes(substr)) {
      return root;
    }
  }
  for (const child of root?.children || []) {
    const found = findTextContaining(child, substr);
    if (found) return found;
  }
  return null;
}

describe('setCoreCanvas is size-safe', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen } as any); // default 80x25
  });

  afterEach(() => screen?.destroy());

  it('keeps the active layer canvas reference in sync with the new cellCanvas (the stale-layer bug)', () => {
    const newCanvas = CoreCanvas.createCanvas(5, 2);
    editor.setCoreCanvas(newCanvas);

    expect(editor.layers[editor.activeLayerIndex].canvas).toBe(newCanvas);
    expect(editor.getCoreCanvas()).toBe(newCanvas);
  });

  it('clamps the cursor inside a smaller canvas when it sits beyond the new bounds', () => {
    editor.cursor.col = 50;
    editor.cursor.line = 20;

    const smallCanvas = CoreCanvas.createCanvas(5, 2);
    editor.setCoreCanvas(smallCanvas);

    expect(editor.cursor.col).toBe(4);
    expect(editor.cursor.line).toBe(1);
  });

  it('clamps a live selection that would fall outside the new bounds, preserving x1<=x2 and y1<=y2', () => {
    editor.selection = { x1: 2, y1: 2, x2: 50, y2: 20 };

    const smallCanvas = CoreCanvas.createCanvas(5, 2);
    editor.setCoreCanvas(smallCanvas);

    expect(editor.selection.x1).toBeLessThanOrEqual(editor.selection.x2);
    expect(editor.selection.y1).toBeLessThanOrEqual(editor.selection.y2);
    expect(editor.selection.x2).toBeLessThanOrEqual(4);
    expect(editor.selection.y2).toBeLessThanOrEqual(1);
  });

  it('drawing after a shrink writes to the new canvas, not the old one - visible through the layer-composed read path', () => {
    const oldCanvas = editor.getCoreCanvas();
    const smallCanvas = CoreCanvas.createCanvas(3, 3);
    editor.setCoreCanvas(smallCanvas);

    editor.cursor.col = 1;
    editor.cursor.line = 1;
    editor.currentChar = 'X';
    editor.drawAtCursor();

    // Landed in the new canvas...
    expect(smallCanvas[1][1].char).toBe('X');
    // ...and is visible through composeLayers(), proving
    // layers[activeLayerIndex].canvas IS the array being drawn into, not a
    // stale duplicate that drawing bypasses.
    const composed = editor.composeLayers();
    expect(composed[1][1].char).toBe('X');
    // ...and never touched the old (pre-swap) canvas.
    expect(oldCanvas[1]?.[1]?.char).not.toBe('X');
  });
});

describe('newDocument keeps its layer canvas in sync', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen } as any);
  });

  afterEach(() => screen?.destroy());

  it('after newDocument, composeLayers emits the CLEARED content, not stale pre-clear content', () => {
    editor.cursor.col = 0;
    editor.cursor.line = 0;
    editor.currentChar = 'X';
    editor.drawAtCursor();
    expect(editor.getCoreCanvas()[0][0].char).toBe('X');

    editor.newDocument();

    // This is the assertion that proves the bug is gone: composeLayers()
    // reads layer.canvas directly, so if newDocument() left that reference
    // stale (pointing at the pre-clear canvas with 'X' still in it), this
    // would still read 'X' even though this.cellCanvas itself was reset.
    const composed = editor.composeLayers();
    expect(composed[0][0].char).not.toBe('X');
    expect(composed[0][0].char).toBe(' ');
  });
});

describe('SAUCE size stays in sync (single source of truth)', () => {
  let screen: any;
  let editor: any;

  beforeEach(() => {
    screen = makeScreen();
    editor = new ANSIEditor({ parent: screen } as any); // default 80x25
  });

  afterEach(() => screen?.destroy());

  it('shows the construction-time size for an editor that was never resized (no regression)', () => {
    editor.showSauceEditor();

    const sizeText = findTextContaining(screen, 'Size:');
    expect(sizeText).not.toBeNull();
    expect(sizeText.getContent()).toContain('80x25');
  });

  it('a resize via setCoreCanvas is reflected in the SAUCE dialog Size field, not the construction-time size', () => {
    const smallCanvas = CoreCanvas.createCanvas(5, 2);
    editor.setCoreCanvas(smallCanvas);

    editor.showSauceEditor();

    const sizeText = findTextContaining(screen, 'Size:');
    expect(sizeText).not.toBeNull();
    expect(sizeText.getContent()).toContain('5x2');
    expect(sizeText.getContent()).not.toContain('80x25');
  });
});
