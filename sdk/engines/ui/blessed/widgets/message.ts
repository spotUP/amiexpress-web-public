/**
 * Message - Simple message dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 *
 * Automatically stays centered in responsive layouts
 *
 * Responsive features:
 * - Full-width on mobile (xs breakpoint)
 * - Touch-friendly button sizes (min 3 rows height)
 * - Tap-to-dismiss on mobile
 * - Auto-center on resize
 */

import { Box } from './box';
import { Button } from './button';
import { Overlay } from './overlay';
import { makeModalResponsive, trapModalInput } from '../utils/modal-helpers';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { calculateDialogWidth, MIN_TOUCH_HEIGHT } from '../core/responsive-constants';

export interface MessageOptions extends ElementOptions {
  text?: string;
  title?: string;
  overlay?: boolean;  // Enable overlay dimming (default opacity 0.5)
  overlayOpacity?: number;  // Custom overlay opacity (0-1)
  /** Mobile width (default: calculated based on screen) */
  mobileWidth?: number | string;
  /** Enable tap anywhere to dismiss on mobile (default: true) */
  tapToDismiss?: boolean;
}

export class Message extends Box {
  private messageText: Box;
  private okButton: Button;
  private _overlay?: Overlay;
  private _responsiveCleanup?: () => void;
  private _trapCleanup?: () => void;
  private _desktopWidth: number | string | undefined;
  private _mobileWidth: number | string | undefined;
  private _desktopButtonWidth: number = 10;
  private _mobileButtonWidth: number = 14;
  private _desktopButtonHeight: number = 3;
  private _mobileButtonHeight: number = MIN_TOUCH_HEIGHT;
  private _tapToDismiss: boolean = true;
  private _isMobileMode: boolean = false;

  constructor(options: MessageOptions = {}) {
    // Force fixed height - 'shrink' doesn't work well with nested elements
    const height = typeof options.height === 'number' ? options.height : 12;

    // If overlay is enabled, we'll reparent to the overlay later
    const originalParent = options.parent;
    const useOverlay = options.overlay || options.overlayOpacity !== undefined;

    super({
      ...options,
      parent: useOverlay ? undefined : originalParent,  // Don't set parent yet if using overlay
      border: options.border || { type: 'line', fg: 'white', bg: 'blue' },
      label: options.title || options.label || ' Message ',
      width: options.width || 40,
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
        border: {
          fg: 'white',
          bg: 'blue',
          ...options.style?.border,
        },
      },
    });

    // Create overlay if enabled
    if (useOverlay && originalParent) {
      const overlayOpacity = options.overlayOpacity ?? 0.5;
      this._overlay = new Overlay({
        parent: originalParent,
        opacity: overlayOpacity,
        hidden: true,
      });
      // Reparent dialog to overlay
      this._overlay.append(this);
    }

    // Message text - centered
    // Use same bg as dialog for consistent appearance
    const dialogBg = options.style?.bg || 'blue';
    const messageHeight = Math.max(3, height - 7);
    this.messageText = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: messageHeight,
      content: options.text || '',
      tags: true,
      align: 'center',
      valign: 'middle',
      style: {
        fg: options.style?.fg || 'white',
        bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
      },
    });

    // OK button
    this.okButton = new Button({
      parent: this,
      bottom: 0,
      left: 'center',
      width: 10,
      height: 3,
      content: '[ OK ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      mouse: true,
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'blue' },
        hover: { bg: 'lightblue', fg: 'black' },
        focus: { bg: 'lightblue', fg: 'black' },
      },
    });

    this.okButton.on('press', () => {
      this.hide();
      this.emit('ok');
      this.emit('hide');
    });

    // Close on escape
    this.key(['escape'], () => {
      this.hide();
      this.emit('hide');
    });

    // Close on enter
    this.key(['enter'], () => {
      this.hide();
      this.emit('ok');
      this.emit('hide');
    });

    // Store desktop dimensions for responsive toggling
    this._desktopWidth = options.width || 40;
    this._mobileWidth = options.mobileWidth;
    this._tapToDismiss = options.tapToDismiss !== false;  // Default: enabled

    // Tap anywhere to dismiss (on mobile mode only)
    this.on('click', () => {
      if (this._isMobileMode && this._tapToDismiss) {
        this.hide();
        this.emit('ok');
        this.emit('hide');
      }
    });
  }

  /**
   * Display the message
   */
  display(text?: string, callback?: () => void): void {
    if (text) {
      this.setText(text);
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
    this.okButton.focus();
    this.screen?.render();

    if (callback) {
      this.once('hide', callback);
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
   * Set message text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get message text
   */
  getText(): string {
    return this.messageText.getContent();
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
   * Called when entering mobile mode - full width, tap-to-dismiss
   */
  protected _enterMobileMode(): void {
    this._isMobileMode = true;
    this._setMobileLayout();
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - restore desktop layout
   */
  protected _exitMobileMode(): void {
    this._isMobileMode = false;
    this._setDesktopLayout();
    this.emit('exit-mobile');
  }

  /**
   * Set mobile-friendly layout
   */
  private _setMobileLayout(): void {
    if (!this.screen) return;
    this._isMobileMode = true;

    // Calculate mobile width (near full-width with padding)
    const screenWidth = this.screen.width as number;
    const mobileWidth = this._mobileWidth ?? calculateDialogWidth(screenWidth);
    this.width = mobileWidth;

    // Larger touch-friendly button
    this.okButton.width = this._mobileButtonWidth;
    this.okButton.height = this._mobileButtonHeight;

    if (this.screen) this.screen.render();
  }

  /**
   * Restore desktop layout
   */
  private _setDesktopLayout(): void {
    this._isMobileMode = false;
    if (this._desktopWidth !== undefined) {
      this.width = this._desktopWidth;
    }

    // Restore desktop button size
    this.okButton.width = this._desktopButtonWidth;
    this.okButton.height = this._desktopButtonHeight;

    if (this.screen) this.screen.render();
  }
}
