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
import { cloneCanvas, clearCanvas } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';
import type { SAUCERecord } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/file-ops';
import {
  handleDrawEvent, paintCell, snapshotUndoState, undoDrawing, redoDrawing,
  copySelection, pasteSelection, getSelectionBounds, clearSelection,
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
  /** The opened file's SAUCE record: the artist's name and flags, kept on save. */
  sauce?: SAUCERecord;
  /** The character set the file was read in (SDK isAmigaText), written back on save. */
  amiga?: boolean;
}

export function createSurface(canvas: Cell[][], sauce?: SAUCERecord, amiga?: boolean): EditorSurface {
  const state = new EditorState();
  // The SDK draws in place, so the state gets a copy: the array the caller
  // handed over stays exactly as it was, and so does every surface already
  // rendered from it.
  state.setCanvas(cloneCanvas(canvas));

  return {
    canvas,
    /*
     * TYPE, not draw. Opening in a painting tool means the first thing an
     * artist types lands as brush strokes - and these screens are mostly
     * TEXT with art around it, so typing is what the editor is opened to do
     * (sysop, 2026-09-15: "the default mode should be type not draw").
     */
    tool: 'text',
    fg: state.getCurrentFg(),
    bg: state.getCurrentBg(),
    char: state.getCurrentChar(),
    state,
    pending: null,
    sauce,
    amiga,
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
 * Type a character with INSERT on: the rest of the row moves right.
 *
 * Overwriting is what this editor has always done, and it is wrong for the
 * commonest job an artist has - dropping a missing letter into a finished
 * line without redrawing the rest of it. What falls off the right-hand edge
 * is gone, which is what every ANSI editor does: the row is 80 columns and
 * there is nowhere else for it to go.
 */
export function insertCharacter(
  surface: EditorSurface,
  x: number,
  y: number,
  char: string,
): EditorSurface {
  const state = apply(surface);
  const canvas = state.getCanvas();
  if (!canvas || !canvas[y]) return surface;

  const width = canvas[y].length;
  if (x < 0 || x >= width) return surface;

  // One undo step for the whole shift, not one per cell.
  snapshotUndoState(state);
  for (let column = width - 1; column > x; column--) {
    const left = canvas[y][column - 1];
    state.setCanvasCell(column, y, { ...left });
  }
  state.setCanvasCell(x, y, { char, fg: surface.fg, bg: surface.bg });

  return settle(surface, surface.pending);
}

/** A cell with nothing on it: no glyph and the screen's own background. */
function isBlank(cell: Cell | undefined): boolean {
  if (!cell) return true;
  const empty = !cell.char || cell.char === ' ' || cell.char === '\u0000';
  // A space on a coloured background is INK - it is how half the art on this
  // board is drawn - so only a space over the screen's own black is blank.
  return empty && (cell.bg ?? 0) === 0;
}

/**
 * Centre what is on a row between the edges of the screen.
 *
 * The ink is everything from the first non-blank cell to the last, moved as
 * one block - so a line of text centres, and so does a rule or a run of
 * blocks. A row with nothing on it is left exactly as it was, and so is one
 * already centred: the shift is computed, and a shift of zero writes nothing.
 */
export function centreLine(surface: EditorSurface, y: number): EditorSurface {
  const state = apply(surface);
  const canvas = state.getCanvas();
  if (!canvas || !canvas[y]) return surface;

  const row = canvas[y];
  const width = row.length;

  let first = 0;
  while (first < width && isBlank(row[first])) first++;
  if (first === width) return surface;            // an empty row centres to itself

  let last = width - 1;
  while (last > first && isBlank(row[last])) last--;

  const ink = row.slice(first, last + 1).map(cell => ({ ...cell }));
  const target = Math.floor((width - ink.length) / 2);
  if (target === first) return surface;           // already where it belongs

  snapshotUndoState(state);
  const blank = { char: ' ', fg: 7, bg: 0 };
  for (let column = 0; column < width; column++) {
    const source = column - target;
    const cell = source >= 0 && source < ink.length ? ink[source] : blank;
    state.setCanvasCell(column, y, { ...cell });
  }

  return settle(surface, surface.pending);
}

/**
 * Push a blank line in at `y`, and drop whatever fell off the bottom.
 *
 * A screen is a FIXED grid - 80x25 is what the board sends and what the
 * caller's terminal shows - so inserting a line cannot make the canvas taller.
 * The last row goes, which is the same bargain every text editor with a fixed
 * page makes, and it is the row furthest from where the artist is working.
 *
 * Undo covers it: the snapshot is taken before the shift, so one Ctrl+Z puts
 * the lost row back.
 */
/** A screen is never taller than the board sends. */
const MAX_SCREEN_ROWS = 25;

export function insertLine(surface: EditorSurface, y: number): EditorSurface {
  const state = apply(surface);
  const canvas = state.getCanvas();
  if (!canvas || y < 0 || y >= canvas.length) return surface;

  const width = canvas[0]?.length ?? 0;
  const rows = canvas.map(row => row.map(cell => ({ ...cell })));

  snapshotUndoState(state);
  rows.splice(y, 0, Array.from({ length: width }, () => ({ char: ' ', fg: 7, bg: 0 })));
  // Never taller than the board sends. Past the cap the bottom row falls off,
  // which is what this always did.
  if (rows.length > MAX_SCREEN_ROWS) rows.length = MAX_SCREEN_ROWS;
  state.setCanvas(rows);

  return settle(surface, surface.pending);
}

/**
 * Take the line at `y` out FOR REAL - the screen gets shorter.
 *
 * It used to pull the rest up and slide a blank row in at the bottom, keeping
 * the grid at 25. That looks identical on screen and is wrong in the file: the
 * editor saves `canvas.length` rows, so a six-row logo was written out as
 * twenty-four rows, six of art and eighteen of spaces. The sysop shortened the
 * SAmiLog logo to six lines and the bulletin did not get one line shorter -
 * "ctrl+k in the editor should remove lines for real though" (2026-09-14).
 *
 * The earlier rule here - the grid does not change height - was written
 * against GROWING, because a screen taller than 25 is one the board cannot
 * send. Shrinking has no such problem: a six-line screen sends fine, and the
 * height of a screen is the artist's to decide. So the cap stays on
 * `insertLine` and comes off this.
 *
 * One row is the floor; a screen with no rows is not a screen. Undo still
 * covers the removal - the snapshot is taken before the splice.
 */
export function removeLine(surface: EditorSurface, y: number): EditorSurface {
  const state = apply(surface);
  const canvas = state.getCanvas();
  if (!canvas || y < 0 || y >= canvas.length) return surface;
  if (canvas.length <= 1) return surface;

  const rows = canvas.map(row => row.map(cell => ({ ...cell })));

  snapshotUndoState(state);
  rows.splice(y, 1);
  state.setCanvas(rows);

  return settle(surface, surface.pending);
}

/**
 * Blank every cell, keeping the screen's size: the artist set how tall it is,
 * and clearing is about the art, not the shape. One undo step puts it back.
 */
export function clearScreen(surface: EditorSurface): EditorSurface {
  finishStroke(surface);
  const state = apply(surface);
  const canvas = state.getCanvas();
  if (!canvas) return surface;

  const rows = cloneCanvas(canvas);
  snapshotUndoState(state);
  clearCanvas(rows);
  state.setCanvas(rows);

  return settle(surface, null);
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
/**
 * Switch tools, and drop the selection when we leave `select`.
 *
 * The marquee is the SELECT TOOL'S cursor. Leaving it on while another tool
 * is active shows an artist a rectangle they can no longer move or resize -
 * "the select marker is not removed when i am not in select mode" (sysop,
 * 2026-09-15) - and worse, it stays LIVE: copy and cut read the committed
 * rect, so an invisible-in-spirit selection would still be what Alt+C took.
 *
 * Clearing rather than hiding, for that reason. A hidden selection that
 * still answers the clipboard is the kind of state nobody can reason about
 * from the screen.
 */
export function withTool(surface: EditorSurface, tool: DrawingTool): EditorSurface {
  if (surface.tool === 'select' && tool !== 'select') {
    clearSelection(surface.state);
  }
  return { ...surface, tool };
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
