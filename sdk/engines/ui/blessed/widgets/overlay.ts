/**
 * Overlay - Semi-transparent overlay widget
 *
 * For web connections: Uses actual CSS transparency via socket events
 * For telnet/SSH: Falls back to solid dark background
 *
 * Responsive features:
 * - Tap-to-dismiss on mobile (tap outside content to close)
 * - Adjustable mobile opacity
 * - Touch-friendly dismiss targets
 */

import { Box, BoxOptions } from './box';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

// Use String.fromCharCode(27) for ESC to survive Terser minification
const ESC = String.fromCharCode(27);

export interface OverlayOptions extends BoxOptions {
  opacity?: number;
  /** Enable tap-to-dismiss on mobile (default: true) */
  tapToDismiss?: boolean;
  /** Mobile opacity (default: 0.7, higher for visibility) */
  mobileOpacity?: number;
}

export class Overlay extends Box {
  private _overlayOpacity: number;
  private _desktopOpacity: number;
  private _mobileOpacity: number;
  private _overlayWidgetId: string;
  private _tapToDismiss: boolean;
  private _exclude?: { xi: number; yi: number; xl: number; yl: number };

  constructor(options: OverlayOptions = {}) {
    // Extract style without bg - Overlay uses no background for ANSI
    // The CSS overlay provides the visual dimming effect for web clients
    const { bg: _ignoredBg, ...styleWithoutBg } = options.style || {};

    super({
      ...options,
      top: options.top || 0,
      left: options.left || 0,
      width: options.width || '100%',
      height: options.height || '100%',
      focusable: true,  // Enable focus for key handling
      keyable: true,    // Enable key events
      clickable: true,  // Enable click events
      style: {
        bg: 'transparent',
        ...styleWithoutBg,
        // CSS overlay provides dimming for web, ANSI clients just see the modal on top
      },
    });

    this._desktopOpacity = options.opacity !== undefined ? options.opacity : 0.5;
    this._mobileOpacity = options.mobileOpacity !== undefined ? options.mobileOpacity : 0.7;
    this._overlayOpacity = this._desktopOpacity;
    this._overlayWidgetId = `overlay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this._tapToDismiss = options.tapToDismiss !== false;  // Default: enabled

    // Enable key handling
    this.enableKeys();

    // Auto-focus when shown - also emit web transparency event and trap focus (optional)
    this.on('show', () => {
      if (this.screen && this.options.trapFocus) {
        (this.screen as any).trapFocus(this);
      }
      this._emitOverlayWidgetEvent(true);
      if (this.screen) {
        this.screen.render();
      }
    });

    // Emit hide event for web transparency and release focus trap
    this.on('hide', () => {
      if (this.screen && this.options.trapFocus) {
        (this.screen as any).releaseFocusTrap(this);
      }
      this._emitOverlayWidgetEvent(false);
    });

    // Default escape handler to hide overlay
    this.key(['escape'], () => {
      this.hide();
      this.emit('cancel');
      if (this.screen) {
        this.screen.render();
      }
    });

    // Tap-to-dismiss: click on overlay background (not children) to dismiss
    this.on('click', (data: any) => {
      if (!this._tapToDismiss) return;

      // Check if click was on the overlay itself (not a child)
      // This allows modal content to be clickable without dismissing
      const target = data?.el || data?.element;
      if (target === this || target === undefined) {
        this.hide();
        this.emit('dismiss');
        if (this.screen) {
          this.screen.render();
        }
      }
    });

    // Update overlay position on screen resize (for web clients)
    this.on('attach', () => {
      if (this.screen) {
        this.screen.on('resize', () => {
          // Only update if overlay is visible
          if (!this.hidden) {
            this._emitOverlayWidgetEvent(true);
          }
        });
      }
    });
  }

  /**
   * A MODAL DOES NOT DIM THE SCREEN. A terminal cannot.
   *
   * "the modals dim the screen that is not possible in a bbs" (sysop,
   * 2026-09-16), and he is right twice over.
   *
   * A cell has a foreground, a background and an attribute. There is no
   * alpha, so there is no dimming anything: the only way to make a cell
   * look darker is to REPAINT it, which means deciding what it now says.
   * What this used to do instead was send the browser an OSC
   * `9999;overlay` and let CSS draw a translucent rectangle over the
   * canvas - a effect of the web client, not of the door.
   *
   * Which is the second problem. A caller on telnet, on SSH, or on a C64
   * never got it, so the same door looked like two different doors
   * depending on how somebody dialled in, and the one that looked
   * 'right' was the one no BBS can actually produce.
   *
   * So nothing is emitted. The overlay stays exactly what it is in a
   * terminal - a widget that catches clicks and holds focus while a
   * modal is up - and a modal is what it always was on a BBS: a framed
   * box drawn over the screen. The frontend's handler for the sequence
   * is left in place and simply never hears from us again.
   */
  private _emitOverlayWidgetEvent(_show: boolean): void {
    /* Deliberately empty - see above. */
  }

  /**
   * The opacity this overlay was configured with.
   *
   * Kept because doors and widgets read it, but it no longer reaches a
   * screen: a terminal cell has no alpha, so nothing dims. See
   * `_emitOverlayWidgetEvent`.
   */
  get opacity(): number {
    return this._overlayOpacity;
  }

  /**
   * Set overlay opacity (0-1)
   */
  setOpacity(opacity: number): void {
    this._overlayOpacity = Math.max(0, Math.min(1, opacity));
    if (this.screen && !this.hidden) {
      this._emitOverlayWidgetEvent(true);
      this.screen.render();
    }
  }

  /**
   * Get overlay opacity (legacy method)
   */
  getOpacity(): number {
    return this._overlayOpacity;
  }

  /**
   * Mark a region (in terminal cell coordinates) that should NOT be dimmed.
   * Used by ConfirmModal so the dialog area punches through the CSS overlay.
   * Pass undefined to clear the cutout.
   */
  setExclude(bounds: { xi: number; yi: number; xl: number; yl: number } | undefined): void {
    this._exclude = bounds;
    if (this.screen && !this.hidden) {
      this._emitOverlayWidgetEvent(true);
    }
  }

  /**
   * Show overlay with fade in effect
   */
  fadeIn(duration: number = 300, callback?: () => void): void {
    const steps = 20;
    const stepDuration = duration / steps;
    const opacityStep = this.opacity / steps;

    let currentOpacity = 0;
    const interval = setInterval(() => {
      currentOpacity += opacityStep;
      if (currentOpacity >= this.opacity) {
        currentOpacity = this.opacity;
        clearInterval(interval);
        if (callback) callback();
      }
      if (this.screen) {
        this.screen.render();
      }
    }, stepDuration);

    this.show();
  }

  /**
   * Hide overlay with fade out effect
   */
  fadeOut(duration: number = 300, callback?: () => void): void {
    const steps = 20;
    const stepDuration = duration / steps;
    const opacityStep = this.opacity / steps;

    let currentOpacity = this.opacity;
    const interval = setInterval(() => {
      currentOpacity -= opacityStep;
      if (currentOpacity <= 0) {
        currentOpacity = 0;
        clearInterval(interval);
        this.hide();
        if (callback) callback();
      }
      if (this.screen) {
        this.screen.render();
      }
    }, stepDuration);
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle resize - update overlay dimensions
   */
  protected _handleResize(width: number, height: number, state: ResponsiveState): void {
    // Call parent resize handler
    super._handleResize(width, height, state);

    // Update overlay event for web clients
    if (!this.hidden) {
      this._emitOverlayWidgetEvent(true);
    }
  }

  /**
   * Handle breakpoint change - adjust opacity
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    // Call parent handler
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);

    // Update opacity based on breakpoint
    if (state.isMobile) {
      this._overlayOpacity = this._mobileOpacity;
    } else {
      this._overlayOpacity = this._desktopOpacity;
    }

    // Update overlay event if visible
    if (!this.hidden) {
      this._emitOverlayWidgetEvent(true);
    }

    // Emit for custom handling
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - increase opacity for visibility
   */
  protected _enterMobileMode(): void {
    this._overlayOpacity = this._mobileOpacity;
    if (!this.hidden) {
      this._emitOverlayWidgetEvent(true);
    }
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - restore desktop opacity
   */
  protected _exitMobileMode(): void {
    this._overlayOpacity = this._desktopOpacity;
    if (!this.hidden) {
      this._emitOverlayWidgetEvent(true);
    }
    this.emit('exit-mobile');
  }

  /**
   * Enable/disable tap-to-dismiss
   */
  setTapToDismiss(enabled: boolean): void {
    this._tapToDismiss = enabled;
  }

  /**
   * Check if tap-to-dismiss is enabled
   */
  isTapToDismissEnabled(): boolean {
    return this._tapToDismiss;
  }

  /**
   * Set mobile opacity
   */
  setMobileOpacity(opacity: number): void {
    this._mobileOpacity = Math.max(0, Math.min(1, opacity));
    if (this.isMobile() && !this.hidden) {
      this._overlayOpacity = this._mobileOpacity;
      this._emitOverlayWidgetEvent(true);
    }
  }

  /**
   * Set desktop opacity
   */
  setDesktopOpacity(opacity: number): void {
    this._desktopOpacity = Math.max(0, Math.min(1, opacity));
    if (!this.isMobile() && !this.hidden) {
      this._overlayOpacity = this._desktopOpacity;
      this._emitOverlayWidgetEvent(true);
    }
  }
}
