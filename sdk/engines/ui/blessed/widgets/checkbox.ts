/**
 * Checkbox - Boolean toggle widget for forms
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface CheckboxOptions extends ElementOptions {
  checked?: boolean;
  text?: string;
  checkChar?: string;
  uncheckChar?: string;
}

export class Checkbox extends Box {
  private _checked: boolean = false;
  private text: string;
  private checkChar: string;
  private uncheckChar: string;

  constructor(options: CheckboxOptions = {}) {
    super({
      ...options,
      focusable: true,
      clickable: true,
      height: options.height || 1,
      width: options.width || (options.text ? options.text.length + 4 : 3),
    });

    this._checked = options.checked || false;
    this.text = options.text || '';
    this.checkChar = options.checkChar || 'X';
    this.uncheckChar = options.uncheckChar || ' ';

    this.enableMouse();
    this.enableKeys();

    // Update display
    this.updateContent();

    // Toggle on click
    this.on('click', () => {
      this.toggle();
    });

    // Toggle on space/enter
    this.key(['space', 'enter'], () => {
      this.toggle();
    });

    // Focus styling
    this.on('focus', () => {
      if (this.options.style && this.options.style.focus) {
        this.options.style = { ...this.options.style, ...this.options.style.focus };
      }
      this.screen?.render();
    });

    this.on('blur', () => {
      if (this.options.style && this.options.style.focus) {
        // Reset to original style (simplified)
        this.screen?.render();
      }
    });
  }

  /**
   * Update checkbox display
   */
  private updateContent(): void {
    const checkbox = `[${this._checked ? this.checkChar : this.uncheckChar}]`;
    this.setContent(this.text ? `${checkbox} ${this.text}` : checkbox);
  }

  /**
   * Check the checkbox
   */
  check(): void {
    if (this._checked) return;
    this._checked = true;
    this.updateContent();
    this.emit('check');
    this.emit('change', this._checked);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Uncheck the checkbox
   */
  uncheck(): void {
    if (!this._checked) return;
    this._checked = false;
    this.updateContent();
    this.emit('uncheck');
    this.emit('change', this._checked);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Toggle checkbox state
   */
  toggle(): void {
    if (this._checked) {
      this.uncheck();
    } else {
      this.check();
    }
  }

  /**
   * Get checked state
   */
  isChecked(): boolean {
    return this._checked;
  }

  /**
   * Set checked state
   */
  setChecked(checked: boolean): void {
    if (checked) {
      this.check();
    } else {
      this.uncheck();
    }
  }

  /**
   * Get checkbox value (for form compatibility)
   */
  getValue(): boolean {
    return this._checked;
  }

  /**
   * Set checkbox value (for form compatibility)
   */
  setValue(value: boolean): void {
    this.setChecked(value);
  }
}
