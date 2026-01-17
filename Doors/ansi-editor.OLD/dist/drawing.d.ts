/**
 * Drawing tools for ANSI Editor
 * Implements all drawing tools with proper preview and commit
 */
import { EditorState, Tool } from './types.js';
export interface ToolHandler {
    onStart: (state: EditorState, x: number, y: number) => void;
    onMove: (state: EditorState, x: number, y: number) => void;
    onEnd: (state: EditorState, x: number, y: number) => void;
    onCancel: (state: EditorState) => void;
}
export declare const drawTool: ToolHandler;
export declare const lineTool: ToolHandler;
export declare const boxTool: ToolHandler;
export declare const boxFillTool: ToolHandler;
export declare const ellipseTool: ToolHandler;
export declare const ellipseFillTool: ToolHandler;
export declare const fillTool: ToolHandler;
export declare const pickTool: ToolHandler;
export declare const textTool: ToolHandler;
export declare function insertTextChar(state: EditorState, char: string): void;
export declare const shifterTool: ToolHandler;
export declare function shiftHalfBlock(state: EditorState, direction: 'left' | 'right'): void;
export declare function getToolHandler(tool: Tool): ToolHandler;
/**
 * Draw with brush - supports brush size 1-9 and different brush modes
 */
export declare function drawWithBrush(state: EditorState, centerX: number, centerY: number, useBg?: boolean): void;
/**
 * Apply brush mode to a single cell
 */
export declare function applyBrushMode(state: EditorState, x: number, y: number, useBg: boolean): void;
/**
 * Toggle mirror mode (horizontal symmetry drawing)
 */
export declare function toggleMirrorMode(state: EditorState): void;
/**
 * Toggle numpad drawing mode
 */
export declare function toggleNumpadMode(state: EditorState): void;
/**
 * Handle numpad drawing (keyboard-based directional drawing)
 * Maps keyboard keys to numpad directions:
 *   7 8 9  (up-left, up, up-right)
 *   u i o  (left, stay, right)
 *   j k l  (down-left, down, down-right)
 * Returns true if key was handled
 */
export declare function handleNumpadDraw(state: EditorState, key: string): boolean;
/**
 * Enhanced shiftCell - shift half-blocks left/right or clear
 */
export declare function shiftCellWithClear(state: EditorState, direction: 'left' | 'right', clear?: boolean): void;
