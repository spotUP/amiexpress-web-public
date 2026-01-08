/**
 * Prompt - Text input dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 *
 * Automatically stays centered in responsive layouts
 */

import { Box } from './box';
import { Textbox } from './textbox';
import { Button } from './button';
import { Overlay } from './overlay';
import { makeModalResponsive, trapModalInput } from '../utils/modal-helpers';
import type { ElementOptions } from '../core/types';

export interface PromptOptions extends ElementOptions {
  text?: string;
  title?: string;
  value?: string;
  overlay?: boolean;
  overlayOpacity?: number;
}

export class Prompt extends Box {
  private messageText: Box;
  private inputField: Textbox;
  private okButton: Button;
  private cancelButton: Button;
  private buttonBox: Box;
  private _overlay?: Overlay;
  private _responsiveCleanup?: () => void;
  private _trapCleanup?: () => void;

  constructor(options: PromptOptions = {}) {
    // Force fixed height - 'shrink' doesn't work well with nested elements
    const height = typeof options.height === 'number' ? options.height : 12;

    const originalParent = options.parent;
    const useOverlay = options.overlay || options.overlayOpacity !== undefined;

    super({
      ...options,
      parent: useOverlay ? undefined : originalParent,
      border: options.border || { type: 'line', fg: 'white', bg: 'blue' },
      label: options.title || options.label || ' Input ',
      width: options.width || 50,
      height: height,
      top: options.top || 'center',
      left: options.left || 'center',
      padding: { left: 1, right: 1, top: 1, bottom: 1 },
      hidden: true,
      focusable: true,
      shadow: true,  // Enable shadow for depth
      ch: ' ',  // Fill character for solid background
      style: {
        ...options.style,
        bg: options.style?.bg || 'blue',
        transparent: true,  // Transparent background like blessed shadow demo
        border: {
          fg: 'white',
          bg: 'blue',
          ...options.style?.border,
        },
      },
    });

    if (useOverlay && originalParent) {
      const overlayOpacity = options.overlayOpacity ?? 0.5;
      this._overlay = new Overlay({
        parent: originalParent,
        opacity: overlayOpacity,
        hidden: true,
      });
      this._overlay.append(this);
    }

    // Prompt text - at top
    // Use same bg as dialog for consistent appearance
    const dialogBg = options.style?.bg || 'blue';
    this.messageText = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 2,
      content: options.text || '',
      tags: true,
      style: {
        fg: options.style?.fg || 'white',
        bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
      },
    });

    // Input field - use right: 0 to respect parent boundaries
    // Input field keeps solid background for readability
    this.inputField = new Textbox({
      parent: this,
      top: 2,
      left: 0,
      right: 0,
      height: 3,
      border: { type: 'line' },
      inputOnFocus: true,
      mouse: true,
      value: options.value || '',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'gray' },
      },
    });

    // Button container
    this.buttonBox = new Box({
      parent: this,
      bottom: 0,
      left: 'center',
      width: 26,
      height: 3,
      style: {
        bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
      },
    });

    // OK button
    this.okButton = new Button({
      parent: this.buttonBox,
      top: 0,
      left: 0,
      width: 12,
      height: 3,
      content: '[ OK ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      mouse: true,
      style: {
        fg: 'white',
        bg: 'green',
        border: { fg: 'green' },
        hover: { bg: 'lightgreen', fg: 'black' },
        focus: { bg: 'lightgreen', fg: 'black' },
      },
    });

    // Cancel button
    this.cancelButton = new Button({
      parent: this.buttonBox,
      top: 0,
      left: 14,
      width: 12,
      height: 3,
      content: '[ Cancel ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      mouse: true,
      style: {
        fg: 'white',
        bg: 'red',
        border: { fg: 'red' },
        hover: { bg: 'lightred', fg: 'black' },
        focus: { bg: 'lightred', fg: 'black' },
      },
    });

    this.okButton.on('press', () => {
      const value = this.inputField.getValue();
      this.hide();
      this.emit('submit', value);
      this.emit('hide');
    });

    this.cancelButton.on('press', () => {
      this.hide();
      this.emit('cancel');
      this.emit('hide');
    });

    // Submit on enter in input field
    this.inputField.key(['enter'], () => {
      const value = this.inputField.getValue();
      this.hide();
      this.emit('submit', value);
      this.emit('hide');
    });

    // Cancel on escape
    this.key(['escape'], () => {
      this.hide();
      this.emit('cancel');
      this.emit('hide');
    });

    // Tab between elements
    this.key(['tab'], () => {
      const focused = this.screen?.getFocused();
      if (focused === this.inputField) {
        this.okButton.focus();
      } else if (focused === this.okButton) {
        this.cancelButton.focus();
      } else {
        this.inputField.focus();
      }
      this.screen?.render();
    });

    // Arrow left/right navigation between buttons (when not in input field)
    this.key(['left'], () => {
      const focused = this.screen?.getFocused();
      // Only navigate between buttons if not in input field
      if (focused !== this.inputField) {
        this.okButton.focus();
        this.screen?.render();
      }
    });

    this.key(['right'], () => {
      const focused = this.screen?.getFocused();
      // Only navigate between buttons if not in input field
      if (focused !== this.inputField) {
        this.cancelButton.focus();
        this.screen?.render();
      }
    });
  }

  /**
   * Display the prompt
   */
  showInput(text?: string, value?: string, callback?: (err: Error | null, value?: string) => void): void {
    if (text) {
      this.setText(text);
    }

    if (value !== undefined) {
      this.setValue(value);
    }

    // Show overlay first if present
    if (this._overlay) {
      this._overlay.show();
    }

    // Enable responsive centering
    if (!this._responsiveCleanup) {
      this._responsiveCleanup = makeModalResponsive(this);
    }

    // Trap input within modal (save focus state and push onto focus stack)
    if (this.screen) {
      this.screen.saveFocus?.();
      this.screen.focusPush?.(this);
      // Also trap navigation keys to prevent them from leaking to elements behind
      if (!this._trapCleanup) {
        this._trapCleanup = trapModalInput(this);
      }
    }

    this.show();
    this.setFront();
    this.inputField.focus();
    this.screen?.render();

    if (callback) {
      this.once('submit', (value: string) => {
        callback(null, value);
      });
      this.once('cancel', () => {
        callback(new Error('cancelled'));
      });
    }
  }

  /**
   * Override hide to also hide overlay and restore focus state
   */
  hide(): void {
    super.hide();
    if (this._overlay) {
      this._overlay.hide();
    }

    // Restore focus state when modal is hidden
    if (this.screen) {
      this.screen.restoreFocus?.();
    }

    // Cleanup trap handlers
    if (this._trapCleanup) {
      this._trapCleanup();
      this._trapCleanup = undefined;
    }
  }

  /**
   * Override destroy to cleanup responsive listener and trap handlers
   */
  destroy(): void {
    if (this._responsiveCleanup) {
      this._responsiveCleanup();
      this._responsiveCleanup = undefined;
    }
    if (this._trapCleanup) {
      this._trapCleanup();
      this._trapCleanup = undefined;
    }
    super.destroy();
  }

  /**
   * Set prompt text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get prompt text
   */
  getText(): string {
    return this.messageText.getContent();
  }

  /**
   * Set input value
   */
  setValue(value: string): void {
    this.inputField.setValue(value);
  }

  /**
   * Get input value
   */
  getValue(): string {
    return this.inputField.getValue();
  }
}
