/**
 * Type definitions for ANSI Editor SDK
 * Complete type system for state-of-the-art ANSI/ASCII art editor
 */
export interface Cell {
    char: string;
    fg: number;
    bg: number;
    blink?: boolean;
}
export interface Point {
    x: number;
    y: number;
}
export interface SelectionBounds {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
export type Tool = 'draw' | 'line' | 'box' | 'box-fill' | 'ellipse' | 'ellipse-fill' | 'text' | 'fill' | 'pick' | 'select' | 'shifter';
export type BrushMode = 'half-block' | 'quarter-block' | 'custom' | 'shading' | 'colorize' | 'replace';
export type OperationMode = 'normal' | 'transparent' | 'over' | 'underneath';
export type GuideType = 'none' | '80x25' | '80x40' | '44x22' | 'grid';
export interface EditorState {
    canvas: Cell[][];
    width: number;
    height: number;
    cursorX: number;
    cursorY: number;
    cursorVisible: boolean;
    currentFg: number;
    currentBg: number;
    currentChar: string;
    currentTool: Tool;
    brushMode: BrushMode;
    operationMode: OperationMode;
    brushSize: number;
    mirrorModeEnabled: boolean;
    numpadModeEnabled: boolean;
    straightLineMode: boolean;
    iceColorsEnabled: boolean;
    blinkEnabled: boolean;
    undoStack: Cell[][][];
    redoStack: Cell[][][];
    maxUndoLevels: number;
    lastUndoTime: number;
    undoChunkTimeout: number;
    pendingUndoChunk: boolean;
    selecting: boolean;
    selectionStart: Point | null;
    selectionEnd: Point | null;
    clipboard: Cell[][];
    viewportX: number;
    viewportY: number;
    showGuide: GuideType;
    showStatusBar: boolean;
    showColorPalette: boolean;
    showToolbar: boolean;
    gridSpacing: number;
    currentFKeySet: 'normal' | 'shift';
    currentFilename: string | null;
    modified: boolean;
    lastSavedCanvas: Cell[][] | null;
    insertMode: boolean;
    autoSaveEnabled: boolean;
    autoSaveIntervalMs: number;
    drawingStartPoint: Point | null;
    drawingEndPoint: Point | null;
    drawingPreview: Cell[][] | null;
    mouseDown: boolean;
    lastMouseX: number;
    lastMouseY: number;
}
export interface FileMetadata {
    filename: string;
    width: number;
    height: number;
    format: 'ANS' | 'ASC' | 'BIN' | 'XB' | 'TXT';
    iceColors: boolean;
    created: Date;
    modified: Date;
}
export interface ColorPair {
    fg: number;
    bg: number;
}
export interface ShiftDirection {
    direction: 'left' | 'right' | 'up' | 'down';
    amount: number;
}
export declare const ANSI: {
    HIDE_CURSOR: string;
    SHOW_CURSOR: string;
    CLEAR_SCREEN: string;
    SAVE_CURSOR: string;
    RESTORE_CURSOR: string;
    RESET: string;
    BOLD: string;
    BLINK: string;
    pos: (x: number, y: number) => string;
    moveUp: (n: number) => string;
    moveDown: (n: number) => string;
    moveRight: (n: number) => string;
    moveLeft: (n: number) => string;
    fg: (color: number) => string;
    bg: (color: number) => string;
    colors: (fg: number, bg: number) => string;
};
export declare const COLOR_NAMES: string[];
export declare const DRAW_CHARS: {
    UPPER_HALF: string;
    LOWER_HALF: string;
    LEFT_HALF: string;
    RIGHT_HALF: string;
    FULL_BLOCK: string;
    UPPER_LEFT: string;
    UPPER_RIGHT: string;
    LOWER_LEFT: string;
    LOWER_RIGHT: string;
    LIGHT_SHADE: string;
    MEDIUM_SHADE: string;
    DARK_SHADE: string;
    HORIZONTAL: string;
    VERTICAL: string;
    TOP_LEFT: string;
    TOP_RIGHT: string;
    BOTTOM_LEFT: string;
    BOTTOM_RIGHT: string;
    CROSS: string;
    T_DOWN: string;
    T_UP: string;
    T_LEFT: string;
    T_RIGHT: string;
    DOUBLE_HORIZONTAL: string;
    DOUBLE_VERTICAL: string;
    DOUBLE_TOP_LEFT: string;
    DOUBLE_TOP_RIGHT: string;
    DOUBLE_BOTTOM_LEFT: string;
    DOUBLE_BOTTOM_RIGHT: string;
};
export declare const SHORTCUTS: {
    TOOL_DRAW: string;
    TOOL_LINE: string;
    TOOL_BOX: string;
    TOOL_ELLIPSE: string;
    TOOL_TEXT: string;
    TOOL_FILL: string;
    TOOL_PICK: string;
    TOOL_SELECT: string;
    TOOL_SHIFTER: string;
    NEW: string;
    OPEN: string;
    SAVE: string;
    SAVE_AS: string;
    IMPORT: string;
    EXPORT: string;
    UNDO: string;
    REDO: string;
    COPY: string;
    CUT: string;
    PASTE: string;
    DELETE: string;
    SELECT_ALL: string;
    TOGGLE_GUIDES: string;
    TOGGLE_GRID: string;
    TOGGLE_COLORS: string;
    TOGGLE_ICE: string;
    MOVE_LEFT: string;
    MOVE_RIGHT: string;
    MOVE_UP: string;
    MOVE_DOWN: string;
    MOVE_PAGE_UP: string;
    MOVE_PAGE_DOWN: string;
    MOVE_HOME: string;
    MOVE_END: string;
    COLOR_PICKER: string;
    HELP: string;
    EXIT: string;
    CONFIRM: string;
    CANCEL: string;
};
export interface KeyBinding {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    action: () => void | Promise<void>;
    description: string;
}
