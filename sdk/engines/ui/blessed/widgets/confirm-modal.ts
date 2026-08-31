/**
 * ConfirmModal - Generic confirmation dialog
 *
 * A reusable modal with:
 * - Customizable title and message
 * - Scrollable message content
 * - Two action buttons (confirm/cancel)
 * - Tab navigation between buttons
 * - ESC to cancel
 * - Overlay dimming support
 * - Responsive mobile layout
 */

import { Box } from './box';
import { Button } from './button';
import { Overlay } from './overlay';
import { makeModalResponsive, trapModalInput } from '../utils/modal-helpers';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { calculateDialogWidth, MIN_TOUCH_HEIGHT } from '../core/responsive-constants';

/**
 * Colours a terminal draws light enough that black text reads better on them.
 * Anything else takes white.
 */
const LIGHT_FILLS = new Set([
  'white', 'yellow', 'green', 'cyan', 'lightblue', 'lightgreen', 'lightcyan',
  'lightyellow', 'lightwhite', 'brightwhite', 'brightyellow', 'brightgreen',
  'brightcyan',
]);

export interface ConfirmButtonStyle {
  fg: string;
  bg: string;
  bold?: boolean;
  border: { fg: string };
  focus: { fg: string; bg: string; bold: boolean; border: { fg: string } };
  hover: { fg: string; bg: string; bold: boolean; border: { fg: string } };
}

/**
 * How a confirm dialog's buttons are painted, idle and active.
 *
 * Both buttons used to be built filled and framed in their own role colour,
 * so the dialog showed two framed, filled buttons and nothing said which one
 * Enter would press - and the idle one, white text on a mid-tone fill, was
 * unreadable. Reported from DOORMAN's delete dialog on 2026-08-31.
 *
 * Idle is the role colour as TEXT on the modal's black, with the border drawn
 * in black so no frame shows. Focused fills with the role colour and frames
 * itself in it, over a foreground chosen to be legible on that fill. The
 * button keeps its cells either way, so nothing moves when focus does - only
 * what is painted into them.
 *
 * @param colour the button's role colour (red for a destructive confirm,
 *               green for the safe way out)
 */
export function confirmButtonStyle(colour: string): ConfirmButtonStyle {
  const activeFg = LIGHT_FILLS.has(colour) ? 'black' : 'white';
  const active = { fg: activeFg, bg: colour, bold: true, border: { fg: colour } };

  return {
    fg: colour,
    bg: 'black',
    bold: true,
    // Drawn in the modal's own background: the cells stay, the frame does not
    // show. Removing the border outright would move both buttons whenever
    // focus changed.
    border: { fg: 'black' },
    focus: active,
    // The mouse and the keyboard must agree about which button is active.
    hover: { ...active },
  };
}

export interface ConfirmModalOptions extends ElementOptions {
  /** Dialog title */
  title?: string;
  /** Message content (supports tags) */
  message?: string;
  /** Confirm button text (default: "Confirm") */
  confirmText?: string;
  /** Cancel button text (default: "Cancel") */
  cancelText?: string;
  /** Confirm button color (default: "green") */
  confirmColor?: string;
  /** Cancel button color (default: "red") */
  cancelColor?: string;
  /** Border color (default: "cyan") */
  borderColor?: string;
  /** Enable overlay dimming (default: true) */
  overlay?: boolean;
  /** Overlay opacity (default: 0.5) */
  overlayOpacity?: number;
  /** Callback on confirm */
  onConfirm?: () => void;
  /** Callback on cancel */
  onCancel?: () => void;
  /** Show only confirm button (no cancel) */
  singleButton?: boolean;
}

export class ConfirmModal extends Box {
  private _overlay?: Overlay;
  private _messageBox: Box;
  private _confirmButton: Button;
  private _cancelButton?: Button;
  private _responsiveCleanup?: () => void;
  private _trapCleanup?: () => void;
  private _onConfirm?: () => void;
  private _onCancel?: () => void;
  private _isMobileMode: boolean = false;
  private _singleButton: boolean;

  constructor(options: ConfirmModalOptions = {}) {
    const originalParent = options.parent;
    // Default overlay to false: CSS overlay dims the entire xterm canvas, which
    // sits in front of all ANSI content and makes the dialog look invisible/dimmed.
    // Callers can still opt in explicitly with overlay: true.
    const useOverlay = options.overlay === true;
    const borderColor = options.borderColor || 'cyan';
    // Accept content as an alias for message so callers who pass the raw Box
    // property by mistake still get their text displayed correctly.
    if (!options.message && typeof (options as any).content === 'string') {
      options = { ...options, message: (options as any).content, content: undefined };
    }

    super({
      ...options,
      parent: useOverlay ? undefined : originalParent,
      top: 'center',
      left: 'center',
      width: options.width || 60,
      height: options.height || 12,
      label: options.title ? ` ${options.title} ` : ' Confirm ',
      border: options.border || { type: 'line', fg: borderColor },
      shadow: true,
      hidden: true,
      mouse: true,
      keys: true,
      trapFocus: true,
      ch: ' ',
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: borderColor },
        ...options.style,
      },
    });

    this._onConfirm = options.onConfirm;
    this._onCancel = options.onCancel;
    this._singleButton = options.singleButton || false;

    // Create overlay if enabled.
    // The dialog is a SIBLING of the overlay (both children of originalParent),
    // not a child of the overlay. This ensures the dialog paints on top in
    // blessed's painter algorithm (later siblings render over earlier ones).
    if (useOverlay && originalParent) {
      this._overlay = new Overlay({
        parent: originalParent,
        opacity: options.overlayOpacity ?? 0.5,
        hidden: true,
      });
      // Attach the dialog to the same parent so it renders after (on top of) the overlay
      (originalParent as any).append(this);
    }

    // Message box (scrollable)
    this._messageBox = new Box({
      parent: this,
      top: 1,
      left: 2,
      width: '100%-4',
      height: '100%-5',
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      content: options.message || '',
      scrollbar: {
        ch: ' ',
        style: { bg: 'gray' }
      },
      style: {
        fg: 'white',
        bg: 'black',
      },
    } as any);

    const confirmColor = options.confirmColor || 'green';
    const cancelColor = options.cancelColor || 'red';

    // Confirm button
    this._confirmButton = new Button({
      parent: this,
      bottom: 1,
      left: this._singleButton ? 'center' : 10,
      width: 14,
      height: 3,
      content: options.confirmText || '[ Confirm ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      mouse: true,
      clickable: true,
      focusable: true,
      style: confirmButtonStyle(confirmColor) as any,
    });

    // Cancel button (if not single button mode)
    if (!this._singleButton) {
      this._cancelButton = new Button({
        parent: this,
        bottom: 1,
        right: 10,
        width: 14,
        height: 3,
        content: options.cancelText || '[ Cancel ]',
        align: 'center',
        valign: 'middle',
        border: { type: 'line' },
        mouse: true,
        clickable: true,
        focusable: true,
        style: confirmButtonStyle(cancelColor) as any,
      });
    }

    this._setupEventHandlers();
  }

  private _setupEventHandlers(): void {
    // Confirm button handlers
    this._confirmButton.on('press', () => {
      this._handleConfirm();
    });

    this._confirmButton.on('click', () => {
      this._handleConfirm();
    });

    this._confirmButton.key(['enter', 'return'], () => {
      this._handleConfirm();
      return true;
    });

    // Cancel button handlers
    if (this._cancelButton) {
      this._cancelButton.on('press', () => {
        this._handleCancel();
      });

      this._cancelButton.on('click', () => {
        this._handleCancel();
      });

      this._cancelButton.key(['enter', 'return'], () => {
        this._handleCancel();
        return true;
      });

      // Tab navigation
      this._confirmButton.key(['tab'], () => {
        this._cancelButton?.focus();
        this.screen?.render();
        return true;
      });

      this._cancelButton.key(['tab'], () => {
        this._confirmButton.focus();
        this.screen?.render();
        return true;
      });
    }

    // ESC to cancel
    this.key(['escape'], () => {
      this._handleCancel();
    });
  }

  private _handleConfirm(): void {
    if (this._onConfirm) {
      this._onConfirm();
    }
    this.emit('confirm');
    this.hide();
  }

  private _handleCancel(): void {
    if (this._onCancel) {
      this._onCancel();
    }
    this.emit('cancel');
    this.hide();
  }

  /**
   * Show the modal
   */
  display(): void {
    // Show overlay first if present
    if (this._overlay) {
      this._overlay.show();
    }

    // Enable responsive centering
    if (!this._responsiveCleanup) {
      this._responsiveCleanup = makeModalResponsive(this);
    }

    // Trap input within modal
    if (this.screen) {
      this.screen.saveFocus?.();
      this.screen.focusPush?.(this);
      if (!this._trapCleanup) {
        this._trapCleanup = trapModalInput(this);
      }
    }

    this.show();
    this.setFront();
    this._confirmButton.focus();
    this.screen?.render();

    // Tell the overlay to punch out the modal area so CSS dim doesn't cover it
    if (this._overlay) {
      const coords = (this as any)._getCoords?.();
      if (coords) {
        this._overlay.setExclude({ xi: coords.xi, yi: coords.yi, xl: coords.xl, yl: coords.yl });
      }
    }
  }

  /**
   * Hide the modal
   */
  hide(): void {
    super.hide();
    if (this._overlay) {
      this._overlay.setExclude(undefined);
      this._overlay.hide();
    }

    // Restore focus state
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
   * Set message content
   */
  setMessage(message: string): void {
    this._messageBox.setContent(message);
    this.screen?.render();
  }

  /**
   * Set title
   */
  setTitle(title: string): void {
    this.setLabel(` ${title} `);
    this.screen?.render();
  }

  /**
   * Set confirm callback
   */
  onConfirm(callback: () => void): void {
    this._onConfirm = callback;
  }

  /**
   * Set cancel callback
   */
  onCancel(callback: () => void): void {
    this._onCancel = callback;
  }

  /**
   * Override destroy
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

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange?.(breakpoint, previousBreakpoint, state);
    if (state.isMobile || breakpoint === 'xs') {
      this._setMobileLayout();
    } else {
      this._setDesktopLayout();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  protected _enterMobileMode(): void {
    this._setMobileLayout();
    this.emit('enter-mobile');
  }

  protected _exitMobileMode(): void {
    this._setDesktopLayout();
    this.emit('exit-mobile');
  }

  private _setMobileLayout(): void {
    if (!this.screen) return;
    this._isMobileMode = true;

    const screenWidth = this.screen.width as number;
    this.width = calculateDialogWidth(screenWidth);

    // Larger touch-friendly buttons
    this._confirmButton.width = 16;
    this._confirmButton.height = MIN_TOUCH_HEIGHT;
    if (this._cancelButton) {
      this._cancelButton.width = 16;
      this._cancelButton.height = MIN_TOUCH_HEIGHT;
    }

    this.screen?.render();
  }

  private _setDesktopLayout(): void {
    this._isMobileMode = false;
    this.width = 60;

    // Restore desktop button size
    this._confirmButton.width = 14;
    this._confirmButton.height = 3;
    if (this._cancelButton) {
      this._cancelButton.width = 14;
      this._cancelButton.height = 3;
    }

    this.screen?.render();
  }
}

/**
 * Factory function
 */
export function confirmModal(options?: ConfirmModalOptions): ConfirmModal {
  return new ConfirmModal(options);
}
