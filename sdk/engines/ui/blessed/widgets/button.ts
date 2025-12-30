/**
 * Button widget - Clickable button
 */

import { Element } from '../core/element';
import type { ButtonOptions, KeyEvent } from '../core/types';

export class Button extends Element {
  constructor(options: ButtonOptions = {}) {
    const baseStyle = options.style ?? {};
    const focusStyle = {
      fg: 'white',
      bg: 'blue',
      ...(baseStyle.focus ?? {}),
    };
    const hoverStyle = {
      fg: 'white',
      bg: 'blue',
      ...(baseStyle.hover ?? {}),
    };

    super({
      focusable: true,
      clickable: true,
      keys: true,
      border: 'line',
      align: 'center',
      valign: 'middle',
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
      ...options,
      style: {
        fg: baseStyle.fg ?? 'white',
        bg: baseStyle.bg ?? 'black',
        ...baseStyle,
        focus: focusStyle,
        hover: hoverStyle,
      },
    });

    // Key handlers
    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }

    // Mouse handlers
    if (options.mouse !== false) {
      this.on('click', this._onClick.bind(this));
    }

    // Focus/blur handlers - trigger re-render to show focus style
    this.on('focus', () => {
      console.log('[Button] Received focus event, this.focused:', this.focused);
      if (this.screen) {
        this.screen.render();
      }
    });

    this.on('blur', () => {
      console.log('[Button] Received blur event');
      if (this.screen) {
        this.screen.render();
      }
    });
  }

  private _onKeypress(ch: any, key: KeyEvent): void {
    console.log('[Button._onKeypress] key:', key.name, 'this.focused:', this.focused);
    if (!this.focused) {
      console.log('[Button._onKeypress] Ignoring because not focused');
      return;
    }

    if (key.name === 'enter' || key.name === 'space') {
      console.log('[Button._onKeypress] Enter/Space detected, calling press()');
      this.press();
    }
  }

  private _onClick(): void {
    console.log('[Button._onClick] Click detected, calling press()');
    this.press();
  }

  press(): void {
    console.log('[Button.press] Emitting press and action events');
    this.emit('press');
    this.emit('action');
  }
}
