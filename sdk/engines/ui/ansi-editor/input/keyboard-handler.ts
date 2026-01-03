/**
 * Keyboard input handler
 * Routes keyboard events to appropriate editor actions
 */

import type { EditorState } from '../core/editor-state';
import { CursorManager } from '../core/cursor';
import { Clipboard } from '../core/clipboard';

export interface KeyboardHandlerOptions {
  onExit?: () => void;
  onSave?: () => void;
  onHelp?: () => void;
  onFind?: () => void;
  onFindNext?: () => void;
  onReplace?: () => void;
  onColorPicker?: () => void;
  onAutocomplete?: () => void;
}

/**
 * Keyboard handler
 */
export class KeyboardHandler {
  private state: EditorState;
  private cursor: CursorManager;
  private options: KeyboardHandlerOptions;
  private selectionAnchor: { line: number; col: number } | null = null;

  constructor(state: EditorState, options: KeyboardHandlerOptions = {}) {
    this.state = state;
    this.cursor = new CursorManager(state);
    this.options = options;
  }

  /**
   * Handle key press
   * Returns true if handled, false otherwise
   */
  handleKey(key: string, shift: boolean = false, ctrl: boolean = false, alt: boolean = false): boolean {
    // Control key combinations
    if (ctrl) {
      return this.handleCtrlKey(key);
    }

    // Alt key combinations
    if (alt) {
      return this.handleAltKey(key);
    }

    // Navigation keys
    switch (key) {
      case 'up':
        if (shift) {
          this.startSelection();
          this.cursor.moveUp();
          this.updateSelection();
        } else {
          this.clearSelectionAnchor();
          this.cursor.moveUp();
        }
        return true;

      case 'down':
        if (shift) {
          this.startSelection();
          this.cursor.moveDown();
          this.updateSelection();
        } else {
          this.clearSelectionAnchor();
          this.cursor.moveDown();
        }
        return true;

      case 'left':
        if (shift) {
          this.startSelection();
          this.cursor.moveLeft();
          this.updateSelection();
        } else {
          this.clearSelectionAnchor();
          this.cursor.moveLeft();
        }
        return true;

      case 'right':
        if (shift) {
          this.startSelection();
          this.cursor.moveRight();
          this.updateSelection();
        } else {
          this.clearSelectionAnchor();
          this.cursor.moveRight();
        }
        return true;

      case 'home':
        if (shift) {
          this.startSelection();
          this.cursor.smartHome();
          this.updateSelection();
        } else {
          this.clearSelectionAnchor();
          this.cursor.smartHome();
        }
        return true;

      case 'end':
        if (shift) {
          this.startSelection();
          this.cursor.moveToLineEnd();
          this.updateSelection();
        } else {
          this.clearSelectionAnchor();
          this.cursor.moveToLineEnd();
        }
        return true;

      case 'pageup':
        this.cursor.pageUp();
        return true;

      case 'pagedown':
        this.cursor.pageDown();
        return true;

      case 'insert':
        this.state.toggleInsertMode();
        return true;

      case 'backspace':
        this.state.deleteCharBefore();
        return true;

      case 'delete':
        this.state.deleteCharAfter();
        return true;

      case 'enter':
      case 'return':
        this.state.insertNewLine();
        return true;

      case 'tab':
        // Insert tab (or spaces)
        this.state.insertText('    ');  // 4 spaces
        return true;

      case 'escape':
        if (this.options.onExit) {
          this.options.onExit();
        }
        return true;

      case 'f1':
        if (this.options.onHelp) {
          this.options.onHelp();
        }
        return true;

      case 'f2':
        if (this.options.onColorPicker) {
          this.options.onColorPicker();
        }
        return true;

      case 'f3':
        if (this.options.onFindNext) {
          this.options.onFindNext();
        }
        return true;

      default:
        // Regular character input
        if (key.length === 1) {
          this.state.insertChar(key);
          return true;
        }
        return false;
    }
  }

  /**
   * Handle Ctrl+key combinations
   */
  private handleCtrlKey(key: string): boolean {
    switch (key.toLowerCase()) {
      case 's':
        // Save
        if (this.options.onSave) {
          this.options.onSave();
        }
        return true;

      case 'z':
        // Undo
        this.state.undo();
        return true;

      case 'y':
        // Redo
        this.state.redo();
        return true;

      case 'c':
        // Copy
        if (this.state.hasSelection()) {
          const text = this.state.getSelectedText();
          Clipboard.copy(text);
        }
        return true;

      case 'x':
        // Cut
        if (this.state.hasSelection()) {
          const text = this.state.getSelectedText();
          Clipboard.copy(text);
          this.state.deleteSelection();
        }
        return true;

      case 'v':
        // Paste
        if (Clipboard.hasContent()) {
          // Delete selection if any
          if (this.state.hasSelection()) {
            this.state.deleteSelection();
          }
          // Insert clipboard content
          const text = Clipboard.paste();
          this.state.insertText(text);
        }
        return true;

      case 'a':
        // Select all
        this.state.setSelection(
          { line: 0, col: 0 },
          {
            line: this.state.getLineCount() - 1,
            col: this.state.getLine(this.state.getLineCount() - 1)?.length || 0
          }
        );
        return true;

      case 'f':
        // Find
        if (this.options.onFind) {
          this.options.onFind();
        }
        return true;

      case 'h':
        // Replace
        if (this.options.onReplace) {
          this.options.onReplace();
        }
        return true;

      case 'd':
        // Delete line
        const cursor = this.state.getCursor();
        this.state.deleteLine(cursor.line);
        return true;

      case 'k':
        // Delete to end of line
        const cursorPos = this.state.getCursor();
        const line = this.state.getLine(cursorPos.line);
        if (line) {
          const endPos = { line: cursorPos.line, col: line.length };
          if (cursorPos.col < line.length) {
            this.state.setSelection(cursorPos, endPos);
            this.state.deleteSelection();
          }
        }
        return true;

      case 'home':
        // Move to document start
        this.cursor.moveToDocumentStart();
        return true;

      case 'end':
        // Move to document end
        this.cursor.moveToDocumentEnd();
        return true;

      case 'left':
        // Move word left
        this.cursor.moveWordLeft();
        return true;

      case 'right':
        // Move word right
        this.cursor.moveWordRight();
        return true;

      case 'space':
        // Autocomplete
        if (this.options.onAutocomplete) {
          this.options.onAutocomplete();
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle Alt+key combinations
   */
  private handleAltKey(key: string): boolean {
    switch (key.toLowerCase()) {
      // TODO: implement Alt key bindings
      default:
        return false;
    }
  }

  /**
   * Get cursor manager
   */
  getCursorManager(): CursorManager {
    return this.cursor;
  }

  /**
   * Start selection at current cursor position
   */
  private startSelection(): void {
    if (!this.selectionAnchor) {
      const cursor = this.state.getCursor();
      this.selectionAnchor = { line: cursor.line, col: cursor.col };
    }
  }

  /**
   * Update selection from anchor to current cursor
   */
  private updateSelection(): void {
    if (this.selectionAnchor) {
      const cursor = this.state.getCursor();
      this.state.setSelection(this.selectionAnchor, cursor);
    }
  }

  /**
   * Clear selection anchor
   */
  private clearSelectionAnchor(): void {
    this.selectionAnchor = null;
    this.state.clearSelection();
  }
}
