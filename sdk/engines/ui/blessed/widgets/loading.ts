/**
 * Loading - Loading indicator / spinner widget
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 *
 * Responsive features:
 * - Automatically stays centered in responsive layouts
 * - Uses makeModalResponsive for breakpoint-aware positioning
 */

import { Box } from './box';
import { Overlay } from './overlay';
import { makeModalResponsive } from '../utils/modal-helpers';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface LoadingOptions extends ElementOptions {
  text?: string;
  spinner?: string[];
  interval?: number;
  overlay?: boolean;  // Enable overlay dimming (default opacity 0.5)
  overlayOpacity?: number;  // Custom overlay opacity (0-1)
}

export class Loading extends Box {
  private messageText: Box;
  private spinnerText: Box;
  private spinner: string[];
  private spinnerIndex: number = 0;
  private interval: number;
  private timer: any = null;
  private _overlay?: Overlay;
  private _responsiveCleanup?: () => void;

  constructor(options: LoadingOptions = {}) {
    // If overlay is enabled, we'll reparent to the overlay later
    const originalParent = options.parent;
    const useOverlay = options.overlay || options.overlayOpacity !== undefined;

    // Use 'transparent' for bg to inherit from parent dialog
    const dialogBg = options.style?.bg || 'black';

    super({
      ...options,
      parent: useOverlay ? undefined : originalParent,
      border: options.border || { type: 'line' },
      label: options.label || ' Loading ',
      width: options.width || '50%',
      height: options.height || 5,
      top: options.top || 'center',
      left: options.left || 'center',
      padding: options.padding || 1,
      hidden: true,
      focusable: false,
      shadow: false,  // Disable shadow - causes rendering issues
      ch: ' ',  // Fill character for solid background
      style: {
        ...options.style,
        bg: dialogBg,
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

    this.spinner = options.spinner || ['|', '/', '-', '\\'];  // ASCII spinner for terminal compatibility
    this.interval = options.interval || 80;

    // Loading message
    this.messageText = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: options.text || 'Please wait...',
      tags: true,
      align: 'center',
      style: {
        fg: options.style?.fg || 'white',
        bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
      },
    });

    // Spinner
    this.spinnerText = new Box({
      parent: this,
      top: 1,
      left: 'center',
      width: 3,
      height: 1,
      content: this.spinner[0],
      align: 'center',
      style: {
        fg: 'cyan',
        bg: dialogBg === 'transparent' ? 'transparent' : dialogBg,
      },
    });
  }

  /**
   * Start the loading animation
   */
  load(text?: string): void {
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

    this.show();
    this.setFront();

    // Start spinner animation
    this.startSpinner();
    this.screen?.render();
  }

  /**
   * Stop the loading animation and hide
   */
  stop(): void {
    this.stopSpinner();
    this.hide();
    this.screen?.render();
  }

  /**
   * Override hide to also hide overlay
   */
  hide(): void {
    super.hide();
    if (this._overlay) {
      this._overlay.hide();
    }
    // Don't cleanup responsive listener on hide - keep it for next show
  }

  /**
   * Start spinner animation
   */
  private startSpinner(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinner.length;
      this.spinnerText.setContent(this.spinner[this.spinnerIndex]);
      if (this.screen) {
        this.screen.render();
      }
    }, this.interval);
  }

  /**
   * Stop spinner animation
   */
  private stopSpinner(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Set loading text
   */
  setText(text: string): void {
    this.messageText.setContent(text);
  }

  /**
   * Get loading text
   */
  getText(): string {
    return this.messageText.getContent();
  }

  /**
   * Set custom spinner frames
   */
  setSpinner(frames: string[]): void {
    this.spinner = frames;
    this.spinnerIndex = 0;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.stopSpinner();
    if (this._responsiveCleanup) {
      this._responsiveCleanup();
      this._responsiveCleanup = undefined;
    }
    if (this._overlay) {
      this._overlay.destroy();
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
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    // Modal responsiveness already handled by makeModalResponsive
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}
