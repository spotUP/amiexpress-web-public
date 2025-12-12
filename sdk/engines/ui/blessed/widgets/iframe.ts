/**
 * IFrame - Embedded frame widget for nested screens
 */

import { Box } from './box';
import type { Element } from '../core/element';
import type { ElementOptions } from '../core/types';

export interface IFrameOptions extends ElementOptions {
  detached?: boolean;
}

export class IFrame extends Box {
  private frameChildren: Element[] = [];
  private detached: boolean;

  constructor(options: IFrameOptions = {}) {
    const { detached, ...boxOptions } = options;

    super({
      ...boxOptions,
      border: options.border !== undefined ? options.border : { type: 'line' },
      scrollable: options.scrollable !== false,
    });

    this.detached = detached || false;
  }

  /**
   * Append element to iframe
   */
  append(element: Element): void {
    this.frameChildren.push(element);
    super.append(element);
  }

  /**
   * Prepend element to iframe
   */
  prepend(element: Element): void {
    this.frameChildren.unshift(element);
    super.prepend(element);
  }

  /**
   * Remove element from iframe
   */
  remove(element: Element): void {
    const index = this.frameChildren.indexOf(element);
    if (index >= 0) {
      this.frameChildren.splice(index, 1);
    }
    super.remove(element);
  }

  /**
   * Get all frame children
   */
  getFrameChildren(): Element[] {
    return [...this.frameChildren];
  }

  /**
   * Clear all frame children
   */
  clearFrame(): void {
    for (const child of this.frameChildren) {
      this.remove(child);
    }
    this.frameChildren = [];
  }

  /**
   * Focus first focusable child
   */
  focusFirst(): void {
    for (const child of this.frameChildren) {
      if (child.options.focusable) {
        child.focus();
        break;
      }
    }
  }

  /**
   * Focus last focusable child
   */
  focusLast(): void {
    for (let i = this.frameChildren.length - 1; i >= 0; i--) {
      const child = this.frameChildren[i];
      if (child.options.focusable) {
        child.focus();
        break;
      }
    }
  }

  /**
   * Focus next focusable child
   */
  focusNext(): void {
    let foundCurrent = false;
    for (const child of this.frameChildren) {
      if (foundCurrent && child.options.focusable) {
        child.focus();
        return;
      }
      if (child.focused) {
        foundCurrent = true;
      }
    }
    // Wrap to first
    this.focusFirst();
  }

  /**
   * Focus previous focusable child
   */
  focusPrevious(): void {
    let foundCurrent = false;
    for (let i = this.frameChildren.length - 1; i >= 0; i--) {
      const child = this.frameChildren[i];
      if (foundCurrent && child.options.focusable) {
        child.focus();
        return;
      }
      if (child.focused) {
        foundCurrent = true;
      }
    }
    // Wrap to last
    this.focusLast();
  }

  /**
   * Get focused child
   */
  getFocusedChild(): Element | undefined {
    return this.frameChildren.find(child => child.focused);
  }

  /**
   * Show/hide frame
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Get frame visibility
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Get frame count
   */
  getFrameCount(): number {
    return this.frameChildren.length;
  }
}
