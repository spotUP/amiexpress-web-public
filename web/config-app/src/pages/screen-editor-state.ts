/**
 * A screen being drawn on, as React can hold it.
 *
 * Everything that changes a cell here delegates to the SDK: `handleDrawEvent`
 * runs the ten tools, `paintCell` writes a typed character, `undoDrawing` and
 * `redoDrawing` walk the history. The door's editor and the admin's draw the
 * same line because there is one implementation of the line.
 *
 * Two things ARE this module's own problem, both of them React's:
 *
 * - The SDK draws into a `Cell[][]` in place, and a mutated array is a prop
 *   React will not re-render. Every function here returns a new surface whose
 *   canvas is a fresh clone, leaving the state's own canvas to the SDK.
 * - The undo history is a WeakMap keyed on ONE `EditorState` instance
 *   (`drawing-tools.ts:40`). A surface that made a new state per change would
 *   have an empty history at every step and undo would do nothing at all - so
 *   the instance is carried through every replacement.
 */

import type { Cell, DrawingTool } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { EditorState } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/editor-state';
import { cloneCanvas } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';
import {
  handleDrawEvent, paintCell, undoDrawing, redoDrawing,
} from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/tools/drawing-tools';

export interface EditorSurface {
  canvas: Cell[][];
  tool: DrawingTool;
  fg: number;
  bg: number;
  char: string;
  /**
   * The SDK's editor, and the key its undo history is kept under. Carried, not
   * rebuilt - see the note at the top of this file.
   */
  state: EditorState;
  /** The cell a stroke started on, while the pointer is still down. */
  pending: { x: number; y: number } | null;
}

export function createSurface(canvas: Cell[][]): EditorSurface {
  const state = new EditorState();
  // The SDK draws in place, so the state gets a copy: the array the caller
  // handed over stays exactly as it was, and so does every surface already
  // rendered from it.
  state.setCanvas(cloneCanvas(canvas));

  return {
    canvas,
    tool: 'draw',
    fg: state.getCurrentFg(),
    bg: state.getCurrentBg(),
    char: state.getCurrentChar(),
    state,
    pending: null,
  };
}

/**
 * Push what the UI chose into the SDK's state, so a tool reads the colours and
 * character the sysop picked rather than the ones it was created with.
 */
function apply(surface: EditorSurface): EditorState {
  const { state } = surface;
  state.setCurrentTool(surface.tool);
  state.setCurrentFg(surface.fg);
  state.setCurrentBg(surface.bg);
  state.setCurrentChar(surface.char);
  return state;
}

/**
 * The surface after the SDK has drawn. Colours are read BACK out of the state
 * because a tool may have changed them - the pick tool exists to do exactly
 * that.
 */
function settle(surface: EditorSurface, pending: EditorSurface['pending']): EditorSurface {
  const { state } = surface;
  const canvas = state.getCanvas();

  return {
    ...surface,
    canvas: canvas ? cloneCanvas(canvas) : surface.canvas,
    tool: state.getCurrentTool(),
    fg: state.getCurrentFg(),
    bg: state.getCurrentBg(),
    char: state.getCurrentChar(),
    pending,
  };
}

export function pointerToCanvas(
  surface: EditorSurface,
  x: number,
  y: number,
  phase: 'down' | 'move' | 'up',
): EditorSurface {
  const state = apply(surface);

  handleDrawEvent(state, phase === 'down' ? 'start' : phase === 'move' ? 'move' : 'end', x, y);

  return settle(surface, phase === 'up' ? null : { x, y });
}

export function typeCharacter(
  surface: EditorSurface,
  x: number,
  y: number,
  char: string,
): EditorSurface {
  const state = apply(surface);

  // Not chunked: one character is one undo step, the way typing behaves
  // everywhere else. A drag is the chunked case and the draw tool owns it.
  paintCell(state, x, y, { char, fg: surface.fg, bg: surface.bg }, false);

  return settle(surface, surface.pending);
}

/**
 * A stroke still in progress is finished first. The draw tool holds its undo
 * entry open until the pointer comes up (`drawing-tools.ts:69` - chunked, so a
 * whole drag is one undo), and undoing across an open chunk would pop the step
 * BEFORE the stroke and leave the stroke itself on the canvas.
 */
function finishStroke(surface: EditorSurface): void {
  if (!surface.pending) return;
  handleDrawEvent(apply(surface), 'end', surface.pending.x, surface.pending.y);
}

export function undo(surface: EditorSurface): EditorSurface {
  finishStroke(surface);
  undoDrawing(surface.state);
  return settle(surface, null);
}

export function redo(surface: EditorSurface): EditorSurface {
  finishStroke(surface);
  redoDrawing(surface.state);
  return settle(surface, null);
}
