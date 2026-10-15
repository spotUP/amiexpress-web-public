/**
 * PassBox - Password input widget with character masking
 */

import { Textbox } from './textbox';
import type { TextboxOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface PassBoxOptions extends TextboxOptions {
  mask?: string;
}

export class PassBox extends Textbox {
  private mask: string;

  constructor(options: PassBoxOptions = {}) {
    const { mask, ...textboxOptions } = options;

    super({
      ...textboxOptions,
      censor: true, // Enable censoring by default
    });

    this.mask = mask || '*';
  }

  /**
   * Set mask character
   */
  setMask(mask: string): void {
    this.mask = mask;
  }

  /**
   * Get mask character
   */
  getMask(): string {
    return this.mask;
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
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}
