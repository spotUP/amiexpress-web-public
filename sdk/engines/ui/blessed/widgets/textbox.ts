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
      tags: true,  // Enable tag parsing for cursor display
      ...options,
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
    this.setValue('');
  }

  readInput(): void {
    // This would be implemented by the door to handle async input
    this.emit('readInput');
  }
}

// Alias
export class Input extends Textbox {}
export class Textarea extends Textbox {
  // TODO: Multi-line support
}
