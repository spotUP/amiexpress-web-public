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

/**
 * Autocomplete context passed to providers
 */
export interface AutocompleteContext {
  currentLine: string;
  cursorPosition: number;
  documentContent: string[];
  lineNumber: number;
}

/**
 * Autocomplete suggestion
 */
export interface AutocompleteSuggestion {
  label: string;
  insertText: string;
  detail?: string;
  sortText?: string;
  filterText?: string;
  kind?: 'text' | 'keyword' | 'function' | 'variable' | 'user';
}

/**
 * Autocomplete provider interface
 */
export interface AutocompleteProvider {
  trigger?: string;
  getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]>;
  shouldTrigger?(context: AutocompleteContext): boolean;
}

/**
 * ANSI token types
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
