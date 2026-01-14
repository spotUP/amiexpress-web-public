/**
 * ANSI Editor SDK
 * Modern ANSI-aware text editor with neo-blessed UI
 *
 * @module @amiexpress/bbs-door-sdk/engines/ui/ansi-editor
 */

// Core exports
export { ANSIUtils } from './core/ansi-utils';
export { EditorState } from './core/editor-state';
export { CursorManager } from './core/cursor';
export { Clipboard } from './core/clipboard';
export { SearchManager } from './core/search';
export {
  AutocompleteManager,
  UsernameProvider,
  BBSCodeProvider,
  WordProvider,
} from './core/autocomplete';
export * as Canvas from './core/canvas';
export * as FileOps from './core/file-ops';

// Type exports
export type {
  EditorSession,
  Position,
  Selection,
  EditorOptions,
  KeyBinding,
  EditorOperation,
  AutocompleteContext,
  AutocompleteSuggestion,
  AutocompleteProvider,
  ANSIToken,
  ANSITokenType,
  ANSIColor,
  EditorState as IEditorState,
  ViewportInfo,
  SearchOptions,
  SearchResult,
  EditorEventHandler,
  EditorEvents,
  Cell,
  DrawingTool,
  BrushMode,
  EditorMode,
} from './types';

// Main API
export { showANSIEditor } from './api/editor';

// UI Components
export { Viewport } from './rendering/viewport';
export { StatusBar } from './ui/status-bar';
export { SearchDialog } from './ui/search-dialog';
export { ColorPicker } from './ui/color-picker';
export { Toolbar } from './ui/toolbar';
export { AutocompleteDialog } from './ui/autocomplete-dialog';
export { CharacterPicker, ColorPicker as DrawColorPicker } from './ui/character-picker';
export type { ANSIColorName, ANSIColorInfo } from './ui/color-picker';
export type { ToolbarAction } from './ui/toolbar';

// Input handling
export { KeyboardHandler } from './input/keyboard-handler';

// Drawing Tools
export * as DrawingTools from './tools/drawing-tools';
export * as BrushModes from './tools/brush-modes';
export {
  getToolHandler,
  handleDrawEvent,
  undoDrawing,
  clearUndoStack,
  getSelection,
  clearSelection,
  copySelection,
  pasteSelection,
} from './tools/drawing-tools';
export {
  getBrushCell,
  getMirroredPositions,
  applyBrushWithMirror,
  getBrushArea,
  applyDithering,
} from './tools/brush-modes';
export {
  getCP437Char,
  getCP437Code,
  isCP437Char,
  getAllCP437Chars,
  getCommonDrawingChars,
} from './ui/character-picker';

// File Operations
export {
  loadANSFile,
  saveANSFile,
  loadASCFile,
  saveASCFile,
  loadXBFile,
  detectFileFormat,
  loadFile,
  saveFile,
} from './core/file-ops';
export type { SAUCERecord } from './core/file-ops';
