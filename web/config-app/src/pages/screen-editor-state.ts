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
  handleDrawEvent, paintCell, snapshotUndoState, undoDrawing, redoDrawing,
  copySelection, pasteSelection, getSelectionBounds,
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

/**
 * A run of characters written in one go - an MCI code the sysop inserted.
 *
 * One undo, not one per character, through the SDK's own path for a
 * host-computed mutation: snapshot, then write the cells
 * (`drawing-tools.ts:203` documents exactly this case).
 */
export function typeText(
  surface: EditorSurface,
  x: number,
  y: number,
  text: string,
): EditorSurface {
  const state = apply(surface);
  snapshotUndoState(state);

  [...text].forEach((char, index) => {
    state.setCanvasCell(x + index, y, { char, fg: surface.fg, bg: surface.bg });
  });

  return settle(surface, surface.pending);
}

/**
 * An empty 80x25 screen, for a slot the theme has not drawn yet.
 *
 * The board's own size: 80 columns is what every screen here is, and 25 rows
 * is what a caller's terminal shows without scrolling. An artist starting a
 * screen from the checklist gets this rather than a file dialog.
 */
export function blankCanvas(rows = 25, cols = 80): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ char: ' ', fg: 7, bg: 0 })));
}

export interface HighlightRun {
  x: number;
  y: number;
  length: number;
}

interface SelectionShape {
  startPoint: { line: number; col: number } | null;
  endPoint: { line: number; col: number } | null;
  bounds: { x1: number; y1: number; x2: number; y2: number } | null;
}

/**
 * The select-tool marquee as highlight runs, for AnsiCanvas. Live drag
 * points first, the committed bounds after mouse-up, nothing when no
 * selection exists. The tool tracked all of this internally and never
 * showed it (sysop, 2026-09-10: select appeared dead).
 */
export function selectionHighlightRuns(sel: SelectionShape | null): HighlightRun[] {
  if (!sel) return [];
  // Committed bounds first: on mouse-up they hold exactly what the live
  // points described, and the points go stale the moment the next drag
  // has not yet started. Live points only while no bounds exist.
  const rect = sel.bounds ?? (sel.startPoint && sel.endPoint
    ? {
        x1: Math.min(sel.startPoint.col, sel.endPoint.col),
        y1: Math.min(sel.startPoint.line, sel.endPoint.line),
        x2: Math.max(sel.startPoint.col, sel.endPoint.col),
        y2: Math.max(sel.startPoint.line, sel.endPoint.line),
      }
    : null);
  if (!rect) return [];
  return Array.from({ length: rect.y2 - rect.y1 + 1 }, (_, r) => ({
    x: rect.x1,
    y: rect.y1 + r,
    length: rect.x2 - rect.x1 + 1,
  }));
}

/**
 * The committed marquee as plain text rows, for the SYSTEM clipboard - so
 * art leaves the canvas into the sysop's own text editor. Trailing spaces
 * trimmed per line (an ANSI editor pads everything to full width) and
 * trailing blank lines dropped. Null when nothing is selected. Colours do
 * not survive: the system clipboard holds text, not cells.
 */
export function selectedRegionToText(surface: EditorSurface): string | null {
  const bounds = getSelectionBounds(surface.state);
  const canvas = surface.canvas;
  if (!bounds || !canvas) return null;
  const lines: string[] = [];
  for (let y = bounds.y1; y <= bounds.y2; y++) {
    const row = canvas[y] ?? [];
    let line = '';
    for (let x = bounds.x1; x <= bounds.x2; x++) line += row[x]?.char ?? ' ';
    lines.push(line.replace(/\s+$/, ''));
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Stamp plain TEXT at a cell - what came back from the system clipboard.
 * One undo step (snapshot, then write, like `typeText`). Newlines start a
 * new row; overhang past the canvas edge is dropped, never grows the
 * screen. Characters arrive in the current foreground/background: text
 * from outside has no colours of its own.
 */
export function pasteText(
  surface: EditorSurface,
  x: number,
  y: number,
  text: string,
): EditorSurface {
  const state = apply(surface);
  snapshotUndoState(state);
  const rows = surface.canvas.length;
  const cols = rows > 0 ? surface.canvas[0].length : 0;
  text.split('\n').forEach((line, dy) => {
    [...line].forEach((char, dx) => {
      const cx = x + dx, cy = y + dy;
      if (cx < cols && cy < rows) {
        state.setCanvasCell(cx, cy, { char, fg: surface.fg, bg: surface.bg });
      }
    });
  });
  return settle(surface, surface.pending);
}
export type ClipboardRegion = Cell[][];

/**
 * Lift the select tool's committed rect into the clipboard. Null when
 * nothing is selected - Alt+C with no marquee is a no-op, not an error.
 * A clone: scribbling on the clipboard never touches the canvas.
 */
export function copySelectedRegion(surface: EditorSurface): ClipboardRegion | null {
  return copySelection(surface.state);
}

/**
 * Stamp the clipboard at a cell. One undo step, through the SDK's own
 * paste (`drawing-tools.ts:760` snapshots before writing). Clipped at the
 * canvas edge by `pasteCanvas` - pasting past the border loses the
 * overhang, it does not grow the screen.
 */
export function pasteRegion(
  surface: EditorSurface,
  x: number,
  y: number,
  region: ClipboardRegion,
): EditorSurface {
  const state = apply(surface);
  pasteSelection(state, x, y, region);
  return settle(surface, surface.pending);
}

/**
 * Lift the committed rect AND blank its cells: Alt+X. One undo step for
 * both halves - snapshot first, then clear, so Ctrl+Z restores the art
 * with the region back where it was.
 */
export function cutSelectedRegion(surface: EditorSurface): {
  surface: EditorSurface;
  region: ClipboardRegion | null;
} {
  const region = copySelection(surface.state);
  const bounds = getSelectionBounds(surface.state);
  if (!region || !bounds) return { surface, region: null };

  const state = apply(surface);
  snapshotUndoState(state);
  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      state.setCanvasCell(x, y, { char: ' ', fg: 7, bg: 0 });
    }
  }
  return { surface: settle(surface, surface.pending), region };
}
