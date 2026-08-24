/**
 * Box widget - Basic container with border support
 *
 * Responsive features:
 * - Breakpoint-aware padding (larger on desktop, smaller on mobile)
 * - Auto-resize handling
 * - Child layout recalculation on resize
 */

import { Element } from '../core/element';
import type { ElementOptions, Padding } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MOBILE_PADDING, DEFAULT_PADDING } from '../core/responsive-constants';

export interface BoxOptions extends ElementOptions {
  /** Responsive padding - different values per breakpoint */
  responsivePadding?: {
    xs?: number | Padding;
    small?: number | Padding;
    medium?: number | Padding;
    large?: number | Padding;
  };
}

export class Box extends Element {
  /** blessed-style widget kind; see Element.type. */
  get type(): string { return 'box'; }

  protected _responsivePadding?: BoxOptions['responsivePadding'];
  private _originalPadding?: number | Padding;

  constructor(options: BoxOptions = {}) {
    super(options);

    // Store responsive padding config
    if (options.responsivePadding) {
      this._responsivePadding = options.responsivePadding;
      this._originalPadding = options.padding;
    }
  }

  /**
   * Handle resize - update padding based on breakpoint
   */
  protected _handleResize(width: number, height: number, state: ResponsiveState): void {
    // Apply responsive padding if configured
    if (this._responsivePadding) {
      this._applyResponsivePadding(state.breakpoint);
    }

    // Notify children of resize
    this._notifyChildrenResize(width, height);
  }

  /**
   * Handle breakpoint change
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    // Apply responsive padding
    if (this._responsivePadding) {
      this._applyResponsivePadding(breakpoint);
    }

    // Emit event for custom handling
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Apply padding based on breakpoint
   */
  private _applyResponsivePadding(breakpoint: BreakpointName): void {
    if (!this._responsivePadding) return;

    let newPadding: number | Padding | undefined;

    // Try to get breakpoint-specific padding, fall back to smaller breakpoints
    switch (breakpoint) {
      case 'large':
        newPadding = this._responsivePadding.large ??
                     this._responsivePadding.medium ??
                     this._responsivePadding.small ??
                     this._responsivePadding.xs ??
                     this._originalPadding;
        break;
      case 'medium':
        newPadding = this._responsivePadding.medium ??
                     this._responsivePadding.small ??
                     this._responsivePadding.xs ??
                     this._originalPadding;
        break;
      case 'small':
        newPadding = this._responsivePadding.small ??
                     this._responsivePadding.xs ??
                     this._originalPadding;
        break;
      case 'xs':
        newPadding = this._responsivePadding.xs ?? this._originalPadding;
        break;
    }

    if (newPadding !== undefined) {
      this.options.padding = newPadding;
      // Trigger re-render to apply new padding
      if (this.screen) {
        this.screen.render();
      }
    }
  }

  /**
   * Notify all children of resize event
   */
  private _notifyChildrenResize(width: number, height: number): void {
    for (const child of this.children) {
      // Call child's resize handler if it exists
      if (typeof (child as any)._handleResize === 'function') {
        const state = this.getResponsiveState();
        if (state) {
          (child as any)._handleResize(width, height, state);
        }
      }
    }
  }

  /**
   * Set responsive padding configuration
   */
  setResponsivePadding(config: BoxOptions['responsivePadding']): void {
    this._responsivePadding = config;

    // Apply immediately if we have responsive state
    const state = this.getResponsiveState();
    if (state) {
      this._applyResponsivePadding(state.breakpoint);
    }
  }

  /**
   * Get current effective padding
   */
  getEffectivePadding(): number | Padding {
    return this.options.padding ?? 0;
  }

  /**
   * Helper to get default responsive padding (mobile-aware)
   */
  static getDefaultResponsivePadding(): BoxOptions['responsivePadding'] {
    return {
      xs: MOBILE_PADDING,
      small: MOBILE_PADDING,
      medium: DEFAULT_PADDING,
      large: DEFAULT_PADDING,
    };
  }
}
