/**
 * Editor state management
 * Maintains document content, cursor position, and modification state
 */

import type { Position, Selection, EditorState as IEditorState, EditorOperation, Cell, DrawingTool, BrushMode, EditorMode } from '../types';
import { ANSIUtils } from './ansi-utils';
import * as Canvas from './canvas';

/**
 * Editor state manager
 */
export class EditorState {
  private state: IEditorState;
  private maxLines: number;
  private maxLineLength: number;

  constructor(
    initialContent: string = '',
    maxLines: number = 10000,
    maxLineLength: number = 1000
  ) {
    this.maxLines = maxLines;
    this.maxLineLength = maxLineLength;

    // Initialize state
    this.state = {
      lines: initialContent ? initialContent.split('\n') : [''],
      cursor: { line: 0, col: 0 },
      selection: null,
      scrollTop: 0,
      scrollLeft: 0,
      insertMode: true,
      modified: false,
      undoStack: [],
      redoStack: [],
    };
  }

  /**
   * Get current state (immutable)
   */
  getState(): Readonly<IEditorState> {
    return this.state;
  }

  /**
   * Get all lines
   */
  getLines(): readonly string[] {
    return this.state.lines;
  }

  /**
   * Get specific line
   */
  getLine(lineNum: number): string | undefined {
    return this.state.lines[lineNum];
  }

  /**
   * Get line count
   */
  getLineCount(): number {
    return this.state.lines.length;
  }

  /**
   * Get full document content
   */
  getContent(): string {
    return this.state.lines.join('\n');
  }

  /**
   * Set content (replaces all lines)
   */
  setContent(content: string): void {
    const lines = content ? content.split('\n') : [''];

    // Enforce max lines
    if (lines.length > this.maxLines) {
      lines.length = this.maxLines;
    }

    // Enforce max line length
    for (let i = 0; i < lines.length; i++) {
      if (ANSIUtils.visualLength(lines[i]) > this.maxLineLength) {
        lines[i] = lines[i].substring(0, this.maxLineLength);
      }
    }

    this.state.lines = lines;
    this.state.modified = true;
    this.state.cursor = { line: 0, col: 0 };
    this.state.selection = null;
  }

  /**
   * Get cursor position
   */
  getCursor(): Readonly<Position> {
    return this.state.cursor;
  }

  /**
   * Set cursor position
   */
  setCursor(position: Position): void {
    // Clamp to valid range
    const line = Math.max(0, Math.min(position.line, this.state.lines.length - 1));
    const maxCol = ANSIUtils.visualLength(this.state.lines[line] || '');
    const col = Math.max(0, Math.min(position.col, maxCol));

    this.state.cursor = { line, col };
  }

  /**
   * Move cursor by delta
   */
  moveCursor(deltaLine: number, deltaCol: number): void {
    this.setCursor({
      line: this.state.cursor.line + deltaLine,
      col: this.state.cursor.col + deltaCol,
    });
  }

  /**
   * Get selection
   */
  getSelection(): Selection | null {
    return this.state.selection;
  }

  /**
   * Check if there's an active selection
   */
  hasSelection(): boolean {
    return this.state.selection !== null;
  }

  /**
   * Get selected text
   */
  getSelectedText(): string {
    if (!this.state.selection) {
      return '';
    }
    return this.state.selection.text;
  }

  /**
   * Set selection
   */
  setSelection(start: Position, end: Position): void {
    // Normalize selection (ensure start is before end)
    const { startPos, endPos } = this.normalizeSelection(start, end);

    // Extract selected text
    const text = this.getTextRange(startPos, endPos);

    this.state.selection = {
      start: startPos,
      end: endPos,
      text,
    };
  }

  /**
   * Extend selection to current cursor position
   */
  extendSelection(anchor: Position): void {
    this.setSelection(anchor, this.state.cursor);
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.state.selection = null;
  }

  /**
   * Delete selected text
   */
  deleteSelection(): boolean {
    if (!this.state.selection) {
      return false;
    }

    const { start, end, text } = this.state.selection;

    // Record operation for undo
    this.pushOperation({
      type: 'delete',
      position: start,
      content: text,
      timestamp: Date.now(),
    });

    // Delete text
    if (start.line === end.line) {
      // Single line selection
      const line = this.state.lines[start.line];
      const actualStart = ANSIUtils.getActualPosition(line, start.col);
      const actualEnd = ANSIUtils.getActualPosition(line, end.col);

      this.state.lines[start.line] =
        line.substring(0, actualStart) +
        line.substring(actualEnd);
    } else {
      // Multiline selection
      const firstLine = this.state.lines[start.line];
      const lastLine = this.state.lines[end.line];
      const actualStart = ANSIUtils.getActualPosition(firstLine, start.col);
      const actualEnd = ANSIUtils.getActualPosition(lastLine, end.col);

      // Merge first and last line
      this.state.lines[start.line] =
        firstLine.substring(0, actualStart) +
        lastLine.substring(actualEnd);

      // Remove lines in between
      this.state.lines.splice(start.line + 1, end.line - start.line);
    }

    // Move cursor to selection start
    this.state.cursor = { ...start };
    this.clearSelection();
    this.state.modified = true;
    return true;
  }

  /**
   * Normalize selection (ensure start is before end)
   */
  private normalizeSelection(start: Position, end: Position): { startPos: Position; endPos: Position } {
    if (start.line < end.line || (start.line === end.line && start.col <= end.col)) {
      return { startPos: start, endPos: end };
    } else {
      return { startPos: end, endPos: start };
    }
  }

  /**
   * Get text range between two positions
   */
  private getTextRange(start: Position, end: Position): string {
    if (start.line === end.line) {
      // Single line
      const line = this.state.lines[start.line];
      const actualStart = ANSIUtils.getActualPosition(line, start.col);
      const actualEnd = ANSIUtils.getActualPosition(line, end.col);
      return line.substring(actualStart, actualEnd);
    } else {
      // Multiline
      const lines: string[] = [];

      // First line
      const firstLine = this.state.lines[start.line];
      const actualStart = ANSIUtils.getActualPosition(firstLine, start.col);
      lines.push(firstLine.substring(actualStart));

      // Middle lines
      for (let i = start.line + 1; i < end.line; i++) {
        lines.push(this.state.lines[i]);
      }

      // Last line
      const lastLine = this.state.lines[end.line];
      const actualEnd = ANSIUtils.getActualPosition(lastLine, end.col);
      lines.push(lastLine.substring(0, actualEnd));

      return lines.join('\n');
    }
  }

  /**
   * Get scroll position
   */
  getScroll(): { top: number; left: number } {
    return {
      top: this.state.scrollTop,
      left: this.state.scrollLeft,
    };
  }

  /**
   * Set scroll position
   */
  setScroll(top: number, left: number): void {
    this.state.scrollTop = Math.max(0, top);
    this.state.scrollLeft = Math.max(0, left);
  }

  /**
   * Get insert mode
   */
  getInsertMode(): boolean {
    return this.state.insertMode;
  }

  /**
   * Toggle insert mode
   */
  toggleInsertMode(): void {
    this.state.insertMode = !this.state.insertMode;
  }

  /**
   * Set insert mode
   */
  setInsertMode(insertMode: boolean): void {
    this.state.insertMode = insertMode;
  }

  /**
   * Check if document is modified
   */
  isModified(): boolean {
    return this.state.modified;
  }

  /**
   * Set modified flag
   */
  setModified(modified: boolean): void {
    this.state.modified = modified;
  }

  /**
   * Insert character at cursor
   */
  insertChar(char: string): void {
    const { line, col } = this.state.cursor;
    const currentLine = this.state.lines[line];

    // Get actual position accounting for ANSI codes
    const actualPos = ANSIUtils.getActualPosition(currentLine, col);

    if (this.state.insertMode) {
      // Insert mode: insert character
      this.state.lines[line] =
        currentLine.substring(0, actualPos) +
        char +
        currentLine.substring(actualPos);
    } else {
      // Overwrite mode: replace character
      this.state.lines[line] =
        currentLine.substring(0, actualPos) +
        char +
        currentLine.substring(actualPos + 1);
    }

    // Move cursor forward
    this.state.cursor.col++;
    this.state.modified = true;
  }

  /**
   * Insert text at cursor
   */
  insertText(text: string): void {
    const { line, col } = this.state.cursor;
    const currentLine = this.state.lines[line];

    // Get actual position accounting for ANSI codes
    const actualPos = ANSIUtils.getActualPosition(currentLine, col);

    this.state.lines[line] =
      currentLine.substring(0, actualPos) +
      text +
      currentLine.substring(actualPos);

    // Move cursor forward by visual length
    this.state.cursor.col += ANSIUtils.visualLength(text);
    this.state.modified = true;
  }

  /**
   * Delete character before cursor (backspace)
   */
  deleteCharBefore(): boolean {
    const { line, col } = this.state.cursor;

    if (col > 0) {
      // Delete character in current line
      const currentLine = this.state.lines[line];
      const actualPos = ANSIUtils.getActualPosition(currentLine, col);
      const prevActualPos = ANSIUtils.getActualPosition(currentLine, col - 1);

      this.state.lines[line] =
        currentLine.substring(0, prevActualPos) +
        currentLine.substring(actualPos);

      this.state.cursor.col--;
      this.state.modified = true;
      return true;
    } else if (line > 0) {
      // Merge with previous line
      const prevLine = this.state.lines[line - 1];
      const prevLineLength = ANSIUtils.visualLength(prevLine);

      this.state.lines[line - 1] = prevLine + this.state.lines[line];
      this.state.lines.splice(line, 1);

      this.state.cursor.line--;
      this.state.cursor.col = prevLineLength;
      this.state.modified = true;
      return true;
    }

    return false;
  }

  /**
   * Delete character after cursor (delete key)
   */
  deleteCharAfter(): boolean {
    const { line, col } = this.state.cursor;
    const currentLine = this.state.lines[line];
    const lineLength = ANSIUtils.visualLength(currentLine);

    if (col < lineLength) {
      // Delete character in current line
      const actualPos = ANSIUtils.getActualPosition(currentLine, col);
      const nextActualPos = ANSIUtils.getActualPosition(currentLine, col + 1);

      this.state.lines[line] =
        currentLine.substring(0, actualPos) +
        currentLine.substring(nextActualPos);

      this.state.modified = true;
      return true;
    } else if (line < this.state.lines.length - 1) {
      // Merge with next line
      this.state.lines[line] = currentLine + this.state.lines[line + 1];
      this.state.lines.splice(line + 1, 1);

      this.state.modified = true;
      return true;
    }

    return false;
  }

  /**
   * Insert new line at cursor
   */
  insertNewLine(): void {
    const { line, col } = this.state.cursor;
    const currentLine = this.state.lines[line];
    const actualPos = ANSIUtils.getActualPosition(currentLine, col);

    // Split line at cursor
    const beforeCursor = currentLine.substring(0, actualPos);
    const afterCursor = currentLine.substring(actualPos);

    this.state.lines[line] = beforeCursor;
    this.state.lines.splice(line + 1, 0, afterCursor);

    // Move cursor to start of new line
    this.state.cursor.line++;
    this.state.cursor.col = 0;
    this.state.modified = true;
  }

  /**
   * Delete entire line
   */
  deleteLine(lineNum: number): void {
    if (lineNum >= 0 && lineNum < this.state.lines.length) {
      this.state.lines.splice(lineNum, 1);

      // Ensure at least one empty line
      if (this.state.lines.length === 0) {
        this.state.lines = [''];
      }

      // Adjust cursor if needed
      if (this.state.cursor.line >= this.state.lines.length) {
        this.state.cursor.line = this.state.lines.length - 1;
      }

      this.state.modified = true;
    }
  }

  /**
   * Duplicate current line
   */
  duplicateLine(lineNum: number): void {
    if (lineNum >= 0 && lineNum < this.state.lines.length) {
      const lineCopy = this.state.lines[lineNum];
      this.state.lines.splice(lineNum + 1, 0, lineCopy);
      this.state.modified = true;
    }
  }

  /**
   * Get undo stack size
   */
  getUndoStackSize(): number {
    return this.state.undoStack.length;
  }

  /**
   * Get redo stack size
   */
  getRedoStackSize(): number {
    return this.state.redoStack.length;
  }

  /**
   * Can undo?
   */
  canUndo(): boolean {
    return this.state.undoStack.length > 0;
  }

  /**
   * Can redo?
   */
  canRedo(): boolean {
    return this.state.redoStack.length > 0;
  }

  /**
   * Add operation to undo stack
   */
  pushOperation(operation: EditorOperation): void {
    this.state.undoStack.push(operation);

    // Limit undo stack size to 100 operations
    if (this.state.undoStack.length > 100) {
      this.state.undoStack.shift();
    }

    // Clear redo stack on new operation
    this.state.redoStack = [];
  }

  /**
   * Pop operation from undo stack
   */
  popUndo(): EditorOperation | undefined {
    return this.state.undoStack.pop();
  }

  /**
   * Pop operation from redo stack
   */
  popRedo(): EditorOperation | undefined {
    return this.state.redoStack.pop();
  }

  /**
   * Push operation to redo stack
   */
  pushRedo(operation: EditorOperation): void {
    this.state.redoStack.push(operation);
  }

  /**
   * Undo last operation
   */
  undo(): boolean {
    const operation = this.popUndo();
    if (!operation) {
      return false;
    }

    // Store inverse operation for redo
    const inverseOperation: EditorOperation = {
      type: operation.type,
      position: operation.position,
      content: operation.previousContent || '',
      previousContent: operation.content,
      timestamp: Date.now(),
    };

    // Apply inverse operation
    switch (operation.type) {
      case 'insert':
        // Undo insert by deleting
        this.deleteTextAt(operation.position, operation.content.length, false);
        break;

      case 'delete':
        // Undo delete by inserting
        this.insertTextAt(operation.position, operation.content, false);
        break;

      case 'replace':
        // Undo replace by replacing back
        if (operation.previousContent) {
          this.replaceTextAt(operation.position, operation.content.length, operation.previousContent, false);
        }
        break;
    }

    // Push to redo stack
    this.pushRedo(operation);
    this.state.modified = true;
    return true;
  }

  /**
   * Redo last undone operation
   */
  redo(): boolean {
    const operation = this.popRedo();
    if (!operation) {
      return false;
    }

    // Apply operation
    switch (operation.type) {
      case 'insert':
        this.insertTextAt(operation.position, operation.content, false);
        break;

      case 'delete':
        this.deleteTextAt(operation.position, operation.content.length, false);
        break;

      case 'replace':
        this.replaceTextAt(operation.position, operation.previousContent?.length || 0, operation.content, false);
        break;
    }

    // Push back to undo stack
    this.pushOperation(operation);
    this.state.modified = true;
    return true;
  }

  /**
   * Insert text at specific position (internal use for undo/redo)
   */
  private insertTextAt(pos: Position, text: string, recordOperation: boolean = true): void {
    const { line, col } = pos;
    if (line < 0 || line >= this.state.lines.length) {
      return;
    }

    const currentLine = this.state.lines[line];
    const actualPos = ANSIUtils.getActualPosition(currentLine, col);

    // Handle multiline text
    const textLines = text.split('\n');
    if (textLines.length === 1) {
      // Single line insert
      this.state.lines[line] =
        currentLine.substring(0, actualPos) +
        text +
        currentLine.substring(actualPos);
    } else {
      // Multiline insert
      const firstPart = currentLine.substring(0, actualPos) + textLines[0];
      const lastPart = textLines[textLines.length - 1] + currentLine.substring(actualPos);
      const middleParts = textLines.slice(1, -1);

      this.state.lines.splice(line, 1, firstPart, ...middleParts, lastPart);
    }

    // Record operation
    if (recordOperation) {
      this.pushOperation({
        type: 'insert',
        position: pos,
        content: text,
        timestamp: Date.now(),
      });
    }

    this.state.modified = true;
  }

  /**
   * Delete text at specific position (internal use for undo/redo)
   */
  private deleteTextAt(pos: Position, length: number, recordOperation: boolean = true): void {
    const { line, col } = pos;
    if (line < 0 || line >= this.state.lines.length) {
      return;
    }

    const currentLine = this.state.lines[line];
    const actualPos = ANSIUtils.getActualPosition(currentLine, col);

    // Get text being deleted for undo
    const deletedText = currentLine.substring(actualPos, actualPos + length);

    // Delete text
    this.state.lines[line] =
      currentLine.substring(0, actualPos) +
      currentLine.substring(actualPos + length);

    // Record operation
    if (recordOperation) {
      this.pushOperation({
        type: 'delete',
        position: pos,
        content: deletedText,
        timestamp: Date.now(),
      });
    }

    this.state.modified = true;
  }

  /**
   * Replace text at specific position (internal use for undo/redo)
   */
  private replaceTextAt(pos: Position, oldLength: number, newText: string, recordOperation: boolean = true): void {
    const { line, col } = pos;
    if (line < 0 || line >= this.state.lines.length) {
      return;
    }

    const currentLine = this.state.lines[line];
    const actualPos = ANSIUtils.getActualPosition(currentLine, col);

    // Get old text for undo
    const oldText = currentLine.substring(actualPos, actualPos + oldLength);

    // Replace text
    this.state.lines[line] =
      currentLine.substring(0, actualPos) +
      newText +
      currentLine.substring(actualPos + oldLength);

    // Record operation
    if (recordOperation) {
      this.pushOperation({
        type: 'replace',
        position: pos,
        content: newText,
        previousContent: oldText,
        timestamp: Date.now(),
      });
    }

    this.state.modified = true;
  }

  // ===== CANVAS MODE METHODS =====

  /**
   * Get editor mode (text or draw)
   */
  getMode(): EditorMode {
    return this.state.mode || 'text';
  }

  /**
   * Set editor mode
   */
  setMode(mode: EditorMode): void {
    if (mode === 'draw' && !this.state.canvas) {
      // Initialize canvas when switching to draw mode
      this.initializeCanvas(80, 25);
    }
    this.state.mode = mode;
  }

  /**
   * Initialize canvas for drawing mode
   */
  initializeCanvas(width: number, height: number): void {
    this.state.canvas = Canvas.createCanvas(width, height);
    this.state.canvasWidth = width;
    this.state.canvasHeight = height;
    this.state.currentTool = 'draw';
    this.state.brushMode = 'half-block';
    this.state.currentFg = 7;  // White
    this.state.currentBg = 0;  // Black
    this.state.currentChar = '█';
    this.state.drawingStartPoint = null;
    this.state.drawingEndPoint = null;
    this.state.drawingPreview = null;
    this.state.iceColorsEnabled = false;
  }

  /**
   * Get canvas
   */
  getCanvas(): Cell[][] | undefined {
    return this.state.canvas;
  }

  /**
   * Set canvas
   */
  setCanvas(canvas: Cell[][]): void {
    this.state.canvas = canvas;
    this.state.canvasWidth = canvas[0]?.length || 0;
    this.state.canvasHeight = canvas.length;
    this.state.modified = true;
  }

  /**
   * Get canvas dimensions
   */
  getCanvasDimensions(): { width: number; height: number } {
    return {
      width: this.state.canvasWidth || 0,
      height: this.state.canvasHeight || 0
    };
  }

  /**
   * Clear canvas
   */
  clearCanvas(): void {
    if (this.state.canvas) {
      Canvas.clearCanvas(this.state.canvas);
      this.state.modified = true;
    }
  }

  /**
   * Get current drawing tool
   */
  getCurrentTool(): DrawingTool {
    return this.state.currentTool || 'draw';
  }

  /**
   * Set current drawing tool
   */
  setCurrentTool(tool: DrawingTool): void {
    this.state.currentTool = tool;
  }

  /**
   * Get brush mode
   */
  getBrushMode(): BrushMode {
    return this.state.brushMode || 'half-block';
  }

  /**
   * Set brush mode
   */
  setBrushMode(mode: BrushMode): void {
    this.state.brushMode = mode;
  }

  /**
   * Get current foreground color
   */
  getCurrentFg(): number {
    return this.state.currentFg || 7;
  }

  /**
   * Set current foreground color
   */
  setCurrentFg(fg: number): void {
    this.state.currentFg = Math.max(0, Math.min(15, fg));
  }

  /**
   * Get current background color
   */
  getCurrentBg(): number {
    return this.state.currentBg || 0;
  }

  /**
   * Set current background color
   */
  setCurrentBg(bg: number): void {
    this.state.currentBg = Math.max(0, Math.min(15, bg));
  }

  /**
   * Get current character
   */
  getCurrentChar(): string {
    return this.state.currentChar || '█';
  }

  /**
   * Set current character
   */
  setCurrentChar(char: string): void {
    this.state.currentChar = char;
  }

  /**
   * Get current drawing cell (based on current fg/bg/char)
   */
  getCurrentCell(): Cell {
    return {
      char: this.getCurrentChar(),
      fg: this.getCurrentFg(),
      bg: this.getCurrentBg(),
      blink: false
    };
  }

  /**
   * Get drawing start point (for shape tools)
   */
  getDrawingStartPoint(): Position | null {
    return this.state.drawingStartPoint || null;
  }

  /**
   * Set drawing start point
   */
  setDrawingStartPoint(pos: Position | null): void {
    this.state.drawingStartPoint = pos;
  }

  /**
   * Get drawing end point (for shape tools)
   */
  getDrawingEndPoint(): Position | null {
    return this.state.drawingEndPoint || null;
  }

  /**
   * Set drawing end point
   */
  setDrawingEndPoint(pos: Position | null): void {
    this.state.drawingEndPoint = pos;
  }

  /**
   * Get drawing preview canvas
   */
  getDrawingPreview(): Cell[][] | null {
    return this.state.drawingPreview || null;
  }

  /**
   * Set drawing preview canvas
   */
  setDrawingPreview(preview: Cell[][] | null): void {
    this.state.drawingPreview = preview;
  }

  /**
   * Check if iCE colors are enabled
   */
  isIceColorsEnabled(): boolean {
    return this.state.iceColorsEnabled || false;
  }

  /**
   * Toggle iCE colors
   */
  toggleIceColors(): void {
    this.state.iceColorsEnabled = !this.state.iceColorsEnabled;
  }

  /**
   * Set iCE colors
   */
  setIceColors(enabled: boolean): void {
    this.state.iceColorsEnabled = enabled;
  }

  /**
   * Set canvas cell at position
   */
  setCanvasCell(x: number, y: number, cell: Cell): void {
    if (this.state.canvas) {
      Canvas.setCell(this.state.canvas, x, y, cell);
      this.state.modified = true;
    }
  }

  /**
   * Get canvas cell at position
   */
  getCanvasCell(x: number, y: number): Cell | null {
    if (this.state.canvas) {
      return Canvas.getCell(this.state.canvas, x, y);
    }
    return null;
  }

  /**
   * Convert canvas to ANSI string
   */
  canvasToANSI(): string {
    if (this.state.canvas) {
      return Canvas.canvasToANSI(this.state.canvas, this.isIceColorsEnabled());
    }
    return '';
  }

  /**
   * Load content into canvas (for file loading)
   */
  loadCanvasFromANSI(content: string, width: number, height: number): void {
    // Create new canvas
    const canvas = Canvas.createCanvas(width, height);

    // Parse ANSI content and populate canvas
    // This is a simplified parser - full implementation would parse ANSI codes
    const lines = content.split('\n');
    let currentFg = 7;
    let currentBg = 0;

    for (let y = 0; y < Math.min(lines.length, height); y++) {
      let x = 0;
      const line = lines[y];

      for (let i = 0; i < line.length && x < width; i++) {
        const char = line[i];

        // Skip ANSI escape sequences (simplified - full parser needed)
        if (char === '\x1b') {
          // Parse escape sequence
          const match = line.substring(i).match(/^\x1b\[([0-9;]+)m/);
          if (match) {
            const codes = match[1].split(';').map(Number);
            for (const code of codes) {
              if (code >= 30 && code <= 37) {
                currentFg = code - 30;
              } else if (code >= 90 && code <= 97) {
                currentFg = code - 90 + 8;
              } else if (code >= 40 && code <= 47) {
                currentBg = code - 40;
              } else if (code >= 100 && code <= 107) {
                currentBg = code - 100 + 8;
              }
            }
            i += match[0].length - 1;
            continue;
          }
        }

        // Set cell
        Canvas.setCell(canvas, x, y, {
          char,
          fg: currentFg,
          bg: currentBg,
          blink: false
        });
        x++;
      }
    }

    this.setCanvas(canvas);
  }

  /**
   * Resize canvas
   */
  resizeCanvas(newWidth: number, newHeight: number): void {
    if (this.state.canvas) {
      this.state.canvas = Canvas.resizeCanvas(this.state.canvas, newWidth, newHeight);
      this.state.canvasWidth = newWidth;
      this.state.canvasHeight = newHeight;
      this.state.modified = true;
    }
  }

  /**
   * Clone current canvas (for undo)
   */
  cloneCanvas(): Cell[][] | undefined {
    if (this.state.canvas) {
      return Canvas.cloneCanvas(this.state.canvas);
    }
    return undefined;
  }
}
