/**
 * Cursor management
 * Handles cursor movement, positioning, and visual rendering
 */

import type { Position } from '../types';
import { ANSIUtils } from './ansi-utils';
import type { EditorState } from './editor-state';

/**
 * Cursor movement operations
 */
export class CursorManager {
  constructor(private state: EditorState) {}

  /**
   * Move cursor up
   */
  moveUp(lines: number = 1): void {
    const cursor = this.state.getCursor();
    const newLine = Math.max(0, cursor.line - lines);
    this.state.setCursor({ line: newLine, col: cursor.col });
  }

  /**
   * Move cursor down
   */
  moveDown(lines: number = 1): void {
    const cursor = this.state.getCursor();
    const lineCount = this.state.getLineCount();
    const newLine = Math.min(lineCount - 1, cursor.line + lines);
    this.state.setCursor({ line: newLine, col: cursor.col });
  }

  /**
   * Move cursor left
   */
  moveLeft(chars: number = 1): void {
    const cursor = this.state.getCursor();
    const newCol = Math.max(0, cursor.col - chars);
    this.state.setCursor({ line: cursor.line, col: newCol });
  }

  /**
   * Move cursor right
   */
  moveRight(chars: number = 1): void {
    const cursor = this.state.getCursor();
    const currentLine = this.state.getLine(cursor.line) || '';
    const maxCol = ANSIUtils.visualLength(currentLine);
    const newCol = Math.min(maxCol, cursor.col + chars);
    this.state.setCursor({ line: cursor.line, col: newCol });
  }

  /**
   * Move to start of line (home)
   */
  moveToLineStart(): void {
    const cursor = this.state.getCursor();
    this.state.setCursor({ line: cursor.line, col: 0 });
  }

  /**
   * Move to end of line (end)
   */
  moveToLineEnd(): void {
    const cursor = this.state.getCursor();
    const currentLine = this.state.getLine(cursor.line) || '';
    const maxCol = ANSIUtils.visualLength(currentLine);
    this.state.setCursor({ line: cursor.line, col: maxCol });
  }

  /**
   * Move to start of document
   */
  moveToDocumentStart(): void {
    this.state.setCursor({ line: 0, col: 0 });
  }

  /**
   * Move to end of document
   */
  moveToDocumentEnd(): void {
    const lineCount = this.state.getLineCount();
    const lastLine = this.state.getLine(lineCount - 1) || '';
    const maxCol = ANSIUtils.visualLength(lastLine);
    this.state.setCursor({ line: lineCount - 1, col: maxCol });
  }

  /**
   * Move to first non-whitespace character of line
   */
  moveToFirstNonWhitespace(): void {
    const cursor = this.state.getCursor();
    const currentLine = this.state.getLine(cursor.line) || '';
    const stripped = ANSIUtils.stripANSI(currentLine);

    const match = stripped.match(/\S/);
    const col = match ? match.index! : 0;

    this.state.setCursor({ line: cursor.line, col });
  }

  /**
   * Smart home - toggle between line start and first non-whitespace
   */
  smartHome(): void {
    const cursor = this.state.getCursor();

    if (cursor.col === 0) {
      // Already at start, move to first non-whitespace
      this.moveToFirstNonWhitespace();
    } else {
      // Move to start
      this.moveToLineStart();
    }
  }

  /**
   * Move by word (left)
   */
  moveWordLeft(): void {
    const cursor = this.state.getCursor();
    const currentLine = this.state.getLine(cursor.line) || '';
    const stripped = ANSIUtils.stripANSI(currentLine);

    if (cursor.col === 0) {
      // Move to previous line
      if (cursor.line > 0) {
        this.moveUp();
        this.moveToLineEnd();
      }
      return;
    }

    // Find previous word boundary
    let col = cursor.col - 1;

    // Skip whitespace
    while (col > 0 && /\s/.test(stripped[col])) {
      col--;
    }

    // Skip word characters
    while (col > 0 && /\S/.test(stripped[col - 1])) {
      col--;
    }

    this.state.setCursor({ line: cursor.line, col });
  }

  /**
   * Move by word (right)
   */
  moveWordRight(): void {
    const cursor = this.state.getCursor();
    const currentLine = this.state.getLine(cursor.line) || '';
    const stripped = ANSIUtils.stripANSI(currentLine);
    const length = stripped.length;

    if (cursor.col >= length) {
      // Move to next line
      if (cursor.line < this.state.getLineCount() - 1) {
        this.moveDown();
        this.moveToLineStart();
      }
      return;
    }

    // Find next word boundary
    let col = cursor.col;

    // Skip word characters
    while (col < length && /\S/.test(stripped[col])) {
      col++;
    }

    // Skip whitespace
    while (col < length && /\s/.test(stripped[col])) {
      col++;
    }

    this.state.setCursor({ line: cursor.line, col });
  }

  /**
   * Page up
   */
  pageUp(pageSize: number = 20): void {
    this.moveUp(pageSize);
  }

  /**
   * Page down
   */
  pageDown(pageSize: number = 20): void {
    this.moveDown(pageSize);
  }

  /**
   * Go to specific line
   */
  goToLine(lineNum: number): void {
    const clampedLine = Math.max(0, Math.min(lineNum, this.state.getLineCount() - 1));
    this.state.setCursor({ line: clampedLine, col: 0 });
  }

  /**
   * Get cursor screen position for rendering
   * Returns the visual (screen) position accounting for ANSI codes
   */
  getScreenPosition(): Position {
    const cursor = this.state.getCursor();
    return {
      line: cursor.line,
      col: cursor.col,  // This is already visual position
    };
  }

  /**
   * Set cursor from screen position
   */
  setScreenPosition(position: Position): void {
    this.state.setCursor(position);
  }

  /**
   * Ensure cursor is within valid bounds
   */
  normalizeCursor(): void {
    const cursor = this.state.getCursor();
    const lineCount = this.state.getLineCount();

    // Clamp line number
    const line = Math.max(0, Math.min(cursor.line, lineCount - 1));

    // Clamp column number
    const currentLine = this.state.getLine(line) || '';
    const maxCol = ANSIUtils.visualLength(currentLine);
    const col = Math.max(0, Math.min(cursor.col, maxCol));

    this.state.setCursor({ line, col });
  }

  /**
   * Get the actual character position in the string
   * Accounting for ANSI codes
   */
  getActualPosition(): { line: number; pos: number } {
    const cursor = this.state.getCursor();
    const currentLine = this.state.getLine(cursor.line) || '';
    const actualPos = ANSIUtils.getActualPosition(currentLine, cursor.col);

    return {
      line: cursor.line,
      pos: actualPos,
    };
  }
}
