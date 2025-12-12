/**
 * Button widget - Clickable button
 */

import { Element } from '../core/element';
import type { ButtonOptions, KeyEvent } from '../core/types';

export class Button extends Element {
  constructor(options: ButtonOptions = {}) {
    super({
      focusable: true,
      clickable: true,
      keys: true,
      border: 'line',
      align: 'center',
      valign: 'middle',
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      ...options,
    });

    // Key handlers
    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }

    // Mouse handlers
    if (options.mouse !== false) {
      this.on('click', this._onClick.bind(this));
    }
  }

  private _onKeypress(ch: any, key: KeyEvent): void {
    if (!this.focused) return;

    if (key.name === 'enter' || key.name === 'space') {
      this.press();
    }
  }

  private _onClick(): void {
    this.press();
  }

  press(): void {
    this.emit('press');
    this.emit('action');
  }
}
