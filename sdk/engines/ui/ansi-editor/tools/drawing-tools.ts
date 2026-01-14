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
 */
interface UndoState {
  canvas: Cell[][];
  timestamp: number;
}

let undoStack: UndoState[] = [];
let currentUndoChunk: Cell[][] | null = null;

/**
 * Save current canvas state to undo stack
 */
function saveUndoState(state: EditorState, chunked: boolean = false): void {
  const canvas = state.getCanvas();
  if (!canvas) return;

  if (chunked) {
    // For chunked operations (draw tool), save once at start
    if (!currentUndoChunk) {
      currentUndoChunk = Canvas.cloneCanvas(canvas);
    }
  } else {
    // For single operations, save immediately
    undoStack.push({
      canvas: Canvas.cloneCanvas(canvas),
      timestamp: Date.now()
    });

    // Limit undo stack to 50 states
    if (undoStack.length > 50) {
      undoStack.shift();
    }
  }
}

/**
 * Flush chunked undo state
 */
function flushUndoChunk(state: EditorState): void {
  if (currentUndoChunk) {
    undoStack.push({
      canvas: currentUndoChunk,
      timestamp: Date.now()
    });

    if (undoStack.length > 50) {
      undoStack.shift();
    }

    currentUndoChunk = null;
  }
}

/**
 * Restore previous canvas state (undo)
 */
export function undoDrawing(state: EditorState): boolean {
  const undoState = undoStack.pop();
  if (!undoState) return false;

  state.setCanvas(undoState.canvas);
  return true;
}

/**
 * Clear undo stack
 */
export function clearUndoStack(): void {
  undoStack = [];
  currentUndoChunk = null;
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
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
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
    // Restore original canvas
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
    if (originalCanvas) {
      state.setCanvas(Canvas.cloneCanvas(originalCanvas));
    }

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
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
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
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
    if (originalCanvas) {
      state.setCanvas(Canvas.cloneCanvas(originalCanvas));
    }

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

    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
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
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
    if (originalCanvas) {
      state.setCanvas(Canvas.cloneCanvas(originalCanvas));
    }

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

    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
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
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
    if (originalCanvas) {
      state.setCanvas(Canvas.cloneCanvas(originalCanvas));
    }

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

    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
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
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
    if (originalCanvas) {
      state.setCanvas(Canvas.cloneCanvas(originalCanvas));
    }

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
    // Restore original canvas
    const originalCanvas = undoStack[undoStack.length - 1]?.canvas;
    if (originalCanvas) {
      state.setCanvas(Canvas.cloneCanvas(originalCanvas));
      undoStack.pop(); // Remove the undo state we just restored
    }
  }
};

// ===== TOOL: EYEDROPPER/PICK =====

export const pickTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    const cell = state.getCanvasCell(x, y);
    if (!cell) return;

    // Pick colors and character from cell
    state.setCurrentFg(cell.fg);
    state.setCurrentBg(cell.bg);
    state.setCurrentChar(cell.char);

    // Switch back to previous tool (draw tool by default)
    state.setCurrentTool('draw');
  },

  onMove(state: EditorState, x: number, y: number) {
    // Pick tool doesn't use move
  },

  onEnd(state: EditorState, x: number, y: number) {
    // Nothing to do
  },

  onCancel(state: EditorState) {
    // Switch back to draw tool
    state.setCurrentTool('draw');
  }
};

// ===== TOOL: BLOCK SELECTION =====

interface SelectionState {
  startPoint: Position | null;
  endPoint: Position | null;
  selectedRegion: Cell[][] | null;
}

let selectionState: SelectionState = {
  startPoint: null,
  endPoint: null,
  selectedRegion: null
};

export const selectTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    selectionState.startPoint = { line: y, col: x };
    selectionState.endPoint = { line: y, col: x };
  },

  onMove(state: EditorState, x: number, y: number) {
    selectionState.endPoint = { line: y, col: x };

    // Update selection visual (TODO: implement selection rendering)
    state.setDrawingStartPoint(selectionState.startPoint);
    state.setDrawingEndPoint(selectionState.endPoint);
  },

  onEnd(state: EditorState, x: number, y: number) {
    if (!selectionState.startPoint) return;

    const canvas = state.getCanvas();
    if (!canvas) return;

    // Extract selected region
    const x1 = Math.min(selectionState.startPoint.col, x);
    const y1 = Math.min(selectionState.startPoint.line, y);
    const x2 = Math.max(selectionState.startPoint.col, x);
    const y2 = Math.max(selectionState.startPoint.line, y);

    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;

    selectionState.selectedRegion = Canvas.extractRegion(canvas, x1, y1, width, height);
  },

  onCancel(state: EditorState) {
    selectionState.startPoint = null;
    selectionState.endPoint = null;
    selectionState.selectedRegion = null;

    state.setDrawingStartPoint(null);
    state.setDrawingEndPoint(null);
  }
};

/**
 * Get current selection
 */
export function getSelection(): SelectionState {
  return selectionState;
}

/**
 * Clear selection
 */
export function clearSelection(): void {
  selectionState = {
    startPoint: null,
    endPoint: null,
    selectedRegion: null
  };
}

/**
 * Copy selected region
 */
export function copySelection(): Cell[][] | null {
  return selectionState.selectedRegion ? Canvas.cloneCanvas(selectionState.selectedRegion) : null;
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
