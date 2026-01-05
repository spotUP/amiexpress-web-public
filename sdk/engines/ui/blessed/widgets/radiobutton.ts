/**
 * RadioButton - Single radio button (usually used within RadioSet)
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface RadioButtonOptions extends ElementOptions {
  checked?: boolean;
  text?: string;
  checkChar?: string;
  uncheckChar?: string;
  value?: any;
}

export class RadioButton extends Box {
  private _checked: boolean = false;
  private text: string;
  private checkChar: string;
  private uncheckChar: string;
  public value: any;

  constructor(options: RadioButtonOptions = {}) {
    const baseStyle = options.style || {};
    const focusStyle = {
      fg: 'black',
      bg: 'yellow',
      ...(baseStyle.focus || {}),
    };
    const hoverStyle = {
      fg: 'black',
      bg: 'cyan',
      ...(baseStyle.hover || {}),
    };

    super({
      ...options,
      focusable: true,
      clickable: true,
      height: options.height || 1,
      width: options.width || (options.text ? options.text.length + 4 : 3),
      style: {
        ...baseStyle,
        focus: focusStyle,
        hover: hoverStyle,
      },
    });

    this._checked = options.checked || false;
    this.text = options.text || '';
    this.checkChar = options.checkChar || 'O';
    this.uncheckChar = options.uncheckChar || ' ';
    this.value = options.value !== undefined ? options.value : this.text;

    this.enableMouse();
    this.enableKeys();

    // Update display
    this.updateContent();

    // Select on click
    this.on('click', () => {
      this.select();
    });

    // Select on space/enter
    this.key(['space', 'enter'], () => {
      this.select();
      return true;
    });

    // Focus/blur handlers
    this.on('focus', () => {
      this.screen?.render();
    });

    this.on('blur', () => {
      this.screen?.render();
    });
  }

  /**
   * Update radio button display
   */
  private updateContent(): void {
    const radio = `(${this._checked ? this.checkChar : this.uncheckChar})`;
    this.setContent(this.text ? `${radio} ${this.text}` : radio);
  }

  /**
   * Select this radio button
   */
  select(): void {
    if (this._checked) return;
    this._checked = true;
    this.updateContent();
    this.emit('select');
    this.emit('change', true);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Deselect this radio button
   */
  deselect(): void {
    if (!this._checked) return;
    this._checked = false;
    this.updateContent();
    this.emit('deselect');
    this.emit('change', false);
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get selected state
   */
  isSelected(): boolean {
    return this._checked;
  }

  /**
   * Set selected state
   */
  setSelected(selected: boolean): void {
    if (selected) {
      this.select();
    } else {
      this.deselect();
    }
  }

  /**
   * Get radio button value
   */
  getValue(): any {
    return this._checked ? this.value : null;
  }
}
