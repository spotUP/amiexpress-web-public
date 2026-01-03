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
export type { ANSIColorName, ANSIColorInfo } from './ui/color-picker';
export type { ToolbarAction } from './ui/toolbar';

// Input handling
export { KeyboardHandler } from './input/keyboard-handler';

// Future exports (to be implemented)
// export { ANSIEditorComponent } from './components/editor-component';
// export { showInlineEditor } from './api/inline-editor';
