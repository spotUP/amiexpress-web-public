/**
 * Form widget - Container for form elements with focus management
 */

import { Element } from '../core/element';
import type { FormOptions, KeyEvent } from '../core/types';

export class Form extends Element {
  private focusableChildren: Element[] = [];
  private focusIndex: number = 0;

  constructor(options: FormOptions = {}) {
    super({
      focusable: true,
      keys: true,
      ...options,
    });

    // Key handlers
    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }
  }

  private _onKeypress(ch: any, key: KeyEvent): void {
    if (!this.focused) return;

    if (key.name === 'tab') {
      if (key.shift) {
        this.focusPrevious();
      } else {
        this.focusNext();
      }
      return;
    }

    if (key.name === 'enter') {
      this.submit();
      return;
    }

    if (key.name === 'escape') {
      this.cancel();
      return;
    }
  }

  append(element: Element): void {
    super.append(element);
    this._updateFocusable();
  }

  remove(element: Element): void {
    super.remove(element);
    this._updateFocusable();
  }

  private _updateFocusable(): void {
    this.focusableChildren = this.children.filter((child) => child.options.focusable !== false);
  }

  focusNext(): void {
    if (this.focusableChildren.length === 0) return;

    this.focusIndex = (this.focusIndex + 1) % this.focusableChildren.length;
    this.focusableChildren[this.focusIndex].focus();
  }

  focusPrevious(): void {
    if (this.focusableChildren.length === 0) return;

    this.focusIndex = (this.focusIndex - 1 + this.focusableChildren.length) % this.focusableChildren.length;
    this.focusableChildren[this.focusIndex].focus();
  }

  focusFirst(): void {
    if (this.focusableChildren.length === 0) return;

    this.focusIndex = 0;
    this.focusableChildren[0].focus();
  }

  focusLast(): void {
    if (this.focusableChildren.length === 0) return;

    this.focusIndex = this.focusableChildren.length - 1;
    this.focusableChildren[this.focusIndex].focus();
  }

  submit(): void {
    this.emit('submit');
  }

  cancel(): void {
    this.emit('cancel');
  }

  reset(): void {
    this.emit('reset');
  }
}
