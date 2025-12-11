/**
 * Type definitions for ANSI Editor SDK
 * Complete type system for state-of-the-art ANSI/ASCII art editor
 */

export interface Cell {
  char: string;
  fg: number;  // 0-15 (0-7 normal, 8-15 bright)
  bg: number;  // 0-15 (0-7 normal, 8-15 bright with iCE colors)
  blink?: boolean;  // Blink attribute (requires iCE colors)
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

export type Tool =
  | 'draw'          // Freehand drawing
  | 'line'          // Straight lines
  | 'box'           // Rectangles
  | 'box-fill'      // Filled rectangles
  | 'ellipse'       // Ellipse outline
  | 'ellipse-fill'  // Filled ellipse
  | 'text'          // Text mode
  | 'fill'          // Flood fill
  | 'pick'          // Color/char picker
  | 'select'        // Selection tool
  | 'shifter';      // Half-block shifter

export type BrushMode =
  | 'half-block'    // Half-block drawing (default)
  | 'quarter-block' // Quarter-block drawing
  | 'custom'        // Custom character
  | 'shading'       // Shade patterns
  | 'colorize'      // Change colors only
  | 'replace';      // Replace specific char/color

export type OperationMode =
  | 'normal'        // Normal drawing
  | 'transparent'   // Transparent mode (skip spaces)
  | 'over'          // Draw over existing
  | 'underneath';   // Draw underneath

export type GuideType =
  | 'none'          // No guides
  | '80x25'         // Standard BBS dimensions
  | '80x40'         // Extended height
  | '44x22'         // Amiga low-res
  | 'grid';         // Grid overlay

export interface EditorState {
  // Canvas
  canvas: Cell[][];
  width: number;
  height: number;

  // Cursor
  cursorX: number;
  cursorY: number;
  cursorVisible: boolean;

  // Drawing state
  currentFg: number;
  currentBg: number;
  currentChar: string;
  currentTool: Tool;
  brushMode: BrushMode;
  operationMode: OperationMode;

  // Brush state (from old editor)
  brushSize: number;  // 1-9
  mirrorModeEnabled: boolean;  // Horizontal symmetry drawing
  numpadModeEnabled: boolean;  // Numpad directional drawing
  straightLineMode: boolean;  // Tab-hold for straight lines

  // iCE colors and attributes
  iceColorsEnabled: boolean;
  blinkEnabled: boolean;

  // Undo/redo
  undoStack: Cell[][][];
  redoStack: Cell[][][];
  maxUndoLevels: number;
  lastUndoTime: number;
  undoChunkTimeout: number;
  pendingUndoChunk: boolean;

  // Selection
  selecting: boolean;
  selectionStart: Point | null;
  selectionEnd: Point | null;
  clipboard: Cell[][];

  // Viewport state (for large canvases)
  viewportX: number;  // Top-left X of viewport
  viewportY: number;  // Top-left Y of viewport

  // UI state
  showGuide: GuideType;
  showStatusBar: boolean;
  showColorPalette: boolean;
  showToolbar: boolean;
  gridSpacing: number;  // For grid guide overlay
  currentFKeySet: 'normal' | 'shift';  // Current F-key set

  // File state
  currentFilename: string | null;
  modified: boolean;
  lastSavedCanvas: Cell[][] | null;  // For revert functionality
  insertMode: boolean;  // Insert mode for text editing

  // Auto-save state (from old editor)
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: number;  // Milliseconds between auto-saves (default 5 mins)

  // Drawing state for tools
  drawingStartPoint: Point | null;
  drawingEndPoint: Point | null;
  drawingPreview: Cell[][] | null;

  // Mouse state
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

// ANSI escape codes
export const ANSI = {
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h',
  CLEAR_SCREEN: '\x1b[2J\x1b[H',
  SAVE_CURSOR: '\x1b7',
  RESTORE_CURSOR: '\x1b8',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  BLINK: '\x1b[5m',

  // Positioning
  pos: (x: number, y: number) => `\x1b[${y};${x}H`,
  moveUp: (n: number) => `\x1b[${n}A`,
  moveDown: (n: number) => `\x1b[${n}B`,
  moveRight: (n: number) => `\x1b[${n}C`,
  moveLeft: (n: number) => `\x1b[${n}D`,

  // Colors
  fg: (color: number) => color < 8 ? `\x1b[3${color}m` : `\x1b[9${color - 8}m`,
  bg: (color: number) => color < 8 ? `\x1b[4${color}m` : `\x1b[10${color - 8}m`,
  colors: (fg: number, bg: number) => `\x1b[0;${fg < 8 ? 3 : 9}${fg % 8};${bg < 8 ? 4 : 10}${bg % 8}m`,
};

// Color names for display
export const COLOR_NAMES = [
  // Standard colors (0-7)
  'Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White',
  // Bright colors (8-15)
  'Gray', 'Bright Red', 'Bright Green', 'Bright Yellow',
  'Bright Blue', 'Bright Magenta', 'Bright Cyan', 'Bright White'
];

// Common drawing characters
export const DRAW_CHARS = {
  // Half-blocks
  UPPER_HALF: '▀',
  LOWER_HALF: '▄',
  LEFT_HALF: '▌',
  RIGHT_HALF: '▐',
  FULL_BLOCK: '█',

  // Quarter-blocks
  UPPER_LEFT: '▘',
  UPPER_RIGHT: '▝',
  LOWER_LEFT: '▖',
  LOWER_RIGHT: '▗',

  // Shading
  LIGHT_SHADE: '░',
  MEDIUM_SHADE: '▒',
  DARK_SHADE: '▓',

  // Box drawing
  HORIZONTAL: '─',
  VERTICAL: '│',
  TOP_LEFT: '┌',
  TOP_RIGHT: '┐',
  BOTTOM_LEFT: '└',
  BOTTOM_RIGHT: '┘',
  CROSS: '┼',
  T_DOWN: '┬',
  T_UP: '┴',
  T_LEFT: '┤',
  T_RIGHT: '├',

  // Double box drawing
  DOUBLE_HORIZONTAL: '═',
  DOUBLE_VERTICAL: '║',
  DOUBLE_TOP_LEFT: '╔',
  DOUBLE_TOP_RIGHT: '╗',
  DOUBLE_BOTTOM_LEFT: '╚',
  DOUBLE_BOTTOM_RIGHT: '╝',
};

// Keyboard shortcuts
export const SHORTCUTS = {
  // Tools
  TOOL_DRAW: 'd',
  TOOL_LINE: 'l',
  TOOL_BOX: 'b',
  TOOL_ELLIPSE: 'e',
  TOOL_TEXT: 't',
  TOOL_FILL: 'f',
  TOOL_PICK: 'p',
  TOOL_SELECT: 's',
  TOOL_SHIFTER: 'h',

  // File operations
  NEW: 'n',
  OPEN: 'o',
  SAVE: 's',
  SAVE_AS: 'S',
  IMPORT: 'i',
  EXPORT: 'E',

  // Edit operations
  UNDO: 'z',
  REDO: 'y',
  COPY: 'c',
  CUT: 'x',
  PASTE: 'v',
  DELETE: 'delete',
  SELECT_ALL: 'a',

  // View
  TOGGLE_GUIDES: 'g',
  TOGGLE_GRID: 'G',
  TOGGLE_COLORS: 'C',
  TOGGLE_ICE: 'I',

  // Navigation
  MOVE_LEFT: 'left',
  MOVE_RIGHT: 'right',
  MOVE_UP: 'up',
  MOVE_DOWN: 'down',
  MOVE_PAGE_UP: 'pageup',
  MOVE_PAGE_DOWN: 'pagedown',
  MOVE_HOME: 'home',
  MOVE_END: 'end',

  // Other
  COLOR_PICKER: 'k',
  HELP: 'F1',
  EXIT: 'q',
  CONFIRM: 'enter',
  CANCEL: 'escape',
};

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void | Promise<void>;
  description: string;
}
