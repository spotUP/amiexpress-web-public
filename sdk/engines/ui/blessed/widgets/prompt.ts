/**
 * Prompt - Text input dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 *
 * Automatically stays centered in responsive layouts
 *
 * Responsive features:
 * - Full-width on mobile (xs breakpoint)
 * - Touch-friendly button sizes
 * - Auto-center on resize
 */

import { Box, BoxOptions } from './box';
import { Textbox } from './textbox';
import { Button } from './button';
import { Overlay } from './overlay';
import { makeModalResponsive, trapModalInput } from '../utils/modal-helpers';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { calculateDialogWidth, MIN_TOUCH_HEIGHT, DIALOG_EDGE_PADDING } from '../core/responsive-constants';

export interface PromptOptions extends BoxOptions {
  text?: string;
  title?: string;
  value?: string;
  overlay?: boolean;
  overlayOpacity?: number;
  /** Mobile width (default: calculated based on screen) */
  mobileWidth?: number | string;
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
  private _desktopWidth: number | string | undefined;
  private _mobileWidth: number | string | undefined;
  private _desktopButtonWidth: number = 10;
  private _mobileButtonWidth: number = 12;
  private _desktopButtonHeight: number = 1;
  private _mobileButtonHeight: number = 3;

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

    // Store desktop dimensions for responsive toggling
    this._desktopWidth = options.width || 50;
    this._mobileWidth = options.mobileWidth;
    this._desktopButtonWidth = 12;
    this._mobileButtonWidth = 14;
    this._desktopButtonHeight = 3;
    this._mobileButtonHeight = MIN_TOUCH_HEIGHT;

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

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle breakpoint change - adjust width and button sizes
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    if (state.isMobile) {
      this._setMobileLayout();
    } else {
      this._setDesktopLayout();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - full width, larger buttons
   */
  protected _enterMobileMode(): void {
    this._setMobileLayout();
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - restore desktop layout
   */
  protected _exitMobileMode(): void {
    this._setDesktopLayout();
    this.emit('exit-mobile');
  }

  /**
   * Set mobile-friendly layout
   */
  private _setMobileLayout(): void {
    if (!this.screen) return;

    // Calculate mobile width (near full-width with padding)
    const screenWidth = this.screen.width as number;
    const mobileWidth = this._mobileWidth ?? calculateDialogWidth(screenWidth);
    this.width = mobileWidth;

    // Larger touch-friendly buttons
    this.okButton.width = this._mobileButtonWidth;
    this.okButton.height = this._mobileButtonHeight;
    this.cancelButton.width = this._mobileButtonWidth;
    this.cancelButton.height = this._mobileButtonHeight;

    // Adjust button container for larger buttons
    this.buttonBox.width = (this._mobileButtonWidth * 2) + 2;

    if (this.screen) this.screen.render();
  }

  /**
   * Restore desktop layout
   */
  private _setDesktopLayout(): void {
    if (this._desktopWidth !== undefined) {
      this.width = this._desktopWidth;
    }

    // Restore desktop button sizes
    this.okButton.width = this._desktopButtonWidth;
    this.okButton.height = this._desktopButtonHeight;
    this.cancelButton.width = this._desktopButtonWidth;
    this.cancelButton.height = this._desktopButtonHeight;

    // Restore button container width
    this.buttonBox.width = 26;

    if (this.screen) this.screen.render();
  }
}
