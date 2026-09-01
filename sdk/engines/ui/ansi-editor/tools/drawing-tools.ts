/**
 * Drawing tool implementations
 * Provides handlers for all 10 drawing tools
 */

import type { EditorState } from '../core/editor-state';
import type { Position, Cell, DrawingTool } from '../types';
import * as Canvas from '../core/canvas';

/**
 * Tool handler interface
 */
export interface ToolHandler {
  onStart(state: EditorState, x: number, y: number): void;
  onMove(state: EditorState, x: number, y: number): void;
  onEnd(state: EditorState, x: number, y: number): void;
  onCancel(state: EditorState): void;
}

/**
 * Undo state management for drawing operations
 *
 * Per-instance, not module-global: each EditorState gets its own undo
 * history via a WeakMap keyed on the state instance. Two editors open in
 * the same process (e.g. multiple sprite-editor frames) must not undo or
 * clear each other's history - see
 * thoughts/shared/research/2026-09-01_ansi-editor-internals.md section 4.
 */
interface UndoState {
  canvas: Cell[][];
  timestamp: number;
}

interface UndoData {
  undoStack: UndoState[];
  redoStack: UndoState[];
  currentUndoChunk: Cell[][] | null;
}

const undoDataByState = new WeakMap<EditorState, UndoData>();

/**
 * Get (creating if absent) the undo data for one editor instance.
 */
function getUndoData(state: EditorState): UndoData {
  let data = undoDataByState.get(state);
  if (!data) {
    data = { undoStack: [], redoStack: [], currentUndoChunk: null };
    undoDataByState.set(state, data);
  }
  return data;
}

/**
 * Peek the canvas at the top of an editor's undo stack (used by shape-tool
 * previews to repaint from the pre-drag snapshot without popping it).
 */
function peekUndoCanvas(state: EditorState): Cell[][] | undefined {
  const stack = getUndoData(state).undoStack;
  return stack[stack.length - 1]?.canvas;
}

/**
 * Save current canvas state to undo stack. Starting a new edit - the first
 * call of a chunk, or any non-chunked call - invalidates the redo stack,
 * matching standard undo/redo semantics (and the widget's own pre-existing
 * text-mode saveUndoState(), which does the same).
 */
function saveUndoState(state: EditorState, chunked: boolean = false): void {
  const canvas = state.getCanvas();
  if (!canvas) return;

  const data = getUndoData(state);

  if (chunked) {
    // For chunked operations (draw tool), save once at start
    if (!data.currentUndoChunk) {
      data.currentUndoChunk = Canvas.cloneCanvas(canvas);
      data.redoStack = [];
    }
  } else {
    // For single operations, save immediately
    data.undoStack.push({
      canvas: Canvas.cloneCanvas(canvas),
      timestamp: Date.now()
    });

    // Limit undo stack to 50 states
    if (data.undoStack.length > 50) {
      data.undoStack.shift();
    }

    data.redoStack = [];
  }
}

/**
 * Pop the top of the undo stack and apply it, discarding the entry (used by
 * a shape tool's onCancel to abandon an in-progress drag: restore the
 * pre-drag canvas AND remove the undo entry onStart pushed for it, so a
 * cancelled shape doesn't leave a stale no-op entry on the stack). Distinct
 * from peekUndoCanvas(), which onMove uses to redraw the live preview
 * without popping - the drag isn't over yet.
 */
function restoreAndDiscardUndo(state: EditorState): void {
  const data = getUndoData(state);
  const snapshot = data.undoStack.pop();
  if (snapshot) {
    state.setCanvas(Canvas.cloneCanvas(snapshot.canvas));
  }
}

/**
 * Flush chunked undo state
 */
function flushUndoChunk(state: EditorState): void {
  const data = getUndoData(state);
  if (data.currentUndoChunk) {
    data.undoStack.push({
      canvas: data.currentUndoChunk,
      timestamp: Date.now()
    });

    if (data.undoStack.length > 50) {
      data.undoStack.shift();
    }

    data.currentUndoChunk = null;
  }
}

/**
 * Restore previous canvas state (undo). Pushes the canvas being replaced
 * onto the redo stack first, so redoDrawing() can reapply it.
 */
export function undoDrawing(state: EditorState): boolean {
  const data = getUndoData(state);
  const undoState = data.undoStack.pop();
  if (!undoState) return false;

  const currentCanvas = state.getCanvas();
  if (currentCanvas) {
    data.redoStack.push({ canvas: Canvas.cloneCanvas(currentCanvas), timestamp: Date.now() });
    if (data.redoStack.length > 50) {
      data.redoStack.shift();
    }
  }

  state.setCanvas(undoState.canvas);
  return true;
}

/**
 * Reapply the most recently undone canvas state (redo). Pushes the canvas
 * being replaced back onto the undo stack, symmetric with undoDrawing().
 */
export function redoDrawing(state: EditorState): boolean {
  const data = getUndoData(state);
  const redoState = data.redoStack.pop();
  if (!redoState) return false;

  const currentCanvas = state.getCanvas();
  if (currentCanvas) {
    data.undoStack.push({ canvas: Canvas.cloneCanvas(currentCanvas), timestamp: Date.now() });
    if (data.undoStack.length > 50) {
      data.undoStack.shift();
    }
  }

  state.setCanvas(redoState.canvas);
  return true;
}

/**
 * Clear undo stack for one editor instance. Takes the instance explicitly
 * (unavoidable signature change from the old zero-arg module-global form -
 * see task-3-report.md) so clearing one editor's history can never affect
 * another's.
 */
export function clearUndoStack(state: EditorState): void {
  const data = getUndoData(state);
  data.undoStack = [];
  data.redoStack = [];
  data.currentUndoChunk = null;
}

/**
 * Paint an explicit cell into the canvas, recording undo the same way
 * drawTool does (chunked groups repeated calls from one continuous
 * drag/typed-run into a single undo entry, flushed via drawTool.onEnd/
 * flushUndoChunk; non-chunked pushes one entry per call). The one thing none
 * of the ten ToolHandlers can express is "paint a cell I computed myself" -
 * half-block compositing, the RMB fg/bg-swap convention, arbitrary typed
 * characters, and erase (which may write a `transparent` cell) all need this
 * instead of drawTool's fixed state.getCurrentCell(). See
 * thoughts/shared/research/2026-09-01_ansi-editor-internals.md section 5.
 */
export function paintCell(state: EditorState, x: number, y: number, cell: Cell, chunked: boolean): void {
  saveUndoState(state, chunked);
  state.setCanvasCell(x, y, cell);
}

// ===== TOOL: FREEHAND DRAW =====

export const drawTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state, true); // Chunked undo for performance
    const cell = state.getCurrentCell();
    state.setCanvasCell(x, y, cell);
  },

  onMove(state: EditorState, x: number, y: number) {
    const cell = state.getCurrentCell();
    state.setCanvasCell(x, y, cell);
  },

  onEnd(state: EditorState, x: number, y: number) {
    flushUndoChunk(state);
  },

  onCancel(state: EditorState) {
    flushUndoChunk(state);
  }
};

// ===== TOOL: LINE =====

export const lineTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state);
    state.setDrawingStartPoint({ line: y, col: x });
    state.setDrawingEndPoint({ line: y, col: x });

    // Create preview canvas
    const canvas = state.getCanvas();
    if (canvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(canvas));
    }
  },

  onMove(state: EditorState, x: number, y: number) {
    state.setDrawingEndPoint({ line: y, col: x });

    // Update preview
    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();
    const preview = state.getDrawingPreview();

    if (!startPoint || !canvas || !preview) return;

    // Restore original canvas to preview
    const originalCanvas = peekUndoCanvas(state);
    if (originalCanvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(originalCanvas));
    }

    // Draw line on preview
    const cell = state.getCurrentCell();
    Canvas.drawLine(preview, startPoint.col, startPoint.line, x, y, cell);

    // Update main canvas with preview
    state.setCanvas(Canvas.cloneCanvas(preview));
  },

  onEnd(state: EditorState, x: number, y: number) {
    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();

    if (!startPoint || !canvas) return;

    // Draw final line
    const cell = state.getCurrentCell();
    Canvas.drawLine(canvas, startPoint.col, startPoint.line, x, y, cell);

    // Clear preview
    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  },

  onCancel(state: EditorState) {
    restoreAndDiscardUndo(state);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  }
};

// ===== TOOL: BOX (OUTLINE) =====

export const boxTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state);
    state.setDrawingStartPoint({ line: y, col: x });
    state.setDrawingEndPoint({ line: y, col: x });

    const canvas = state.getCanvas();
    if (canvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(canvas));
    }
  },

  onMove(state: EditorState, x: number, y: number) {
    state.setDrawingEndPoint({ line: y, col: x });

    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();
    const preview = state.getDrawingPreview();

    if (!startPoint || !canvas || !preview) return;

    // Restore original canvas to preview
    const originalCanvas = peekUndoCanvas(state);
    if (originalCanvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(originalCanvas));
    }

    // Draw box outline on preview
    const cell = state.getCurrentCell();
    Canvas.drawBox(preview, startPoint.col, startPoint.line, x, y, cell);

    state.setCanvas(Canvas.cloneCanvas(preview));
  },

  onEnd(state: EditorState, x: number, y: number) {
    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();

    if (!startPoint || !canvas) return;

    const cell = state.getCurrentCell();
    Canvas.drawBox(canvas, startPoint.col, startPoint.line, x, y, cell);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  },

  onCancel(state: EditorState) {
    restoreAndDiscardUndo(state);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  }
};

// ===== TOOL: BOX FILLED =====

export const boxFillTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state);
    state.setDrawingStartPoint({ line: y, col: x });
    state.setDrawingEndPoint({ line: y, col: x });

    const canvas = state.getCanvas();
    if (canvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(canvas));
    }
  },

  onMove(state: EditorState, x: number, y: number) {
    state.setDrawingEndPoint({ line: y, col: x });

    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();
    const preview = state.getDrawingPreview();

    if (!startPoint || !canvas || !preview) return;

    const originalCanvas = peekUndoCanvas(state);
    if (originalCanvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(originalCanvas));
    }

    const cell = state.getCurrentCell();
    Canvas.drawBoxFilled(preview, startPoint.col, startPoint.line, x, y, cell);

    state.setCanvas(Canvas.cloneCanvas(preview));
  },

  onEnd(state: EditorState, x: number, y: number) {
    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();

    if (!startPoint || !canvas) return;

    const cell = state.getCurrentCell();
    Canvas.drawBoxFilled(canvas, startPoint.col, startPoint.line, x, y, cell);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  },

  onCancel(state: EditorState) {
    restoreAndDiscardUndo(state);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  }
};

// ===== TOOL: ELLIPSE (OUTLINE) =====

export const ellipseTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state);
    state.setDrawingStartPoint({ line: y, col: x });
    state.setDrawingEndPoint({ line: y, col: x });

    const canvas = state.getCanvas();
    if (canvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(canvas));
    }
  },

  onMove(state: EditorState, x: number, y: number) {
    state.setDrawingEndPoint({ line: y, col: x });

    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();
    const preview = state.getDrawingPreview();

    if (!startPoint || !canvas || !preview) return;

    const originalCanvas = peekUndoCanvas(state);
    if (originalCanvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(originalCanvas));
    }

    // Calculate ellipse center and radii
    const cx = Math.floor((startPoint.col + x) / 2);
    const cy = Math.floor((startPoint.line + y) / 2);
    const rx = Math.abs(x - startPoint.col) / 2;
    const ry = Math.abs(y - startPoint.line) / 2;

    const cell = state.getCurrentCell();
    Canvas.drawEllipse(preview, cx, cy, Math.floor(rx), Math.floor(ry), cell);

    state.setCanvas(Canvas.cloneCanvas(preview));
  },

  onEnd(state: EditorState, x: number, y: number) {
    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();

    if (!startPoint || !canvas) return;

    const cx = Math.floor((startPoint.col + x) / 2);
    const cy = Math.floor((startPoint.line + y) / 2);
    const rx = Math.abs(x - startPoint.col) / 2;
    const ry = Math.abs(y - startPoint.line) / 2;

    const cell = state.getCurrentCell();
    Canvas.drawEllipse(canvas, cx, cy, Math.floor(rx), Math.floor(ry), cell);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  },

  onCancel(state: EditorState) {
    restoreAndDiscardUndo(state);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  }
};

// ===== TOOL: ELLIPSE FILLED =====

export const ellipseFillTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state);
    state.setDrawingStartPoint({ line: y, col: x });
    state.setDrawingEndPoint({ line: y, col: x });

    const canvas = state.getCanvas();
    if (canvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(canvas));
    }
  },

  onMove(state: EditorState, x: number, y: number) {
    state.setDrawingEndPoint({ line: y, col: x });

    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();
    const preview = state.getDrawingPreview();

    if (!startPoint || !canvas || !preview) return;

    const originalCanvas = peekUndoCanvas(state);
    if (originalCanvas) {
      state.setDrawingPreview(Canvas.cloneCanvas(originalCanvas));
    }

    const cx = Math.floor((startPoint.col + x) / 2);
    const cy = Math.floor((startPoint.line + y) / 2);
    const rx = Math.abs(x - startPoint.col) / 2;
    const ry = Math.abs(y - startPoint.line) / 2;

    const cell = state.getCurrentCell();
    Canvas.drawEllipseFilled(preview, cx, cy, Math.floor(rx), Math.floor(ry), cell);

    state.setCanvas(Canvas.cloneCanvas(preview));
  },

  onEnd(state: EditorState, x: number, y: number) {
    const startPoint = state.getDrawingStartPoint();
    const canvas = state.getCanvas();

    if (!startPoint || !canvas) return;

    const cx = Math.floor((startPoint.col + x) / 2);
    const cy = Math.floor((startPoint.line + y) / 2);
    const rx = Math.abs(x - startPoint.col) / 2;
    const ry = Math.abs(y - startPoint.line) / 2;

    const cell = state.getCurrentCell();
    Canvas.drawEllipseFilled(canvas, cx, cy, Math.floor(rx), Math.floor(ry), cell);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  },

  onCancel(state: EditorState) {
    restoreAndDiscardUndo(state);

    state.setDrawingPreview(null);
    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  }
};

// ===== TOOL: FLOOD FILL =====

export const fillTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state);

    const canvas = state.getCanvas();
    if (!canvas) return;

    const cell = state.getCurrentCell();
    Canvas.floodFill(canvas, x, y, cell);
  },

  onMove(state: EditorState, x: number, y: number) {
    // Flood fill doesn't use move
  },

  onEnd(state: EditorState, x: number, y: number) {
    // Nothing to do
  },

  onCancel(state: EditorState) {
    restoreAndDiscardUndo(state);
  }
};

// ===== TOOL: EYEDROPPER/PICK =====

export const pickTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    const cell = state.getCanvasCell(x, y);
    if (!cell) return;

    // Pick colors and background always; skip the character when the picked
    // cell is blank so an eyedropper click on empty space doesn't blank out
    // the current character. Does NOT switch tool afterward - unlike a
    // momentary-eyedropper convention, this widget's other tools (fill,
    // etc.) never auto-revert to 'draw' either, so pick shouldn't be the
    // one exception. See task-4-report.md.
    state.setCurrentFg(cell.fg);
    state.setCurrentBg(cell.bg);
    if (cell.char !== ' ') {
      state.setCurrentChar(cell.char);
    }
  },

  onMove(state: EditorState, x: number, y: number) {
    // Pick tool doesn't use move
  },

  onEnd(state: EditorState, x: number, y: number) {
    // Nothing to do
  },

  onCancel(state: EditorState) {
    // Pick never mutates the canvas or pushes undo state - nothing to undo.
  }
};

// ===== TOOL: BLOCK SELECTION =====

/**
 * Per-instance, not module-global: same rationale as UndoData above - two
 * EditorState instances in the same process (e.g. multiple sprite-editor
 * frames) must not see or clobber each other's in-progress selection.
 */
interface SelectionData {
  startPoint: Position | null;
  endPoint: Position | null;
  bounds: { x1: number; y1: number; x2: number; y2: number } | null;
  selectedRegion: Cell[][] | null;
}

const selectionDataByState = new WeakMap<EditorState, SelectionData>();

function getSelectionData(state: EditorState): SelectionData {
  let data = selectionDataByState.get(state);
  if (!data) {
    data = { startPoint: null, endPoint: null, bounds: null, selectedRegion: null };
    selectionDataByState.set(state, data);
  }
  return data;
}

export const selectTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    const data = getSelectionData(state);
    data.startPoint = { line: y, col: x };
    data.endPoint = { line: y, col: x };
    data.bounds = null;
  },

  onMove(state: EditorState, x: number, y: number) {
    const data = getSelectionData(state);
    data.endPoint = { line: y, col: x };

    // Update selection visual (TODO: implement selection rendering)
    state.setDrawingStartPoint(data.startPoint);
    state.setDrawingEndPoint(data.endPoint);
  },

  onEnd(state: EditorState, x: number, y: number) {
    const data = getSelectionData(state);
    if (!data.startPoint) return;

    const canvas = state.getCanvas();
    if (!canvas) return;

    // Extract selected region
    const x1 = Math.min(data.startPoint.col, x);
    const y1 = Math.min(data.startPoint.line, y);
    const x2 = Math.max(data.startPoint.col, x);
    const y2 = Math.max(data.startPoint.line, y);

    data.bounds = { x1, y1, x2, y2 };

    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;

    data.selectedRegion = Canvas.extractRegion(canvas, x1, y1, width, height);
  },

  onCancel(state: EditorState) {
    const data = getSelectionData(state);
    data.startPoint = null;
    data.endPoint = null;
    data.bounds = null;
    data.selectedRegion = null;

    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  }
};

/**
 * The rectangle a select-tool drag committed on its last onEnd, or null if
 * nothing has been selected yet (or the selection was cleared/cancelled).
 * Callers that need "what did the user select" (e.g. the blessed widget's
 * copy/cut/paste/flip operations, which work on an {x1,y1,x2,y2} rectangle,
 * not the extracted Cell[][] region selectTool also keeps) read this instead
 * of re-deriving it from getDrawingStartPoint()/getDrawingEndPoint().
 */
export function getSelectionBounds(state: EditorState): { x1: number; y1: number; x2: number; y2: number } | null {
  return getSelectionData(state).bounds;
}

/**
 * Get current selection for one editor instance.
 */
export function getSelection(state: EditorState): SelectionData {
  return getSelectionData(state);
}

/**
 * Clear selection for one editor instance.
 */
export function clearSelection(state: EditorState): void {
  const data = getSelectionData(state);
  data.startPoint = null;
  data.endPoint = null;
  data.bounds = null;
  data.selectedRegion = null;
}

/**
 * Copy the selected region for one editor instance.
 */
export function copySelection(state: EditorState): Cell[][] | null {
  const region = getSelectionData(state).selectedRegion;
  return region ? Canvas.cloneCanvas(region) : null;
}

/**
 * Paste selection at position
 */
export function pasteSelection(state: EditorState, x: number, y: number, region: Cell[][]): void {
  saveUndoState(state);

  const canvas = state.getCanvas();
  if (!canvas) return;

  Canvas.pasteCanvas(canvas, region, x, y);
  state.setModified(true);
}

// ===== TOOL REGISTRY =====

/**
 * Get tool handler by name
 */
export function getToolHandler(tool: DrawingTool): ToolHandler {
  switch (tool) {
    case 'draw':
      return drawTool;
    case 'line':
      return lineTool;
    case 'box':
      return boxTool;
    case 'box-fill':
      return boxFillTool;
    case 'ellipse':
      return ellipseTool;
    case 'ellipse-fill':
      return ellipseFillTool;
    case 'fill':
      return fillTool;
    case 'pick':
      return pickTool;
    case 'select':
      return selectTool;
    case 'text':
      // Text tool is handled differently (switches to text mode)
      return drawTool; // Fallback
    default:
      return drawTool;
  }
}

/**
 * Handle mouse/keyboard drawing event
 */
export function handleDrawEvent(
  state: EditorState,
  event: 'start' | 'move' | 'end' | 'cancel',
  x: number,
  y: number
): void {
  const tool = state.getCurrentTool();
  const handler = getToolHandler(tool);

  switch (event) {
    case 'start':
      handler.onStart(state, x, y);
      break;
    case 'move':
      handler.onMove(state, x, y);
      break;
    case 'end':
      handler.onEnd(state, x, y);
      break;
    case 'cancel':
      handler.onCancel(state);
      break;
  }
}
