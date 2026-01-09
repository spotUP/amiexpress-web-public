/**
 * Question - Yes/No dialog box
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

export interface QuestionOptions extends ElementOptions {
  text?: string;
  title?: string;
  overlay?: boolean;  // Enable overlay dimming (default opacity 0.5)
  overlayOpacity?: number;  // Custom overlay opacity (0-1)
  /** Mobile width (default: calculated based on screen) */
  mobileWidth?: number | string;
}

export class Question extends Box {
  private messageText: Box;
  private yesButton: Button;
  private noButton: Button;
  private buttonBox: Box;
  private _overlay?: Overlay;
  private _responsiveCleanup?: () => void;
  private _trapCleanup?: () => void;
  private _desktopWidth: number | string | undefined;
  private _mobileWidth: number | string | undefined;
  private _desktopButtonWidth: number = 10;
  private _mobileButtonWidth: number = 12;
  private _desktopButtonHeight: number = 3;
  private _mobileButtonHeight: number = MIN_TOUCH_HEIGHT;

  constructor(options: QuestionOptions = {}) {
    // Force fixed height - 'shrink' doesn't work well with nested elements
    const height = typeof options.height === 'number' ? options.height : 9;

    // If overlay is enabled, we'll reparent to the overlay later
    const originalParent = options.parent;
    const useOverlay = options.overlay || options.overlayOpacity !== undefined;

    super({
      ...options,
      parent: useOverlay ? undefined : originalParent,
      border: options.border || { type: 'line', fg: 'white', bg: 'blue' },
      label: options.title || options.label || ' Confirm ',
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
        transparent: true,  // Transparent background like blessed shadow demo
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
      this._overlay.append(this);
    }

    // Question text - centered at top
    // Use same bg as dialog for consistent appearance
    const dialogBg = options.style?.bg || 'blue';
    this.messageText = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: options.text || '',
      tags: true,
      align: 'center',
      valign: 'middle',
      style: {
        fg: options.style?.fg || 'white',
        bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
      },
    });

    // Button container for centering both buttons
    this.buttonBox = new Box({
      parent: this,
      bottom: 0,
      left: 'center',
      width: 22,
      height: 3,
      style: {
        bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
      },
    });

    // Yes button
    this.yesButton = new Button({
      parent: this.buttonBox,
      top: 0,
      left: 0,
      width: 10,
      height: 3,
      content: '[ Yes ]',
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

    // No button
    this.noButton = new Button({
      parent: this.buttonBox,
      top: 0,
      left: 12,
      width: 10,
      height: 3,
      content: '[ No ]',
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

    this.yesButton.on('press', () => {
      this.hide();
      this.emit('yes');
      this.emit('answer', true);
      this.emit('hide');
    });

    this.noButton.on('press', () => {
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Close on escape (same as No)
    this.key(['escape'], () => {
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Yes on enter/y
    this.key(['enter', 'y'], () => {
      this.hide();
      this.emit('yes');
      this.emit('answer', true);
      this.emit('hide');
    });

    // No on n
    this.key(['n'], () => {
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Tab between buttons
    this.key(['tab'], () => {
      const focused = this.screen?.getFocused?.();
      if (focused === this.yesButton) {
        this.noButton.focus();
      } else {
        this.yesButton.focus();
      }
      this.screen?.render();
    });

    // Arrow left/right navigation between buttons
    this.key(['left'], () => {
      this.yesButton.focus();
      this.screen?.render();
    });

    this.key(['right'], () => {
      this.noButton.focus();
      this.screen?.render();
    });

    // Store desktop dimensions for responsive toggling
    this._desktopWidth = options.width || 40;
    this._mobileWidth = options.mobileWidth;
  }

  /**
   * Display the question
   */
  ask(text?: string, callback?: (answer: boolean) => void): void {
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
    this.yesButton.focus();
    this.screen?.render();

    if (callback) {
      this.once('answer', callback);
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
   * Set question text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get question text
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
    this.yesButton.width = this._mobileButtonWidth;
    this.yesButton.height = this._mobileButtonHeight;
    this.noButton.width = this._mobileButtonWidth;
    this.noButton.height = this._mobileButtonHeight;

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
    this.yesButton.width = this._desktopButtonWidth;
    this.yesButton.height = this._desktopButtonHeight;
    this.noButton.width = this._desktopButtonWidth;
    this.noButton.height = this._desktopButtonHeight;

    // Restore button container width
    this.buttonBox.width = 22;

    if (this.screen) this.screen.render();
  }
}
