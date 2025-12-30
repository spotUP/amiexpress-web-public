/**
 * Textbox widget - Single-line text input with horizontal scrolling
 */

import { Element } from '../core/element';
import type { TextboxOptions, KeyEvent } from '../core/types';

export class Textbox extends Element {
  value: string = '';
  private cursorPos: number = 0;
  private viewOffset: number = 0; // Horizontal scroll offset for long text
  private secret: boolean = false;
  private censor: boolean = false;

  constructor(options: TextboxOptions = {}) {
    super({
      focusable: true,
      clickable: true,
      keys: true,
      ...options,
      tags: true,  // Enable tag parsing for cursor display (forced, cannot be overridden)
    });

    this.value = options.value || '';
    this.secret = options.secret || false;
    this.censor = options.censor || false;
    this.cursorPos = this.value.length;

    // Update display
    this._updateContent();

    // Key handlers
    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }

    // Focus handlers
    this.on('focus', () => {
      this._updateContent();  // Show cursor when focused
      if (options.inputOnFocus !== false) {
        this.readInput();
      }
    });

    this.on('blur', () => {
      this._updateContent();  // Hide cursor when unfocused
    });

    // Click to focus
    this.on('click', () => {
      this.focus();
    });
  }

  private _onKeypress(ch: any, key: KeyEvent): void {
    if (!this.focused) return;

    // Ignore Tab - it's handled by screen for focus navigation
    if (key.name === 'tab') return;

    // Character input - only insert printable characters (ASCII 32-126)
    // This includes space (32) through tilde (126)
    if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
      const charCode = ch.charCodeAt(0);
      if (charCode >= 32 && charCode < 127) {
        this.insertChar(ch);
        return;
      }
    }

    // Special keys
    switch (key.name) {
      case 'backspace':
        this.deleteChar();
        break;

      case 'delete':
        this.deleteCharForward();
        break;

      case 'left':
        this.cursorLeft();
        break;

      case 'right':
        this.cursorRight();
        break;

      case 'home':
        this.cursorHome();
        break;

      case 'end':
        this.cursorEnd();
        break;

      case 'enter':
        this.submit();
        break;

      case 'escape':
        this.cancel();
        break;
    }
  }

  /**
   * Get the visible width for text (accounting for borders/padding)
   */
  private _getVisibleWidth(): number {
    // Use iwidth if available, otherwise calculate from options
    const width = this.iwidth;
    // Return at least 1 to avoid infinite loops, default to 80 if width not calculated yet
    return Math.max(1, width > 0 ? width : 80);
  }

  /**
   * Ensure cursor is visible by adjusting viewOffset
   */
  private _ensureCursorVisible(): void {
    const visibleWidth = this._getVisibleWidth();

    // If cursor is before viewOffset, scroll left
    if (this.cursorPos < this.viewOffset) {
      this.viewOffset = this.cursorPos;
    }

    // If cursor is beyond visible area, scroll right
    if (this.cursorPos >= this.viewOffset + visibleWidth) {
      this.viewOffset = this.cursorPos - visibleWidth + 1;
    }

    // Ensure viewOffset is never negative
    this.viewOffset = Math.max(0, this.viewOffset);
  }

  private _updateContent(): void {
    this._ensureCursorVisible();

    let text = this.value;

    if (this.secret || this.censor) {
      text = '*'.repeat(this.value.length);
    }

    // Get visible portion of text based on viewOffset
    const visibleWidth = this._getVisibleWidth();
    const visibleText = text.slice(this.viewOffset, this.viewOffset + visibleWidth);

    let display: string;

    if (this.focused) {
      // Show cursor as inverse video at cursor position
      const cursorPosInView = this.cursorPos - this.viewOffset;
      const beforeCursor = visibleText.slice(0, cursorPosInView);
      const atCursor = visibleText[cursorPosInView] || ' ';  // Space if at end
      const afterCursor = visibleText.slice(cursorPosInView + 1);
      display = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
    } else {
      display = visibleText;
    }

    this.setContent(display);

    // Re-render screen to show the updated content
    if (this.screen) {
      this.screen.render();
    }
  }

  insertChar(ch: string): void {
    this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
    this.cursorPos++;
    this._updateContent();
    this.emit('change', this.value);
  }

  deleteChar(): void {
    if (this.cursorPos > 0) {
      this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
      this.cursorPos--;
      this._updateContent();
      this.emit('change', this.value);
    }
  }

  deleteCharForward(): void {
    if (this.cursorPos < this.value.length) {
      this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
      this._updateContent();
      this.emit('change', this.value);
    }
  }

  cursorLeft(): void {
    if (this.cursorPos > 0) {
      this.cursorPos--;
      this._updateContent();
    }
  }

  cursorRight(): void {
    if (this.cursorPos < this.value.length) {
      this.cursorPos++;
      this._updateContent();
    }
  }

  cursorHome(): void {
    this.cursorPos = 0;
    this.viewOffset = 0;
    this._updateContent();
  }

  cursorEnd(): void {
    this.cursorPos = this.value.length;
    this._updateContent();
  }

  submit(): void {
    this.emit('submit', this.value);
  }

  cancel(): void {
    this.emit('cancel');
  }

  setValue(value: string): void {
    this.value = value;
    this.cursorPos = value.length;
    this.viewOffset = 0;
    this._updateContent();
    this.emit('change', this.value);
  }

  getValue(): string {
    return this.value;
  }

  clearValue(): void {
    // Explicitly reset all state to ensure visual clear
    this.value = '';
    this.cursorPos = 0;
    this.viewOffset = 0;
    this._updateContent();
    this.emit('change', this.value);
  }

  readInput(): void {
    // This would be implemented by the door to handle async input
    this.emit('readInput');
  }
}

// Alias
export class Input extends Textbox {}

/**
 * Textarea - Multi-line text input with vertical scrolling
 */
export class Textarea extends Element {
  value: string = '';
  private cursorPos: number = 0;  // Position in flat string
  private viewOffsetY: number = 0;  // Vertical scroll offset (line number)

  constructor(options: TextboxOptions = {}) {
    super({
      focusable: true,
      clickable: true,
      keys: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      ...options,
      // Add scrollbar by default (unless explicitly disabled)
      scrollbar: options.scrollbar === undefined || options.scrollbar ? {
        ch: '█',
        track: {
          ch: '│',
        },
        style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || options.style,
      } : undefined,
    });

    this.value = options.value || '';
    this.cursorPos = this.value.length;

    this._updateContent();

    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }

    this.on('focus', () => {
      this._updateContent();
    });

    this.on('blur', () => {
      this._updateContent();
    });

    this.on('click', () => {
      this.focus();
    });

    // Mouse wheel scrolling
    if (options.mouse !== false) {
      this.on('wheelup', () => {
        if (this.viewOffsetY > 0) {
          this.viewOffsetY--;
          this._updateContent();
        }
      });

      this.on('wheeldown', () => {
        const lines = this._getLines();
        const visibleHeight = this._getVisibleHeight();
        if (this.viewOffsetY < lines.length - visibleHeight) {
          this.viewOffsetY++;
          this._updateContent();
        }
      });
    }
  }

  private _onKeypress(ch: any, key: KeyEvent): void {
    if (!this.focused) return;

    // Ignore Tab - it's handled by screen for focus navigation
    if (key.name === 'tab') return;

    // Character input - printable characters
    if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
      const charCode = ch.charCodeAt(0);
      if (charCode >= 32 && charCode < 127) {
        this.insertChar(ch);
        return;
      }
    }

    switch (key.name) {
      case 'backspace':
        this.deleteChar();
        break;

      case 'delete':
        this.deleteCharForward();
        break;

      case 'left':
        this.cursorLeft();
        break;

      case 'right':
        this.cursorRight();
        break;

      case 'up':
        this.cursorUp();
        break;

      case 'down':
        this.cursorDown();
        break;

      case 'home':
        this.cursorHome();
        break;

      case 'end':
        this.cursorEnd();
        break;

      case 'enter':
        // Multi-line: Enter inserts newline
        this.insertChar('\n');
        break;

      case 'escape':
        this.cancel();
        break;

      case 'tab':
        // Shift+Tab submits, Tab inserts spaces
        if (key.shift) {
          this.submit();
        } else {
          this.insertChar('  ');  // Insert 2 spaces
        }
        break;
    }
  }

  private _getLines(): string[] {
    return this.value.split('\n');
  }

  private _getCursorLineCol(): { line: number; col: number } {
    const textBeforeCursor = this.value.slice(0, this.cursorPos);
    const linesBeforeCursor = textBeforeCursor.split('\n');
    const line = linesBeforeCursor.length - 1;
    const col = linesBeforeCursor[linesBeforeCursor.length - 1].length;
    return { line, col };
  }

  private _getVisibleHeight(): number {
    return Math.max(1, this.iheight > 0 ? this.iheight : 10);
  }

  private _ensureCursorVisible(): void {
    const { line } = this._getCursorLineCol();
    const visibleHeight = this._getVisibleHeight();

    if (line < this.viewOffsetY) {
      this.viewOffsetY = line;
    }

    if (line >= this.viewOffsetY + visibleHeight) {
      this.viewOffsetY = line - visibleHeight + 1;
    }

    this.viewOffsetY = Math.max(0, this.viewOffsetY);
  }

  private _updateContent(): void {
    this._ensureCursorVisible();

    const lines = this._getLines();
    const visibleHeight = this._getVisibleHeight();
    const visibleLines = lines.slice(this.viewOffsetY, this.viewOffsetY + visibleHeight);
    const { line: cursorLine, col: cursorCol } = this._getCursorLineCol();

    let display = '';
    for (let i = 0; i < visibleLines.length; i++) {
      const lineIndex = this.viewOffsetY + i;
      let lineText = visibleLines[i];

      if (this.focused && lineIndex === cursorLine) {
        // Show cursor on this line
        const beforeCursor = lineText.slice(0, cursorCol);
        const atCursor = lineText[cursorCol] || ' ';
        const afterCursor = lineText.slice(cursorCol + 1);
        lineText = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
      }

      display += lineText;
      if (i < visibleLines.length - 1) {
        display += '\n';
      }
    }

    this.setContent(display);
    if (this.screen) {
      this.screen.render();
    }
  }

  insertChar(ch: string): void {
    this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
    this.cursorPos += ch.length;
    this._updateContent();
    this.emit('change', this.value);
  }

  deleteChar(): void {
    if (this.cursorPos > 0) {
      this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
      this.cursorPos--;
      this._updateContent();
      this.emit('change', this.value);
    }
  }

  deleteCharForward(): void {
    if (this.cursorPos < this.value.length) {
      this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
      this._updateContent();
      this.emit('change', this.value);
    }
  }

  cursorLeft(): void {
    if (this.cursorPos > 0) {
      this.cursorPos--;
      this._updateContent();
    }
  }

  cursorRight(): void {
    if (this.cursorPos < this.value.length) {
      this.cursorPos++;
      this._updateContent();
    }
  }

  cursorUp(): void {
    const { line, col } = this._getCursorLineCol();
    if (line > 0) {
      const lines = this._getLines();
      const prevLineLength = lines[line - 1].length;
      const newCol = Math.min(col, prevLineLength);
      // Calculate new position: sum of all previous lines + newlines + newCol
      let newPos = 0;
      for (let i = 0; i < line - 1; i++) {
        newPos += lines[i].length + 1;  // +1 for newline
      }
      newPos += newCol;
      this.cursorPos = newPos;
      this._updateContent();
    }
  }

  cursorDown(): void {
    const { line, col } = this._getCursorLineCol();
    const lines = this._getLines();
    if (line < lines.length - 1) {
      const nextLineLength = lines[line + 1].length;
      const newCol = Math.min(col, nextLineLength);
      // Calculate new position
      let newPos = 0;
      for (let i = 0; i <= line; i++) {
        newPos += lines[i].length + 1;  // +1 for newline
      }
      newPos += newCol;
      this.cursorPos = newPos;
      this._updateContent();
    }
  }

  cursorHome(): void {
    const { line } = this._getCursorLineCol();
    const lines = this._getLines();
    let newPos = 0;
    for (let i = 0; i < line; i++) {
      newPos += lines[i].length + 1;
    }
    this.cursorPos = newPos;
    this._updateContent();
  }

  cursorEnd(): void {
    const { line } = this._getCursorLineCol();
    const lines = this._getLines();
    let newPos = 0;
    for (let i = 0; i <= line; i++) {
      newPos += lines[i].length;
      if (i < line) newPos++;  // Add newline char
    }
    this.cursorPos = newPos;
    this._updateContent();
  }

  submit(): void {
    this.emit('submit', this.value);
  }

  cancel(): void {
    this.emit('cancel');
  }

  setValue(value: string): void {
    this.value = value;
    this.cursorPos = value.length;
    this.viewOffsetY = 0;
    this._updateContent();
    this.emit('change', this.value);
  }

  getValue(): string {
    return this.value;
  }

  clearValue(): void {
    this.setValue('');
  }

  readInput(): void {
    this.emit('readInput');
  }
}
