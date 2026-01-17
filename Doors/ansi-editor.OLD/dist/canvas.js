/**
 * Canvas operations for ANSI Editor
 * Handles undo/redo, selection, clipboard, transformations
 */
import { ANSI } from './types.js';
// =============================================================================
// CANVAS INITIALIZATION
// =============================================================================
export function createCanvas(width, height) {
    const canvas = [];
    for (let y = 0; y < height; y++) {
        canvas[y] = [];
        for (let x = 0; x < width; x++) {
            canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
    }
    return canvas;
}
export function cloneCanvas(canvas) {
    return canvas.map(row => row.map(cell => ({ ...cell })));
}
export function clearCanvas(state) {
    saveUndoState(state);
    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            state.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
    }
    state.modified = true;
}
// =============================================================================
// UNDO/REDO SYSTEM
// =============================================================================
export function saveUndoState(state, chunk = false) {
    const now = Date.now();
    // Chunked undo: Group rapid consecutive operations
    if (chunk) {
        // If within chunk timeout, skip saving (we'll save when chunk ends)
        if (now - state.lastUndoTime < state.undoChunkTimeout) {
            state.pendingUndoChunk = true;
            state.lastUndoTime = now;
            return;
        }
        // Chunk timeout expired - save if we had pending operations
        if (state.pendingUndoChunk) {
            state.pendingUndoChunk = false;
        }
    }
    // Save current canvas state to undo stack
    const snapshot = cloneCanvas(state.canvas);
    state.undoStack.push(snapshot);
    if (state.undoStack.length > state.maxUndoLevels) {
        state.undoStack.shift();
    }
    // Clear redo stack when new action is performed
    state.redoStack = [];
    state.modified = true;
    state.lastUndoTime = now;
}
export function flushUndoChunk(state) {
    if (state.pendingUndoChunk) {
        state.pendingUndoChunk = false;
        const snapshot = cloneCanvas(state.canvas);
        state.undoStack.push(snapshot);
        if (state.undoStack.length > state.maxUndoLevels) {
            state.undoStack.shift();
        }
        state.redoStack = [];
        state.modified = true;
    }
}
export function undo(state) {
    flushUndoChunk(state);
    if (state.undoStack.length === 0)
        return false;
    // Save current state to redo stack
    const current = cloneCanvas(state.canvas);
    state.redoStack.push(current);
    // Restore previous state
    const prev = state.undoStack.pop();
    state.canvas = prev;
    return true;
}
export function redo(state) {
    flushUndoChunk(state);
    if (state.redoStack.length === 0)
        return false;
    // Save current state to undo stack
    const current = cloneCanvas(state.canvas);
    state.undoStack.push(current);
    // Restore next state
    const next = state.redoStack.pop();
    state.canvas = next;
    return true;
}
// =============================================================================
// SELECTION SYSTEM
// =============================================================================
export function startSelection(state) {
    flushUndoChunk(state);
    state.selecting = true;
    state.selectionStart = { x: state.cursorX, y: state.cursorY };
    state.selectionEnd = { x: state.cursorX, y: state.cursorY };
}
export function updateSelection(state) {
    if (state.selecting) {
        state.selectionEnd = { x: state.cursorX, y: state.cursorY };
    }
}
export function clearSelection(state) {
    state.selecting = false;
    state.selectionStart = null;
    state.selectionEnd = null;
}
export function getSelectionBounds(state) {
    if (!state.selectionStart || !state.selectionEnd)
        return null;
    return {
        x1: Math.min(state.selectionStart.x, state.selectionEnd.x),
        y1: Math.min(state.selectionStart.y, state.selectionEnd.y),
        x2: Math.max(state.selectionStart.x, state.selectionEnd.x),
        y2: Math.max(state.selectionStart.y, state.selectionEnd.y)
    };
}
export function isInSelection(state, x, y) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return false;
    return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
}
export function selectAll(state) {
    state.selecting = true;
    state.selectionStart = { x: 0, y: 0 };
    state.selectionEnd = { x: state.width - 1, y: state.height - 1 };
}
// =============================================================================
// CLIPBOARD OPERATIONS
// =============================================================================
export function copySelection(state) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return false;
    state.clipboard = [];
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        const row = [];
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            row.push({ ...state.canvas[y][x] });
        }
        state.clipboard.push(row);
    }
    return true;
}
export function cutSelection(state) {
    if (!copySelection(state))
        return false;
    saveUndoState(state);
    eraseSelection(state);
    return true;
}
export function eraseSelection(state) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return;
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            state.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
    }
    clearSelection(state);
    state.modified = true;
}
export function pasteSelection(state) {
    if (state.clipboard.length === 0)
        return;
    saveUndoState(state);
    for (let y = 0; y < state.clipboard.length; y++) {
        for (let x = 0; x < state.clipboard[y].length; x++) {
            const targetY = state.cursorY + y;
            const targetX = state.cursorX + x;
            if (targetY < state.height && targetX < state.width) {
                state.canvas[targetY][targetX] = { ...state.clipboard[y][x] };
            }
        }
    }
    state.modified = true;
}
// =============================================================================
// TRANSFORMATION OPERATIONS
// =============================================================================
export function flipSelectionHorizontal(state) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return;
    saveUndoState(state);
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        const row = [];
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            row.push({ ...state.canvas[y][x] });
        }
        row.reverse();
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            state.canvas[y][x] = row[x - bounds.x1];
        }
    }
    state.modified = true;
}
export function flipSelectionVertical(state) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return;
    saveUndoState(state);
    const rows = [];
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        const row = [];
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            row.push({ ...state.canvas[y][x] });
        }
        rows.push(row);
    }
    rows.reverse();
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            state.canvas[y][x] = rows[y - bounds.y1][x - bounds.x1];
        }
    }
    state.modified = true;
}
export function rotateSelection90(state, clockwise = true) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return;
    const width = bounds.x2 - bounds.x1 + 1;
    const height = bounds.y2 - bounds.y1 + 1;
    // Can only rotate square selections easily
    if (width !== height)
        return;
    saveUndoState(state);
    const temp = [];
    for (let y = 0; y < height; y++) {
        temp[y] = [];
        for (let x = 0; x < width; x++) {
            temp[y][x] = { ...state.canvas[bounds.y1 + y][bounds.x1 + x] };
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (clockwise) {
                state.canvas[bounds.y1 + y][bounds.x1 + x] = temp[height - 1 - x][y];
            }
            else {
                state.canvas[bounds.y1 + y][bounds.x1 + x] = temp[x][width - 1 - y];
            }
        }
    }
    state.modified = true;
}
export function shiftSelection(state, dx, dy) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return;
    saveUndoState(state);
    // Copy selection content
    const content = [];
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        const row = [];
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            row.push({ ...state.canvas[y][x] });
        }
        content.push(row);
    }
    // Clear original area
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            state.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
    }
    // Paste at new location
    const newY1 = bounds.y1 + dy;
    const newX1 = bounds.x1 + dx;
    for (let y = 0; y < content.length; y++) {
        for (let x = 0; x < content[y].length; x++) {
            const targetY = newY1 + y;
            const targetX = newX1 + x;
            if (targetY >= 0 && targetY < state.height && targetX >= 0 && targetX < state.width) {
                state.canvas[targetY][targetX] = content[y][x];
            }
        }
    }
    // Update selection bounds
    state.selectionStart = { x: newX1, y: newY1 };
    state.selectionEnd = { x: bounds.x2 + dx, y: bounds.y2 + dy };
    state.modified = true;
}
// =============================================================================
// FILL OPERATIONS
// =============================================================================
export function floodFill(state, x, y, newCell) {
    if (x < 0 || x >= state.width || y < 0 || y >= state.height)
        return;
    const targetCell = state.canvas[y][x];
    // Don't fill if already the same
    if (targetCell.char === newCell.char &&
        targetCell.fg === newCell.fg &&
        targetCell.bg === newCell.bg) {
        return;
    }
    saveUndoState(state);
    const stack = [{ x, y }];
    const visited = new Set();
    while (stack.length > 0) {
        const point = stack.pop();
        const key = `${point.x},${point.y}`;
        if (visited.has(key))
            continue;
        visited.add(key);
        if (point.x < 0 || point.x >= state.width ||
            point.y < 0 || point.y >= state.height)
            continue;
        const cell = state.canvas[point.y][point.x];
        // Check if matches target
        if (cell.char !== targetCell.char ||
            cell.fg !== targetCell.fg ||
            cell.bg !== targetCell.bg)
            continue;
        // Fill this cell
        state.canvas[point.y][point.x] = { ...newCell };
        // Add neighbors
        stack.push({ x: point.x + 1, y: point.y });
        stack.push({ x: point.x - 1, y: point.y });
        stack.push({ x: point.x, y: point.y + 1 });
        stack.push({ x: point.x, y: point.y - 1 });
    }
    state.modified = true;
}
// =============================================================================
// DRAWING PRIMITIVES
// =============================================================================
export function setCell(state, x, y, cell) {
    if (x < 0 || x >= state.width || y < 0 || y >= state.height)
        return;
    state.canvas[y][x] = { ...cell };
    state.modified = true;
}
export function getCell(state, x, y) {
    if (x < 0 || x >= state.width || y < 0 || y >= state.height)
        return null;
    return { ...state.canvas[y][x] };
}
export function drawLine(state, x1, y1, x2, y2, cell) {
    // Bresenham's line algorithm
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let x = x1;
    let y = y1;
    while (true) {
        setCell(state, x, y, cell);
        if (x === x2 && y === y2)
            break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
}
export function drawBox(state, x1, y1, x2, y2, cell, filled = false) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (filled) {
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                setCell(state, x, y, cell);
            }
        }
    }
    else {
        // Draw outline
        for (let x = minX; x <= maxX; x++) {
            setCell(state, x, minY, cell);
            setCell(state, x, maxY, cell);
        }
        for (let y = minY; y <= maxY; y++) {
            setCell(state, minX, y, cell);
            setCell(state, maxX, y, cell);
        }
    }
}
export function drawEllipse(state, cx, cy, rx, ry, cell, filled = false) {
    // Midpoint ellipse algorithm
    if (filled) {
        for (let y = -ry; y <= ry; y++) {
            for (let x = -rx; x <= rx; x++) {
                if ((x * x * ry * ry + y * y * rx * rx) <= (rx * rx * ry * ry)) {
                    setCell(state, cx + x, cy + y, cell);
                }
            }
        }
    }
    else {
        // Draw outline using parametric form
        const steps = Math.max(rx, ry) * 4;
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * 2 * Math.PI;
            const x = Math.round(cx + rx * Math.cos(angle));
            const y = Math.round(cy + ry * Math.sin(angle));
            setCell(state, x, y, cell);
        }
    }
}
// =============================================================================
// GUIDE OVERLAY HELPERS
// =============================================================================
/**
 * Check if a cell is on a guide overlay line (from old editor display.ts)
 */
export function isGuideOverlayCell(state, x, y) {
    if (state.showGuide === 'none')
        return false;
    switch (state.showGuide) {
        case '80x25':
            // Standard BBS screen: border at edges
            return x === 0 || x === 79 || y === 0 || y === 21;
        case '80x40':
            // Double-height screen: border at edges and midline
            return x === 0 || x === 79 || y === 0 || y === 21 || y === 11;
        case '44x22':
            // Amiga screen size (44 columns): vertical borders at columns 18 and 61
            return (x === 18 || x === 61) || y === 0 || y === 21;
        case 'grid':
            // Custom grid with configurable spacing
            return (x % state.gridSpacing === 0) || (y % state.gridSpacing === 0);
        default:
            return false;
    }
}
/**
 * Cycle through guide overlay types (from old editor drawing.ts)
 */
export function cycleGuideOverlay(state) {
    const types = ['none', '80x25', '80x40', '44x22', 'grid'];
    const currentIndex = types.indexOf(state.showGuide);
    const nextIndex = (currentIndex + 1) % types.length;
    state.showGuide = types[nextIndex];
}
// =============================================================================
// CANVAS RENDERING
// =============================================================================
export function renderCanvas(state) {
    let output = ANSI.HIDE_CURSOR + ANSI.pos(1, 1);
    // Get selection bounds for overlay rendering
    const selBounds = state.selecting ? getSelectionBounds(state) : null;
    for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
            const cell = state.canvas[y][x];
            // Check if this cell is on the selection border (dashed rectangle)
            let isSelectionBorder = false;
            if (selBounds) {
                const { x1, y1, x2, y2 } = selBounds;
                const isTopOrBottom = (y === y1 || y === y2) && x >= x1 && x <= x2;
                const isLeftOrRight = (x === x1 || x === x2) && y >= y1 && y <= y2;
                isSelectionBorder = isTopOrBottom || isLeftOrRight;
            }
            // Check if this cell is on a guide overlay line
            const isGuideLine = isGuideOverlayCell(state, x, y);
            // Build ANSI sequence for this cell
            output += ANSI.pos(x + 1, y + 1);
            // Render with selection overlay if on border (dashed line effect: alternating chars)
            if (isSelectionBorder) {
                const isDashed = (x + y) % 2 === 0; // Alternating pattern for dashed effect
                if (isDashed) {
                    output += ANSI.colors(7, 0); // White on black dash
                    output += '-';
                }
                else {
                    output += ANSI.colors(cell.fg, cell.bg);
                    if (cell.blink && state.iceColorsEnabled) {
                        output += ANSI.BLINK;
                    }
                    output += cell.char;
                }
            }
            else if (isGuideLine) {
                // Draw guide line (dim white dots)
                const isDot = (x + y) % 2 === 0; // Alternating pattern for dotted line
                if (isDot) {
                    output += ANSI.colors(7, 0); // White dot on black
                    output += '.';
                }
                else {
                    output += ANSI.colors(cell.fg, cell.bg);
                    if (cell.blink && state.iceColorsEnabled) {
                        output += ANSI.BLINK;
                    }
                    output += cell.char;
                }
            }
            else {
                // Normal cell rendering
                output += ANSI.colors(cell.fg, cell.bg);
                if (cell.blink && state.iceColorsEnabled) {
                    output += ANSI.BLINK;
                }
                output += cell.char;
            }
        }
    }
    // Selection overlay is now integrated into main rendering loop above
    // (No need for separate drawSelectionOverlay call)
    // Draw cursor
    if (state.cursorVisible) {
        output += ANSI.pos(state.cursorX + 1, state.cursorY + 1);
        output += ANSI.SHOW_CURSOR;
    }
    return output + ANSI.RESET;
}
function drawSelectionOverlay(state, bounds) {
    let output = '';
    // Draw corners and edges with inverted colors
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            const cell = state.canvas[y][x];
            output += ANSI.pos(x + 1, y + 1);
            output += `\x1b[7m`; // Inverse video
            output += cell.char;
            output += `\x1b[27m`; // Normal video
        }
    }
    return output;
}
export function renderStatusBar(state) {
    const pos = `X:${state.cursorX.toString().padStart(2)} Y:${state.cursorY.toString().padStart(2)}`;
    const colors = `FG:${state.currentFg.toString().padStart(2)} BG:${state.currentBg.toString().padStart(2)}`;
    const tool = `[${state.currentTool.toUpperCase()}]`;
    const modified = state.modified ? '*' : ' ';
    const filename = state.currentFilename || 'Untitled';
    let status = ANSI.pos(1, state.height + 1);
    status += ANSI.colors(0, 7); // Black on white
    status += ` ${tool} ${pos} ${colors} | ${filename}${modified} `;
    status += ' '.repeat(Math.max(0, state.width - status.length + 20));
    return status + ANSI.RESET;
}
// =============================================================================
// ADVANCED SELECTION OPERATIONS (from old editor)
// =============================================================================
/**
 * Fill selection with current foreground color (as background)
 */
export function fillSelection(state) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return;
    saveUndoState(state);
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            state.canvas[y][x].bg = state.currentFg;
        }
    }
    clearSelection(state);
    state.modified = true;
}
/**
 * Center selection horizontally on canvas
 */
export function centerSelection(state) {
    const bounds = getSelectionBounds(state);
    if (!bounds)
        return;
    saveUndoState(state);
    const selWidth = bounds.x2 - bounds.x1 + 1;
    const targetX = Math.floor((state.width - selWidth) / 2);
    // If already centered, nothing to do
    if (targetX === bounds.x1) {
        return;
    }
    const offset = targetX - bounds.x1;
    // Extract selection
    const temp = [];
    for (let y = bounds.y1; y <= bounds.y2; y++) {
        const row = [];
        for (let x = bounds.x1; x <= bounds.x2; x++) {
            row.push({ ...state.canvas[y][x] });
            // Clear original position
            state.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
        temp.push(row);
    }
    // Place at centered position
    for (let y = 0; y < temp.length; y++) {
        for (let x = 0; x < temp[y].length; x++) {
            const targetXPos = targetX + x;
            if (targetXPos >= 0 && targetXPos < state.width) {
                state.canvas[bounds.y1 + y][targetXPos] = temp[y][x];
            }
        }
    }
    // Update selection bounds
    state.selectionStart = { x: targetX, y: bounds.y1 };
    state.selectionEnd = { x: targetX + selWidth - 1, y: bounds.y2 };
    state.modified = true;
}
/**
 * Move selection (M key) - cuts and allows placement
 */
export function moveSelection(state) {
    copySelection(state);
    eraseSelection(state);
    // Selection is now in clipboard, ready to paste
}
/**
 * Cycle through operation modes (T/O/U keys)
 */
export function cycleOperationMode(state) {
    const modes = [
        'normal',
        'transparent',
        'over',
        'underneath'
    ];
    const currentIndex = modes.indexOf(state.operationMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    state.operationMode = modes[nextIndex];
}
/**
 * Paste with respect to operation mode
 */
export function pasteWithMode(state) {
    if (state.clipboard.length === 0)
        return;
    saveUndoState(state);
    for (let y = 0; y < state.clipboard.length; y++) {
        for (let x = 0; x < state.clipboard[y].length; x++) {
            const targetY = state.cursorY + y;
            const targetX = state.cursorX + x;
            if (targetY < state.height && targetX < state.width) {
                const srcCell = state.clipboard[y][x];
                const destCell = state.canvas[targetY][targetX];
                switch (state.operationMode) {
                    case 'transparent':
                        // Skip spaces (they become transparent)
                        if (srcCell.char !== ' ') {
                            state.canvas[targetY][targetX] = { ...srcCell };
                        }
                        break;
                    case 'over':
                        // Always draw over existing
                        state.canvas[targetY][targetX] = { ...srcCell };
                        break;
                    case 'underneath':
                        // Only draw where destination is space
                        if (destCell.char === ' ') {
                            state.canvas[targetY][targetX] = { ...srcCell };
                        }
                        break;
                    case 'normal':
                    default:
                        // Normal paste (replace all)
                        state.canvas[targetY][targetX] = { ...srcCell };
                        break;
                }
            }
        }
    }
    state.modified = true;
}
// =============================================================================
// COLOR CONTROLS (from old editor)
// =============================================================================
export function cycleFgUp(state) {
    state.currentFg = (state.currentFg + 1) % 16;
}
export function cycleFgDown(state) {
    state.currentFg = (state.currentFg - 1 + 16) % 16;
}
export function cycleBgUp(state) {
    state.currentBg = (state.currentBg + 1) % 16;
}
export function cycleBgDown(state) {
    state.currentBg = (state.currentBg - 1 + 16) % 16;
}
// =============================================================================
// LINE OPERATIONS (from old editor)
// =============================================================================
export function leftJustifyLine(state) {
    saveUndoState(state);
    const y = state.cursorY;
    const row = state.canvas[y];
    // Find first non-space
    let firstNonSpace = 0;
    for (let x = 0; x < state.width; x++) {
        if (row[x].char !== ' ') {
            firstNonSpace = x;
            break;
        }
    }
    // Shift left
    if (firstNonSpace > 0) {
        for (let x = 0; x < state.width - firstNonSpace; x++) {
            row[x] = row[x + firstNonSpace];
        }
        for (let x = state.width - firstNonSpace; x < state.width; x++) {
            row[x] = { char: ' ', fg: 7, bg: 0 };
        }
    }
    state.modified = true;
}
export function rightJustifyLine(state) {
    saveUndoState(state);
    const y = state.cursorY;
    const row = state.canvas[y];
    // Find last non-space
    let lastNonSpace = state.width - 1;
    for (let x = state.width - 1; x >= 0; x--) {
        if (row[x].char !== ' ') {
            lastNonSpace = x;
            break;
        }
    }
    // Shift right
    const shift = state.width - 1 - lastNonSpace;
    if (shift > 0) {
        for (let x = state.width - 1; x >= shift; x--) {
            row[x] = row[x - shift];
        }
        for (let x = 0; x < shift; x++) {
            row[x] = { char: ' ', fg: 7, bg: 0 };
        }
    }
    state.modified = true;
}
export function centerLine(state) {
    saveUndoState(state);
    const y = state.cursorY;
    const row = state.canvas[y];
    // Find first and last non-space
    let firstNonSpace = -1;
    let lastNonSpace = -1;
    for (let x = 0; x < state.width; x++) {
        if (row[x].char !== ' ') {
            if (firstNonSpace === -1)
                firstNonSpace = x;
            lastNonSpace = x;
        }
    }
    if (firstNonSpace === -1)
        return;
    const contentLength = lastNonSpace - firstNonSpace + 1;
    const leftPad = Math.floor((state.width - contentLength) / 2);
    // Copy content
    const content = [];
    for (let x = firstNonSpace; x <= lastNonSpace; x++) {
        content.push({ ...row[x] });
    }
    // Clear row
    for (let x = 0; x < state.width; x++) {
        row[x] = { char: ' ', fg: 7, bg: 0 };
    }
    // Paste centered
    for (let x = 0; x < content.length; x++) {
        if (leftPad + x < state.width) {
            row[leftPad + x] = content[x];
        }
    }
    state.modified = true;
}
export function eraseLine(state) {
    saveUndoState(state);
    const y = state.cursorY;
    for (let x = 0; x < state.width; x++) {
        state.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
    }
    state.modified = true;
}
export function eraseToStartOfLine(state) {
    saveUndoState(state);
    const y = state.cursorY;
    for (let x = 0; x <= state.cursorX; x++) {
        state.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
    }
    state.modified = true;
}
export function eraseToEndOfLine(state) {
    saveUndoState(state);
    const y = state.cursorY;
    for (let x = state.cursorX; x < state.width; x++) {
        state.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
    }
    state.modified = true;
}
// =============================================================================
// ROW/COLUMN OPERATIONS (from old editor)
// =============================================================================
export function insertRow(state) {
    saveUndoState(state);
    // Remove bottom row and insert blank row at cursor
    state.canvas.splice(state.height - 1, 1);
    const newRow = [];
    for (let x = 0; x < state.width; x++) {
        newRow.push({ char: ' ', fg: 7, bg: 0 });
    }
    state.canvas.splice(state.cursorY, 0, newRow);
    state.modified = true;
}
export function deleteRow(state) {
    saveUndoState(state);
    // Remove current row and add blank row at bottom
    state.canvas.splice(state.cursorY, 1);
    const newRow = [];
    for (let x = 0; x < state.width; x++) {
        newRow.push({ char: ' ', fg: 7, bg: 0 });
    }
    state.canvas.splice(state.height - 1, 0, newRow);
    state.modified = true;
}
export function insertColumn(state) {
    saveUndoState(state);
    for (let y = 0; y < state.height; y++) {
        state.canvas[y].splice(state.width - 1, 1);
        state.canvas[y].splice(state.cursorX, 0, { char: ' ', fg: 7, bg: 0 });
    }
    state.modified = true;
}
export function deleteColumn(state) {
    saveUndoState(state);
    for (let y = 0; y < state.height; y++) {
        state.canvas[y].splice(state.cursorX, 1);
        state.canvas[y].splice(state.width - 1, 0, { char: ' ', fg: 7, bg: 0 });
    }
    state.modified = true;
}
export function eraseColumn(state) {
    saveUndoState(state);
    for (let y = 0; y < state.height; y++) {
        state.canvas[y][state.cursorX] = { char: ' ', fg: 7, bg: 0 };
    }
    state.modified = true;
}
export function eraseToStartOfColumn(state) {
    saveUndoState(state);
    for (let y = 0; y <= state.cursorY; y++) {
        state.canvas[y][state.cursorX] = { char: ' ', fg: 7, bg: 0 };
    }
    state.modified = true;
}
export function eraseToEndOfColumn(state) {
    saveUndoState(state);
    for (let y = state.cursorY; y < state.height; y++) {
        state.canvas[y][state.cursorX] = { char: ' ', fg: 7, bg: 0 };
    }
    state.modified = true;
}
// =============================================================================
// CANVAS SCROLLING (from old editor)
// =============================================================================
export function scrollCanvasUp(state) {
    saveUndoState(state);
    // Remove first row and add empty row at bottom
    state.canvas.shift();
    state.canvas.push(Array(state.width).fill(0).map(() => ({ char: ' ', fg: 7, bg: 0 })));
    state.modified = true;
}
export function scrollCanvasDown(state) {
    saveUndoState(state);
    // Remove last row and add empty row at top
    state.canvas.pop();
    state.canvas.unshift(Array(state.width).fill(0).map(() => ({ char: ' ', fg: 7, bg: 0 })));
    state.modified = true;
}
export function scrollCanvasLeft(state) {
    saveUndoState(state);
    // Remove first column from each row and add empty column at right
    for (let y = 0; y < state.height; y++) {
        state.canvas[y].shift();
        state.canvas[y].push({ char: ' ', fg: 7, bg: 0 });
    }
    state.modified = true;
}
export function scrollCanvasRight(state) {
    saveUndoState(state);
    // Remove last column from each row and add empty column at left
    for (let y = 0; y < state.height; y++) {
        state.canvas[y].pop();
        state.canvas[y].unshift({ char: ' ', fg: 7, bg: 0 });
    }
    state.modified = true;
}
