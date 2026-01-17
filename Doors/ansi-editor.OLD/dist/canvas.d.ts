/**
 * Canvas operations for ANSI Editor
 * Handles undo/redo, selection, clipboard, transformations
 */
import { Cell, SelectionBounds, EditorState } from './types.js';
export declare function createCanvas(width: number, height: number): Cell[][];
export declare function cloneCanvas(canvas: Cell[][]): Cell[][];
export declare function clearCanvas(state: EditorState): void;
export declare function saveUndoState(state: EditorState, chunk?: boolean): void;
export declare function flushUndoChunk(state: EditorState): void;
export declare function undo(state: EditorState): boolean;
export declare function redo(state: EditorState): boolean;
export declare function startSelection(state: EditorState): void;
export declare function updateSelection(state: EditorState): void;
export declare function clearSelection(state: EditorState): void;
export declare function getSelectionBounds(state: EditorState): SelectionBounds | null;
export declare function isInSelection(state: EditorState, x: number, y: number): boolean;
export declare function selectAll(state: EditorState): void;
export declare function copySelection(state: EditorState): boolean;
export declare function cutSelection(state: EditorState): boolean;
export declare function eraseSelection(state: EditorState): void;
export declare function pasteSelection(state: EditorState): void;
export declare function flipSelectionHorizontal(state: EditorState): void;
export declare function flipSelectionVertical(state: EditorState): void;
export declare function rotateSelection90(state: EditorState, clockwise?: boolean): void;
export declare function shiftSelection(state: EditorState, dx: number, dy: number): void;
export declare function floodFill(state: EditorState, x: number, y: number, newCell: Cell): void;
export declare function setCell(state: EditorState, x: number, y: number, cell: Cell): void;
export declare function getCell(state: EditorState, x: number, y: number): Cell | null;
export declare function drawLine(state: EditorState, x1: number, y1: number, x2: number, y2: number, cell: Cell): void;
export declare function drawBox(state: EditorState, x1: number, y1: number, x2: number, y2: number, cell: Cell, filled?: boolean): void;
export declare function drawEllipse(state: EditorState, cx: number, cy: number, rx: number, ry: number, cell: Cell, filled?: boolean): void;
/**
 * Check if a cell is on a guide overlay line (from old editor display.ts)
 */
export declare function isGuideOverlayCell(state: EditorState, x: number, y: number): boolean;
/**
 * Cycle through guide overlay types (from old editor drawing.ts)
 */
export declare function cycleGuideOverlay(state: EditorState): void;
export declare function renderCanvas(state: EditorState): string;
export declare function renderStatusBar(state: EditorState): string;
/**
 * Fill selection with current foreground color (as background)
 */
export declare function fillSelection(state: EditorState): void;
/**
 * Center selection horizontally on canvas
 */
export declare function centerSelection(state: EditorState): void;
/**
 * Move selection (M key) - cuts and allows placement
 */
export declare function moveSelection(state: EditorState): void;
/**
 * Cycle through operation modes (T/O/U keys)
 */
export declare function cycleOperationMode(state: EditorState): void;
/**
 * Paste with respect to operation mode
 */
export declare function pasteWithMode(state: EditorState): void;
export declare function cycleFgUp(state: EditorState): void;
export declare function cycleFgDown(state: EditorState): void;
export declare function cycleBgUp(state: EditorState): void;
export declare function cycleBgDown(state: EditorState): void;
export declare function leftJustifyLine(state: EditorState): void;
export declare function rightJustifyLine(state: EditorState): void;
export declare function centerLine(state: EditorState): void;
export declare function eraseLine(state: EditorState): void;
export declare function eraseToStartOfLine(state: EditorState): void;
export declare function eraseToEndOfLine(state: EditorState): void;
export declare function insertRow(state: EditorState): void;
export declare function deleteRow(state: EditorState): void;
export declare function insertColumn(state: EditorState): void;
export declare function deleteColumn(state: EditorState): void;
export declare function eraseColumn(state: EditorState): void;
export declare function eraseToStartOfColumn(state: EditorState): void;
export declare function eraseToEndOfColumn(state: EditorState): void;
export declare function scrollCanvasUp(state: EditorState): void;
export declare function scrollCanvasDown(state: EditorState): void;
export declare function scrollCanvasLeft(state: EditorState): void;
export declare function scrollCanvasRight(state: EditorState): void;
