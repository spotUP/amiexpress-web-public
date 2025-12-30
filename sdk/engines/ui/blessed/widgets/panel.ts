/**
 * Panel widget - Box with focus group for multi-panel layouts
 *
 * Features:
 * - Visual indication when panel is active (has focused child)
 * - Can be activated with Alt+<number> shortcuts
 * - F6 cycles through panels
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface PanelOptions extends ElementOptions {
  panelIndex?: number;  // For Alt+<number> shortcut (1-9)
  title?: string;       // Panel title
}

export class Panel extends Box {
  private panelIndex?: number;
  private _isActive: boolean = false;

  constructor(options: PanelOptions = {}) {
    super({
      ...options,
      border: options.border || { type: 'line', fg: 'blue' },
      focusable: true,
      keys: true,
      mouse: true,
      clickable: true,  // Enable click events for panel activation
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          fg: 'white',
          bg: 'black',
        },
        ...options.style,
      },
    });

    this.panelIndex = options.panelIndex;

    // Set label if title provided
    if (options.title) {
      this.options.label = ` ${options.title} `;
    }

    // Focus panel when clicked anywhere on it (including when children are clicked)
    this.on('click', () => {
      this.focus();
    });

    // Track active state based on child focus
    if (this.screen) {
      this.screen.on('element focus', (el: any) => {
        // Check if focused element is a descendant of this panel
        const isDescendant = this._isDescendantOf(el, this);
        if (isDescendant && !this._isActive) {
          this._activate();
        } else if (!isDescendant && this._isActive) {
          this._deactivate();
        }
      });
    }

    // Register Alt+<number> shortcut if panel index is set
    if (this.panelIndex && this.panelIndex >= 1 && this.panelIndex <= 9) {
      const altKey = `M-${this.panelIndex}`;  // Alt+1, Alt+2, etc.
      if (this.screen) {
        (this.screen as any).key([altKey], () => {
          this.activate();
        });
      }
    }
  }

  /**
   * Check if element is a descendant of parent
   */
  private _isDescendantOf(element: any, parent: any): boolean {
    let current = element;
    while (current) {
      if (current === parent) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Activate panel (focus first focusable child)
   */
  activate(): void {
    // Find first focusable child
    const focusable = this._getFirstFocusable(this);
    if (focusable) {
      focusable.focus();
    } else {
      // No focusable children, focus the panel itself
      this.focus();
    }
  }

  /**
   * Get first focusable descendant
   */
  private _getFirstFocusable(element: any): any {
    if (element.options.focusable && element !== this) {
      return element;
    }
    for (const child of element.children || []) {
      const focusable = this._getFirstFocusable(child);
      if (focusable) return focusable;
    }
    return null;
  }

  /**
   * Mark panel as active (internal)
   */
  private _activate(): void {
    if (this._isActive) return;
    this._isActive = true;
    this.emit('activate');
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Mark panel as inactive (internal)
   */
  private _deactivate(): void {
    if (!this._isActive) return;
    this._isActive = false;
    this.emit('deactivate');
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Check if panel is currently active
   */
  isActive(): boolean {
    return this._isActive;
  }
}
