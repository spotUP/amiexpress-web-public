/**
 * drawing-tools.ts undo history must be per editor instance, not shared
 * across every editor in the process.
 *
 * Task 3 of the "ansi-editor sprite-capable" plan
 * (.superpowers/sdd/2026-09-01-ansi-editor-sprite-capable/). The shared
 * library already implements undo correctly in SHAPE - saveUndoState() is
 * called by every tool handler (chunked for freehand draws, single-push for
 * shapes/fill), undoDrawing()/clearUndoStack() pop/reset it - but the stack
 * itself was a MODULE-LEVEL `let undoStack` (drawing-tools.ts, pre-fix).
 * Two EditorState instances constructed in the same process shared one
 * history: drawing on editor A and then calling undoDrawing() could revert
 * editor B's canvas instead, and clearUndoStack() wiped every open editor's
 * history at once. This is a prerequisite for Task 4, which makes the
 * blessed widget call these functions for the first time (see
 * thoughts/shared/research/2026-09-01_ansi-editor-internals.md section 4 -
 * today the widget's Ctrl+Z/U is wired but inert in draw mode because it
 * only touches the unrelated text-mode undo stack, and these core-library
 * functions are dead imports, called from nowhere in the widget).
 *
 * These tests drive the real exported tool handlers (drawTool, lineTool,
 * boxTool) and the real exported undoDrawing()/clearUndoStack() against real
 * EditorState instances - no source-regex assertions standing in for
 * behavior.
 */

import { EditorState } from '../../engines/ui/ansi-editor/core/editor-state';
import {
  drawTool,
  lineTool,
  boxTool,
  undoDrawing,
  clearUndoStack,
} from '../../engines/ui/ansi-editor/tools/drawing-tools';
import type { Cell } from '../../engines/ui/ansi-editor/types';

function freshDrawState(): EditorState {
  const state = new EditorState();
  state.initializeCanvas(80, 25);
  return state;
}

function cellAt(state: EditorState, x: number, y: number): Cell | null {
  return state.getCanvasCell(x, y);
}

describe('drawing-tools undo isolation (per editor instance)', () => {
  it('undoing editor A does not revert editor B, and B is otherwise untouched', () => {
    const stateA = freshDrawState();
    const stateB = freshDrawState();

    // Give each editor a pre-existing marker cell, OUTSIDE any undo-tracked
    // op, so a snapshot swap between A and B is observable even though both
    // canvases are otherwise blank-identical. If undoDrawing(stateA) ever
    // pops a snapshot belonging to B (a shared/module-global stack), A would
    // come back with B's marker instead of its own - a symmetric blank
    // canvas alone wouldn't reveal that.
    stateA.getCanvas()![10][10] = { char: 'A', fg: 7, bg: 0, blink: false };
    stateB.getCanvas()![10][10] = { char: 'Z', fg: 7, bg: 0, blink: false };

    // Draw a distinguishing mark on A (this is what gets undone).
    lineTool.onStart(stateA, 0, 0);
    lineTool.onEnd(stateA, 0, 0);
    expect(cellAt(stateA, 0, 0)?.char).toBe(stateA.getCurrentCell().char);

    // Draw a distinguishing mark on B, at the same coordinates.
    stateB.setCurrentChar('B');
    lineTool.onStart(stateB, 0, 0);
    lineTool.onEnd(stateB, 0, 0);
    expect(cellAt(stateB, 0, 0)?.char).toBe('B');

    // Undo A: only A's mark should revert, restoring A's OWN pre-draw
    // snapshot (marker 'A' intact), never B's.
    const undone = undoDrawing(stateA);
    expect(undone).toBe(true);
    expect(cellAt(stateA, 0, 0)?.char).toBe(' '); // back to blank canvas
    expect(cellAt(stateA, 10, 10)?.char).toBe('A'); // A's own marker, not B's

    // B must be completely unaffected by A's undo.
    expect(cellAt(stateB, 0, 0)?.char).toBe('B');
    expect(cellAt(stateB, 10, 10)?.char).toBe('Z');
  });

  it('clearUndoStack on editor A leaves editor B history intact', () => {
    const stateA = freshDrawState();
    const stateB = freshDrawState();

    lineTool.onStart(stateA, 1, 1);
    lineTool.onEnd(stateA, 1, 1);

    lineTool.onStart(stateB, 2, 2);
    lineTool.onEnd(stateB, 2, 2);

    clearUndoStack(stateA);

    // A has nothing left to undo.
    expect(undoDrawing(stateA)).toBe(false);

    // B's history survives A's clear.
    expect(undoDrawing(stateB)).toBe(true);
    expect(cellAt(stateB, 2, 2)?.char).toBe(' ');
  });

  it('a fresh, never-cleared editor has independent history from one that was cleared', () => {
    const stateA = freshDrawState();
    const stateB = freshDrawState();

    lineTool.onStart(stateA, 3, 3);
    lineTool.onEnd(stateA, 3, 3);
    lineTool.onStart(stateB, 4, 4);
    lineTool.onEnd(stateB, 4, 4);

    clearUndoStack(stateB);

    // A is unaffected by B's clear.
    expect(undoDrawing(stateA)).toBe(true);
    expect(cellAt(stateA, 3, 3)?.char).toBe(' ');

    expect(undoDrawing(stateB)).toBe(false);
  });
});

describe('drawing-tools undo pinned behavior (must survive the per-instance refactor)', () => {
  it('a freehand stroke chunks into ONE undo entry - one undo reverts the whole stroke, not just the last point', () => {
    const state = freshDrawState();

    drawTool.onStart(state, 0, 0);
    drawTool.onMove(state, 1, 0);
    drawTool.onMove(state, 2, 0);
    drawTool.onMove(state, 3, 0);
    drawTool.onEnd(state, 3, 0);

    // The whole stroke landed.
    expect(cellAt(state, 0, 0)?.char).toBe(state.getCurrentCell().char);
    expect(cellAt(state, 1, 0)?.char).toBe(state.getCurrentCell().char);
    expect(cellAt(state, 2, 0)?.char).toBe(state.getCurrentCell().char);
    expect(cellAt(state, 3, 0)?.char).toBe(state.getCurrentCell().char);

    const undone = undoDrawing(state);
    expect(undone).toBe(true);

    // A single undo reverts every point of the stroke at once.
    expect(cellAt(state, 0, 0)?.char).toBe(' ');
    expect(cellAt(state, 1, 0)?.char).toBe(' ');
    expect(cellAt(state, 2, 0)?.char).toBe(' ');
    expect(cellAt(state, 3, 0)?.char).toBe(' ');

    // And there is nothing further to undo from that single stroke.
    expect(undoDrawing(state)).toBe(false);
  });

  it('a shape (box) commits as ONE undo entry', () => {
    const state = freshDrawState();

    boxTool.onStart(state, 5, 5);
    boxTool.onEnd(state, 8, 8);

    expect(cellAt(state, 5, 5)?.char).toBe(state.getCurrentCell().char);

    expect(undoDrawing(state)).toBe(true);
    expect(cellAt(state, 5, 5)?.char).toBe(' ');
    // Only one entry was pushed for the whole shape.
    expect(undoDrawing(state)).toBe(false);
  });

  /**
   * Final-fix-wave IMPORTANT 1, at the library level (drawing-tools.ts).
   * onMove used to write its preview directly into the real canvas, and
   * onEnd then drew the final shape on top of that already-mutated canvas
   * instead of the pre-drag snapshot it holds - so a non-colinear drag (the
   * last onMove cell differs from the commit direction) left BOTH the
   * stale preview AND the committed shape painted. Mirrors the same
   * mechanism the widget-level probe in ansi-editor-draw-undo.test.ts
   * verifies through real mouse/keyboard events; this drives boxTool
   * directly to confirm the fix at its source, not just through the
   * widget's dispatch.
   */
  it('a non-colinear box drag commits ONCE - the last onMove preview does not survive alongside the committed shape', () => {
    const state = freshDrawState();
    state.setCurrentChar('B');

    boxTool.onStart(state, 2, 2);
    boxTool.onMove(state, 5, 2); // preview: a degenerate 1-row-tall box outline across row 2, cols 2-5
    boxTool.onEnd(state, 2, 6); // commit: a taller box (2,2)-(2,6) - degenerates to a solid column since width is 1

    // The committed shape (a solid vertical line at col 2, rows 2-6, since
    // a 1-wide box's left/right edges coincide) landed in full.
    expect(cellAt(state, 2, 2)?.char).toBe('B');
    expect(cellAt(state, 2, 6)?.char).toBe('B');

    // The stale preview row from onMove must not survive the commit.
    expect(cellAt(state, 3, 2)?.char).toBe(' ');
    expect(cellAt(state, 4, 2)?.char).toBe(' ');
    expect(cellAt(state, 5, 2)?.char).toBe(' ');

    // Still exactly one undo entry for the whole gesture.
    expect(undoDrawing(state)).toBe(true);
    expect(cellAt(state, 2, 2)?.char).toBe(' ');
    expect(undoDrawing(state)).toBe(false);
  });

  it('undo past the beginning is a safe no-op', () => {
    const state = freshDrawState();

    expect(undoDrawing(state)).toBe(false);
    // Canvas remains the pristine, freshly-initialized canvas.
    expect(cellAt(state, 0, 0)).toEqual({ char: ' ', fg: 7, bg: 0, blink: false });
  });

  it('the undo stack cap (50 entries) still holds after the refactor', () => {
    const state = freshDrawState();

    // Push 55 single-entry undo states (one per line-tool operation), each
    // touching a distinct cell so every push is a real, observable change.
    for (let i = 0; i < 55; i++) {
      lineTool.onStart(state, i, 0);
      lineTool.onEnd(state, i, 0);
    }

    let successfulUndos = 0;
    while (undoDrawing(state)) {
      successfulUndos++;
      if (successfulUndos > 100) break; // guard against an unbounded stack
    }

    expect(successfulUndos).toBe(50);
  });

  it('undo snapshots preserve the transparent field on cloned cells', () => {
    const state = freshDrawState();
    const canvas = state.getCanvas()!;

    // Mark a cell transparent directly on the live canvas before the draw
    // operation snapshots it.
    canvas[0][0] = { char: ' ', fg: 7, bg: 0, transparent: true };

    lineTool.onStart(state, 0, 0);
    lineTool.onEnd(state, 0, 0); // overwrites (0,0) with an opaque drawn cell

    expect(cellAt(state, 0, 0)?.transparent).toBeFalsy();

    expect(undoDrawing(state)).toBe(true);

    // The undo snapshot must have carried the transparent marker through
    // Canvas.cloneCanvas() unchanged.
    expect(cellAt(state, 0, 0)?.transparent).toBe(true);
  });
});
