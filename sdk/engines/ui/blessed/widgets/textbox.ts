/**
 * Textbox widget - Single-line text input
 */

import { Element } from '../core/element';
import type { TextboxOptions, KeyEvent } from '../core/types';

export class Textbox extends Element {
  value: string = '';
  private cursorPos: number = 0;
  private secret: boolean = false;
  private censor: boolean = false;

  constructor(options: TextboxOptions = {}) {
    super({
      focusable: true,
      clickable: true,
      keys: true,
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
      if (options.inputOnFocus !== false) {
        this.readInput();
      }
    });
  }

  private _onKeypress(ch: any, key: KeyEvent): void {
    if (!this.focused) return;

    // Character input
    if (ch && !key.ctrl && !key.meta && ch.length === 1) {
      this.insertChar(ch);
      return;
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

  private _updateContent(): void {
    let display = this.value;

    if (this.secret || this.censor) {
      display = '*'.repeat(this.value.length);
    }

    this.setContent(display);
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
    }
  }

  cursorRight(): void {
    if (this.cursorPos < this.value.length) {
      this.cursorPos++;
    }
  }

  cursorHome(): void {
    this.cursorPos = 0;
  }

  cursorEnd(): void {
    this.cursorPos = this.value.length;
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
