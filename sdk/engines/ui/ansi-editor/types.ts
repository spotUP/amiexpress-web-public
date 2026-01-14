/**
 * Type definitions for ANSI Editor SDK
 */

import type * as Blessed from 'blessed';

/**
 * Minimal session interface for editor
 * Can be a full BBSSession or any session-like object
 */
export interface EditorSession {
  writeLine?(text: string): void;
  waitForKey?(): Promise<string>;
}

/**
 * Cursor position in the document
 */
export interface Position {
  line: number;  // 0-based line number
  col: number;   // 0-based column number (visual position, not accounting for ANSI)
}

/**
 * Text selection range
 */
export interface Selection {
  start: Position;
  end: Position;
  text: string;
}

/**
 * Editor configuration options
 */
export interface EditorOptions {
  title?: string;
  initialContent?: string;
  filePath?: string;
  maxLines?: number;
  maxLineLength?: number;
  showLineNumbers?: boolean;
  readOnly?: boolean;
  syntax?: 'ansi' | 'plain' | 'bbscode';
  onSave?: (content: string) => Promise<boolean>;
  customKeybindings?: KeyBinding[];
  toolbar?: boolean;
  statusBar?: boolean;
  tabSize?: number;
  autoIndent?: boolean;
}

/**
 * Key binding definition
 */
export interface KeyBinding {
  keys: string[];  // e.g., ['C-s'], ['escape'], ['up']
  action: string | ((editor: any) => void);
  description?: string;
}

/**
 * Undo/redo operation
 */
export interface EditorOperation {
  type: 'insert' | 'delete' | 'replace';
  position: Position;
  content: string;
  previousContent?: string;
  timestamp: number;
}

import type {
  AutocompleteContext,
  AutocompleteSuggestion,
  AutocompleteProvider
} from '../blessed/core/types';

export type {
  AutocompleteContext,
  AutocompleteSuggestion,
  AutocompleteProvider
};

/**
 * Canvas cell for drawing mode
 * Used for pixel-based ANSI art editing
 */
export interface Cell {
  char: string;
  fg: number;  // 0-15 (0-7 normal, 8-15 bright)
  bg: number;  // 0-15 (0-7 normal, 8-15 bright with iCE colors)
  blink?: boolean;  // Blink attribute (requires iCE colors)
}

/**
 * Drawing tool types
 */
export type DrawingTool =
  | 'draw'          // Freehand drawing
  | 'line'          // Straight lines
  | 'box'           // Rectangles
  | 'box-fill'      // Filled rectangles
  | 'ellipse'       // Ellipse outline
  | 'ellipse-fill'  // Filled ellipse
  | 'text'          // Text mode (default)
  | 'fill'          // Flood fill
  | 'pick'          // Color/char picker
  | 'select';       // Selection tool

/**
 * Brush mode for drawing
 */
export type BrushMode =
  | 'half-block'    // Half-block drawing (default)
  | 'quarter-block' // Quarter-block drawing
  | 'custom'        // Custom character
  | 'shading'       // Shade patterns
  | 'colorize'      // Change colors only
  | 'replace';      // Replace specific char/color

/**
 * Editor mode
 */
export type EditorMode =
  | 'text'          // Text editing mode (default)
  | 'draw';         // Drawing mode with canvas

/**
 * Minimal session interface for editor
 */
export type ANSITokenType = 'text' | 'ansi' | 'reset' | 'color' | 'style';

/**
 * Parsed ANSI token
 */
export interface ANSIToken {
  type: ANSITokenType;
  content: string;
  start: number;  // Position in original string
  end: number;
}

/**
 * Editor state
 */
export interface EditorState {
  lines: string[];
  cursor: Position;
  selection: Selection | null;
  scrollTop: number;
  scrollLeft: number;
  insertMode: boolean;
  modified: boolean;
  undoStack: EditorOperation[];
  redoStack: EditorOperation[];

  // Drawing mode extensions
  mode?: EditorMode;
  canvas?: Cell[][];           // Cell-based canvas for drawing
  canvasWidth?: number;         // Canvas width in characters
  canvasHeight?: number;        // Canvas height in characters
  currentTool?: DrawingTool;    // Active drawing tool
  brushMode?: BrushMode;        // Brush mode
  currentFg?: number;           // Current foreground color (0-15)
  currentBg?: number;           // Current background color (0-15)
  currentChar?: string;         // Current character for drawing
  drawingStartPoint?: Position | null;  // Start point for shape tools
  drawingEndPoint?: Position | null;    // End point for shape tools
  drawingPreview?: Cell[][] | null;     // Preview canvas for tools
  iceColorsEnabled?: boolean;   // Enable 16 BG colors + blink
}

/**
 * Viewport information
 */
export interface ViewportInfo {
  width: number;
  height: number;
  scrollTop: number;
  scrollLeft: number;
  visibleLineStart: number;
  visibleLineEnd: number;
}

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

/**
 * Search result
 */
export interface SearchResult {
  line: number;
  col: number;
  length: number;
  match: string;
}

/**
 * Color definition
 */
export interface ANSIColor {
  name: string;
  fg: string;   // ANSI foreground code
  bg: string;   // ANSI background code
  sample: string;  // Visual sample for display
}

/**
 * Event handlers
 */
export type EditorEventHandler = (data?: any) => void;

export interface EditorEvents {
  save: EditorEventHandler;
  exit: EditorEventHandler;
  change: EditorEventHandler;
  cursorMove: EditorEventHandler;
  selectionChange: EditorEventHandler;
}
