/**
 * Drawing tools for ANSI Editor
 * Implements all drawing tools with proper preview and commit
 */

import { Cell, Point, EditorState, Tool, DRAW_CHARS } from './types.js';
import {
  saveUndoState,
  flushUndoChunk,
  setCell,
  getCell,
  drawLine,
  drawBox,
  drawEllipse,
  floodFill,
  cloneCanvas,
} from './canvas.js';

// =============================================================================
// TOOL INITIALIZATION
// =============================================================================

export interface ToolHandler {
  onStart: (state: EditorState, x: number, y: number) => void;
  onMove: (state: EditorState, x: number, y: number) => void;
  onEnd: (state: EditorState, x: number, y: number) => void;
  onCancel: (state: EditorState) => void;
}

// =============================================================================
// CURRENT CELL BUILDER
// =============================================================================

function getCurrentCell(state: EditorState): Cell {
  return {
    char: state.currentChar,
    fg: state.currentFg,
    bg: state.currentBg,
    blink: state.blinkEnabled,
  };
}

// =============================================================================
// DRAW TOOL (Freehand)
// =============================================================================

export const drawTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state, true);  // Chunked undo for drawing
    const cell = getCurrentCell(state);
    setCell(state, x, y, cell);
  },

  onMove(state: EditorState, x: number, y: number) {
    const cell = getCurrentCell(state);
    setCell(state, x, y, cell);
  },

  onEnd(state: EditorState, x: number, y: number) {
    flushUndoChunk(state);
  },

  onCancel(state: EditorState) {
    flushUndoChunk(state);
  },
};

// =============================================================================
// LINE TOOL
// =============================================================================

export const lineTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    state.drawingStartPoint = { x, y };
    state.drawingEndPoint = { x, y };
    state.drawingPreview = cloneCanvas(state.canvas);
  },

  onMove(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    // Restore canvas from preview
    state.canvas = cloneCanvas(state.drawingPreview);

    // Draw preview line
    state.drawingEndPoint = { x, y };
    const cell = getCurrentCell(state);
    drawLine(
      state,
      state.drawingStartPoint.x,
      state.drawingStartPoint.y,
      x,
      y,
      cell
    );
  },

  onEnd(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    saveUndoState(state);

    // Restore from preview and draw final line
    state.canvas = cloneCanvas(state.drawingPreview);
    const cell = getCurrentCell(state);
    drawLine(
      state,
      state.drawingStartPoint.x,
      state.drawingStartPoint.y,
      x,
      y,
      cell
    );

    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },

  onCancel(state: EditorState) {
    if (state.drawingPreview) {
      state.canvas = state.drawingPreview;
    }
    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },
};

// =============================================================================
// BOX TOOL
// =============================================================================

export const boxTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    state.drawingStartPoint = { x, y };
    state.drawingEndPoint = { x, y };
    state.drawingPreview = cloneCanvas(state.canvas);
  },

  onMove(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    // Restore canvas from preview
    state.canvas = cloneCanvas(state.drawingPreview);

    // Draw preview box
    state.drawingEndPoint = { x, y };
    const cell = getCurrentCell(state);
    drawBox(
      state,
      state.drawingStartPoint.x,
      state.drawingStartPoint.y,
      x,
      y,
      cell,
      false
    );
  },

  onEnd(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    saveUndoState(state);

    // Restore from preview and draw final box
    state.canvas = cloneCanvas(state.drawingPreview);
    const cell = getCurrentCell(state);
    drawBox(
      state,
      state.drawingStartPoint.x,
      state.drawingStartPoint.y,
      x,
      y,
      cell,
      false
    );

    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },

  onCancel(state: EditorState) {
    if (state.drawingPreview) {
      state.canvas = state.drawingPreview;
    }
    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },
};

// =============================================================================
// BOX FILL TOOL
// =============================================================================

export const boxFillTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    state.drawingStartPoint = { x, y };
    state.drawingEndPoint = { x, y };
    state.drawingPreview = cloneCanvas(state.canvas);
  },

  onMove(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    // Restore canvas from preview
    state.canvas = cloneCanvas(state.drawingPreview);

    // Draw preview filled box
    state.drawingEndPoint = { x, y };
    const cell = getCurrentCell(state);
    drawBox(
      state,
      state.drawingStartPoint.x,
      state.drawingStartPoint.y,
      x,
      y,
      cell,
      true
    );
  },

  onEnd(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    saveUndoState(state);

    // Restore from preview and draw final filled box
    state.canvas = cloneCanvas(state.drawingPreview);
    const cell = getCurrentCell(state);
    drawBox(
      state,
      state.drawingStartPoint.x,
      state.drawingStartPoint.y,
      x,
      y,
      cell,
      true
    );

    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },

  onCancel(state: EditorState) {
    if (state.drawingPreview) {
      state.canvas = state.drawingPreview;
    }
    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },
};

// =============================================================================
// ELLIPSE TOOL
// =============================================================================

export const ellipseTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    state.drawingStartPoint = { x, y };
    state.drawingEndPoint = { x, y };
    state.drawingPreview = cloneCanvas(state.canvas);
  },

  onMove(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    // Restore canvas from preview
    state.canvas = cloneCanvas(state.drawingPreview);

    // Calculate ellipse parameters
    const cx = Math.floor((state.drawingStartPoint.x + x) / 2);
    const cy = Math.floor((state.drawingStartPoint.y + y) / 2);
    const rx = Math.abs(x - state.drawingStartPoint.x) / 2;
    const ry = Math.abs(y - state.drawingStartPoint.y) / 2;

    // Draw preview ellipse
    state.drawingEndPoint = { x, y };
    const cell = getCurrentCell(state);
    drawEllipse(state, cx, cy, Math.floor(rx), Math.floor(ry), cell, false);
  },

  onEnd(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    saveUndoState(state);

    // Restore from preview and draw final ellipse
    state.canvas = cloneCanvas(state.drawingPreview);

    const cx = Math.floor((state.drawingStartPoint.x + x) / 2);
    const cy = Math.floor((state.drawingStartPoint.y + y) / 2);
    const rx = Math.abs(x - state.drawingStartPoint.x) / 2;
    const ry = Math.abs(y - state.drawingStartPoint.y) / 2;

    const cell = getCurrentCell(state);
    drawEllipse(state, cx, cy, Math.floor(rx), Math.floor(ry), cell, false);

    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },

  onCancel(state: EditorState) {
    if (state.drawingPreview) {
      state.canvas = state.drawingPreview;
    }
    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },
};

// =============================================================================
// ELLIPSE FILL TOOL
// =============================================================================

export const ellipseFillTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    state.drawingStartPoint = { x, y };
    state.drawingEndPoint = { x, y };
    state.drawingPreview = cloneCanvas(state.canvas);
  },

  onMove(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    // Restore canvas from preview
    state.canvas = cloneCanvas(state.drawingPreview);

    // Calculate ellipse parameters
    const cx = Math.floor((state.drawingStartPoint.x + x) / 2);
    const cy = Math.floor((state.drawingStartPoint.y + y) / 2);
    const rx = Math.abs(x - state.drawingStartPoint.x) / 2;
    const ry = Math.abs(y - state.drawingStartPoint.y) / 2;

    // Draw preview filled ellipse
    state.drawingEndPoint = { x, y };
    const cell = getCurrentCell(state);
    drawEllipse(state, cx, cy, Math.floor(rx), Math.floor(ry), cell, true);
  },

  onEnd(state: EditorState, x: number, y: number) {
    if (!state.drawingStartPoint || !state.drawingPreview) return;

    saveUndoState(state);

    // Restore from preview and draw final filled ellipse
    state.canvas = cloneCanvas(state.drawingPreview);

    const cx = Math.floor((state.drawingStartPoint.x + x) / 2);
    const cy = Math.floor((state.drawingStartPoint.y + y) / 2);
    const rx = Math.abs(x - state.drawingStartPoint.x) / 2;
    const ry = Math.abs(y - state.drawingStartPoint.y) / 2;

    const cell = getCurrentCell(state);
    drawEllipse(state, cx, cy, Math.floor(rx), Math.floor(ry), cell, true);

    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },

  onCancel(state: EditorState) {
    if (state.drawingPreview) {
      state.canvas = state.drawingPreview;
    }
    state.drawingStartPoint = null;
    state.drawingEndPoint = null;
    state.drawingPreview = null;
  },
};

// =============================================================================
// FILL TOOL
// =============================================================================

export const fillTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    const cell = getCurrentCell(state);
    floodFill(state, x, y, cell);
  },

  onMove(state: EditorState, x: number, y: number) {
    // No preview for fill tool
  },

  onEnd(state: EditorState, x: number, y: number) {
    // Already done in onStart
  },

  onCancel(state: EditorState) {
    // Nothing to cancel
  },
};

// =============================================================================
// PICK TOOL (Color Picker)
// =============================================================================

export const pickTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    const cell = getCell(state, x, y);
    if (cell) {
      state.currentChar = cell.char;
      state.currentFg = cell.fg;
      state.currentBg = cell.bg;
    }
  },

  onMove(state: EditorState, x: number, y: number) {
    // Show preview of picked colors
    const cell = getCell(state, x, y);
    if (cell) {
      // Could show a temporary preview
    }
  },

  onEnd(state: EditorState, x: number, y: number) {
    const cell = getCell(state, x, y);
    if (cell) {
      state.currentChar = cell.char;
      state.currentFg = cell.fg;
      state.currentBg = cell.bg;
    }
  },

  onCancel(state: EditorState) {
    // Nothing to cancel
  },
};

// =============================================================================
// TEXT TOOL
// =============================================================================

let textBuffer = '';

export const textTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    textBuffer = '';
    saveUndoState(state);
  },

  onMove(state: EditorState, x: number, y: number) {
    // Text mode doesn't use move
  },

  onEnd(state: EditorState, x: number, y: number) {
    // Text is inserted character by character via separate function
  },

  onCancel(state: EditorState) {
    textBuffer = '';
  },
};

export function insertTextChar(state: EditorState, char: string): void {
  if (char === '\r' || char === '\n') {
    // Move to next line
    state.cursorY++;
    state.cursorX = 0;
    return;
  }

  if (char === '\b' || char === '\x7f') {
    // Backspace
    if (state.cursorX > 0) {
      state.cursorX--;
      setCell(state, state.cursorX, state.cursorY, { char: ' ', fg: 7, bg: 0 });
    }
    return;
  }

  // Insert character
  const cell: Cell = {
    char,
    fg: state.currentFg,
    bg: state.currentBg,
    blink: state.blinkEnabled,
  };

  setCell(state, state.cursorX, state.cursorY, cell);
  state.cursorX++;

  if (state.cursorX >= state.width) {
    state.cursorX = 0;
    state.cursorY++;
  }

  if (state.cursorY >= state.height) {
    state.cursorY = state.height - 1;
  }
}

// =============================================================================
// SHIFTER TOOL (Half-block shifter)
// =============================================================================

export const shifterTool: ToolHandler = {
  onStart(state: EditorState, x: number, y: number) {
    saveUndoState(state);
  },

  onMove(state: EditorState, x: number, y: number) {
    // Shifter is keyboard-driven, not mouse
  },

  onEnd(state: EditorState, x: number, y: number) {
    // Complete shift operation
  },

  onCancel(state: EditorState) {
    // Cancel shift
  },
};

export function shiftHalfBlock(state: EditorState, direction: 'left' | 'right'): void {
  const cell = getCell(state, state.cursorX, state.cursorY);
  if (!cell) return;

  saveUndoState(state);

  // Get current character
  let char = cell.char;

  // Shift logic for half-block characters
  if (direction === 'left') {
    if (char === DRAW_CHARS.RIGHT_HALF) char = DRAW_CHARS.FULL_BLOCK;
    else if (char === DRAW_CHARS.FULL_BLOCK) char = DRAW_CHARS.LEFT_HALF;
    else if (char === ' ') char = DRAW_CHARS.RIGHT_HALF;
  } else if (direction === 'right') {
    if (char === DRAW_CHARS.LEFT_HALF) char = DRAW_CHARS.FULL_BLOCK;
    else if (char === DRAW_CHARS.FULL_BLOCK) char = DRAW_CHARS.RIGHT_HALF;
    else if (char === ' ') char = DRAW_CHARS.LEFT_HALF;
  }

  setCell(state, state.cursorX, state.cursorY, {
    ...cell,
    char,
  });
}

// =============================================================================
// TOOL DISPATCHER
// =============================================================================

export function getToolHandler(tool: Tool): ToolHandler {
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
    case 'text':
      return textTool;
    case 'shifter':
      return shifterTool;
    default:
      return drawTool;
  }
}

// =============================================================================
// ADVANCED DRAWING FEATURES (from old editor)
// =============================================================================

/**
 * Draw with brush - supports brush size 1-9 and different brush modes
 */
export function drawWithBrush(
  state: EditorState,
  centerX: number,
  centerY: number,
  useBg: boolean = false
): void {
  const halfSize = Math.floor(state.brushSize / 2);

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;

      // Skip out of bounds
      if (x < 0 || x >= state.width || y < 0 || y >= state.height) continue;

      // Apply brush mode
      applyBrushMode(state, x, y, useBg);
    }
  }

  state.modified = true;
}

/**
 * Apply brush mode to a single cell
 */
export function applyBrushMode(
  state: EditorState,
  x: number,
  y: number,
  useBg: boolean
): void {
  const cell = state.canvas[y][x];

  switch (state.brushMode) {
    case 'half-block':
      // Half-block mode: draw with current character
      state.canvas[y][x] = {
        char: state.currentChar,
        fg: useBg ? state.currentBg : state.currentFg,
        bg: useBg ? state.currentFg : state.currentBg,
        blink: state.blinkEnabled
      };
      break;

    case 'shading':
      // Progressive shading: light → dark
      const shadingChars = [
        ' ',
        String.fromCharCode(176), // Light shade
        String.fromCharCode(177), // Medium shade
        String.fromCharCode(178), // Dark shade
        String.fromCharCode(219)  // Full block
      ];
      let currentIndex = shadingChars.indexOf(cell.char);
      if (currentIndex === -1) currentIndex = 0;

      if (useBg) {
        // Right-click: decrease shading
        currentIndex = Math.max(0, currentIndex - 1);
      } else {
        // Left-click: increase shading
        currentIndex = Math.min(shadingChars.length - 1, currentIndex + 1);
      }

      state.canvas[y][x] = {
        char: shadingChars[currentIndex],
        fg: state.currentFg,
        bg: state.currentBg,
        blink: state.blinkEnabled
      };
      break;

    case 'colorize':
      // Colorize mode: change colors only, preserve character
      if (useBg) {
        // Right-click: change background only
        state.canvas[y][x].bg = state.currentBg;
      } else {
        // Left-click: change foreground and background
        state.canvas[y][x].fg = state.currentFg;
        state.canvas[y][x].bg = state.currentBg;
      }
      break;

    case 'custom':
      // Custom character mode: same as half-block but explicitly named
      state.canvas[y][x] = {
        char: state.currentChar,
        fg: useBg ? state.currentBg : state.currentFg,
        bg: useBg ? state.currentFg : state.currentBg,
        blink: state.blinkEnabled
      };
      break;

    case 'replace':
      // Replace background with foreground color
      state.canvas[y][x].bg = state.currentFg;
      break;
  }
}

/**
 * Toggle mirror mode (horizontal symmetry drawing)
 */
export function toggleMirrorMode(state: EditorState): void {
  state.mirrorModeEnabled = !state.mirrorModeEnabled;
}

/**
 * Toggle numpad drawing mode
 */
export function toggleNumpadMode(state: EditorState): void {
  state.numpadModeEnabled = !state.numpadModeEnabled;
}

/**
 * Handle numpad drawing (keyboard-based directional drawing)
 * Maps keyboard keys to numpad directions:
 *   7 8 9  (up-left, up, up-right)
 *   u i o  (left, stay, right)
 *   j k l  (down-left, down, down-right)
 * Returns true if key was handled
 */
export function handleNumpadDraw(state: EditorState, key: string): boolean {
  // Map keys to direction deltas
  const dirMap: { [key: string]: { dx: number; dy: number } } = {
    // Top row: 7 8 9
    '7': { dx: -1, dy: -1 },  // up-left
    '8': { dx:  0, dy: -1 },  // up
    '9': { dx:  1, dy: -1 },  // up-right
    // Middle row: u i o
    'u': { dx: -1, dy:  0 },  // left
    'i': { dx:  0, dy:  0 },  // center (draw without moving)
    'o': { dx:  1, dy:  0 },  // right
    // Bottom row: j k l
    'j': { dx: -1, dy:  1 },  // down-left
    'k': { dx:  0, dy:  1 },  // down
    'l': { dx:  1, dy:  1 },  // down-right
  };

  const dir = dirMap[key.toLowerCase()];
  if (!dir) return false;

  // Draw at current position
  saveUndoState(state, true);  // Chunked undo for continuous drawing
  const cell = getCurrentCell(state);
  setCell(state, state.cursorX, state.cursorY, cell);

  // Move cursor in the specified direction
  state.cursorX = Math.max(0, Math.min(state.width - 1, state.cursorX + dir.dx));
  state.cursorY = Math.max(0, Math.min(state.height - 1, state.cursorY + dir.dy));

  return true;
}

/**
 * Enhanced shiftCell - shift half-blocks left/right or clear
 */
export function shiftCellWithClear(
  state: EditorState,
  direction: 'left' | 'right',
  clear: boolean = false
): void {
  const x = state.cursorX;
  const y = state.cursorY;

  if (x < 0 || x >= state.width || y < 0 || y >= state.height) return;

  const cell = state.canvas[y][x];
  const charCode = cell.char.charCodeAt(0);

  saveUndoState(state);

  if (clear) {
    // Shift+Arrow: Clear to space
    state.canvas[y][x] = { char: ' ', fg: cell.fg, bg: cell.bg };
  } else {
    // Arrow only: Shift blocks
    // CP437 chars: 221 (left half), 222 (right half), 219 (full block), 32 (space)
    if (direction === 'left') {
      // Left arrow: 222→221, 219→221, space→221
      if (charCode === 222 || charCode === 219 || charCode === 32) {
        state.canvas[y][x] = {
          char: String.fromCharCode(221),
          fg: state.currentFg,
          bg: state.currentBg
        };
      }
    } else if (direction === 'right') {
      // Right arrow: 221→222, 219→222, space→222
      if (charCode === 221 || charCode === 219 || charCode === 32) {
        state.canvas[y][x] = {
          char: String.fromCharCode(222),
          fg: state.currentFg,
          bg: state.currentBg
        };
      }
    }
  }
}
