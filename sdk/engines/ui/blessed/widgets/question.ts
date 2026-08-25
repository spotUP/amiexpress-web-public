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

  /**
   * Give back the focus trap this dialog installed.
   *
   * Only ours: Screen.releaseFocusTrap(owner) ignores the call when another
   * modal has since taken the trap, so a dialog closing behind a newer one
   * cannot strand it.
   */
  /**
   * Show which button is active.
   *
   * The focus style is a background colour, which was reported as hard to
   * see: "it's hard to see which button is active". Arrows around the label
   * read clearly whatever the terminal's palette does.
   */
  private markFocusedButton(): void {
    const focused = this.screen?.getFocused?.();
    this.yesButton.setContent(focused === this.yesButton ? '> Yes <' : '[ Yes ]');
    this.noButton.setContent(focused === this.noButton ? '> No <' : '[ No ]');
  }

  private releaseTrap(): void {
    (this.screen as any)?.releaseFocusTrap?.(this);
    if (this._trapCleanup) {
      this._trapCleanup();
      this._trapCleanup = undefined;
    }
  }
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
    // One row, not three: the buttons no longer draw a frame around
    // themselves, so the row that holds them does not need the height a
    // border used to occupy.
    this.buttonBox = new Box({
      parent: this,
      bottom: 0,
      left: 'center',
      width: 22,
      height: 1,
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
      height: 1,
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
      height: 1,
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
      this.releaseTrap();
      this.hide();
      this.emit('yes');
      this.emit('answer', true);
      this.emit('hide');
    });

    this.noButton.on('press', () => {
      this.releaseTrap();
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Close on escape (same as No)
    this.key(['escape'], () => {
      this.releaseTrap();
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Yes on enter/y
    this.key(['enter', 'y'], () => {
      this.releaseTrap();
      this.hide();
      this.emit('yes');
      this.emit('answer', true);
      this.emit('hide');
    });

    // No on n
    this.key(['n'], () => {
      this.releaseTrap();
      this.hide();
      this.emit('no');
      this.emit('answer', false);
      this.emit('hide');
    });

    // Tab between buttons
    // Moving between the two buttons.
    //
    // All four arrows, because the buttons sit side by side but players
    // reach for up/down as readily as left/right - and up/down USED to work
    // only by accident, through Screen's generic focus navigation, while
    // left/right did the job twice (the handler moved focus AND the
    // unhandled key moved it again). Returning true stops the second move.
    const select = (button: any) => {
      button.focus();
      this.markFocusedButton();
      this.screen?.render();
      return true;
    };

    this.key(['tab'], () => {
      const focused = this.screen?.getFocused?.();
      return select(focused === this.yesButton ? this.noButton : this.yesButton);
    });

    this.key(['left'], () => select(this.yesButton));
    this.key(['up'], () => select(this.yesButton));
    this.key(['right'], () => select(this.noButton));
    this.key(['down'], () => select(this.noButton));

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
      // A REAL focus trap, not just a key filter. Screen consults
      // screen.focusTrap when it decides where an arrow key may move focus;
      // without it the arrows walked straight out of the dialog and into the
      // menu bar behind it while a confirmation was still waiting for an
      // answer ("I can still navigate to the menu with arrow keys when the
      // LiveChat quit dialog is showing", 2026-08-26).
      (this.screen as any).trapFocus?.(this);
      // Also trap navigation keys to prevent them from leaking to elements behind
      if (!this._trapCleanup) {
        this._trapCleanup = trapModalInput(this);
      }
    }

    this.show();
    this.setFront();
    this.yesButton.focus();
    this.markFocusedButton();
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
