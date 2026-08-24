/**
 * Button widget - Clickable button
 *
 * Responsive features:
 * - Touch-friendly minimum height on mobile (3 rows)
 * - Visual tap feedback (flash effect)
 * - Responsive padding
 */

import { Element } from '../core/element';
import type { ButtonOptions, KeyEvent, Colors } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';

export interface ExtendedButtonOptions extends ButtonOptions {
  /** Enable tap feedback flash (default: true) */
  tapFeedback?: boolean;
  /** Tap feedback duration in ms (default: 100) */
  tapFeedbackDuration?: number;
  /** Touch-friendly height on mobile (default: MIN_TOUCH_HEIGHT) */
  mobileHeight?: number;
  /** Inline mode: no borders, 1 row high (default: false) */
  inline?: boolean;
  /**
   * When true, this button's own bg/fg only show at full strength while
   * focused or hovered - while idle it renders muted gray instead. Use
   * for pure action buttons that sit in a row with other buttons (Leave,
   * Cancel, Force Start): a row of buttons each keeping their own
   * saturated color all the time reads as "everything is highlighted",
   * so only the current Tab target should be in color.
   *
   * Default false - a button whose color communicates persistent state
   * (e.g. a Ready/Not-Ready toggle set via `button.style.bg = ...`) must
   * keep showing that color regardless of focus, so this needs an
   * explicit opt-in rather than being on by default for every button.
   */
  ghostWhenIdle?: boolean;
}

export class Button extends Element {
  private _tapFeedback: boolean;
  private _tapFeedbackDuration: number;
  private _desktopHeight: number | string | undefined;
  private _mobileHeight: number;
  private _originalStyle: Colors;

  constructor(options: ExtendedButtonOptions = {}) {
    const baseStyle = options.style ?? {};
    const focusStyle = {
      fg: 'black',
      bg: 'yellow',
      ...(baseStyle.focus ?? {}),
    };
    const hoverStyle = {
      fg: 'black',
      bg: 'cyan',
      ...(baseStyle.hover ?? {}),
    };

    // Inline mode: no borders, no padding, compact 1-row buttons
    const isInline = options.inline === true;
    const isGhosted = options.ghostWhenIdle === true;

    super({
      focusable: true,
      clickable: true,
      keys: true,
      border: isInline ? undefined : 'line',
      align: 'center',
      valign: 'middle',
      padding: isInline ? { left: 0, right: 0, top: 0, bottom: 0 } : { left: 1, right: 1, top: 0, bottom: 0 },
      touchFriendly: !isInline,  // Inline buttons are compact, not touch-friendly
      ...options,
      style: {
        fg: baseStyle.fg ?? 'white',
        bg: baseStyle.bg ?? 'black',
        ...baseStyle,
        // Override AFTER the baseStyle spread so ghosting wins over
        // whatever fg/bg the caller asked for as this button's idle look.
        ...(isGhosted ? { fg: 'gray', bg: 'black' } : {}),
        focus: focusStyle,
        hover: hoverStyle,
      },
    });

    this._tapFeedback = options.tapFeedback !== false;  // Default: enabled
    this._tapFeedbackDuration = options.tapFeedbackDuration ?? 100;
    this._desktopHeight = options.height;
    this._mobileHeight = options.mobileHeight ?? MIN_TOUCH_HEIGHT;
    this._originalStyle = { ...this.style };

    // Key handlers
    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }

    // Mouse handlers
    if (options.mouse !== false) {
      this.on('click', this._onClick.bind(this));
      // Inline buttons need explicit mouse enabling for hit detection
      if (isInline) {
        this.enableMouse();
      }
    }

    // Focus/blur handlers - trigger re-render to show focus style
    this.on('focus', () => {
      if (this.screen) {
        this.screen.render();
      }
    });

    this.on('blur', () => {
      if (this.screen) {
        this.screen.render();
      }
    });
  }

  private _onKeypress(ch: any, key: KeyEvent): boolean {
    if (!this.focused) {
      return false;
    }

    if (key.name === 'enter' || key.name === 'space') {
      this.press();
      return true;
    }

    return false;
  }

  private _onClick(): void {
    this.press();
  }

  press(): void {
    // Show tap feedback
    if (this._tapFeedback) {
      this._showTapFeedback();
    }

    this.emit('press');
    this.emit('action');
  }

  /**
   * Show visual tap feedback (flash effect)
   */
  private _showTapFeedback(): void {
    // Save current style
    const currentBg = this.style.bg;
    const currentFg = this.style.fg;

    // Flash with inverted/highlight colors
    this.style.bg = 'white';
    this.style.fg = 'black';

    if (this.screen) {
      this.screen.render();
    }

    // Restore after duration
    setTimeout(() => {
      this.style.bg = currentBg;
      this.style.fg = currentFg;
      if (this.screen) {
        this.screen.render();
      }
    }, this._tapFeedbackDuration);
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle breakpoint change - adjust height
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    // Update height based on breakpoint
    if (state.isMobile) {
      this._setMobileHeight();
    } else {
      this._setDesktopHeight();
    }

    // Emit for custom handling
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - increase height for touch targets
   */
  protected _enterMobileMode(): void {
    this._setMobileHeight();
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - restore desktop height
   */
  protected _exitMobileMode(): void {
    this._setDesktopHeight();
    this.emit('exit-mobile');
  }

  /**
   * Set mobile-friendly height
   */
  private _setMobileHeight(): void {
    const currentHeight = typeof this.height === 'number' ? this.height : 1;
    if (currentHeight < this._mobileHeight) {
      this.height = this._mobileHeight;
      if (this.screen) {
        this.screen.render();
      }
    }
  }

  /**
   * Restore desktop height
   */
  private _setDesktopHeight(): void {
    if (this._desktopHeight !== undefined) {
      this.height = this._desktopHeight;
      if (this.screen) {
        this.screen.render();
      }
    }
  }

  /**
   * Enable/disable tap feedback
   */
  setTapFeedback(enabled: boolean): void {
    this._tapFeedback = enabled;
  }

  /**
   * Set tap feedback duration
   */
  setTapFeedbackDuration(duration: number): void {
    this._tapFeedbackDuration = duration;
  }
}
