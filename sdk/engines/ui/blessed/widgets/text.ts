/**
 * Text widget - Simple text display (no border by default)
 */

import { Element } from '../core/element';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export class Text extends Element {
  constructor(options: ElementOptions = {}) {
    super({
      ...options,
      border: options.border !== undefined ? options.border : undefined,
    });
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
