/**
 * StackedGauge Widget
 * Displays multiple progress segments in a single bar
 *
 * Responsive features:
 * - Auto-updates on resize
 */

import { Box } from './box';
import type { StackedGaugeOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export class StackedGauge extends Box {
  private stack: { percent: number; color: string; label?: string }[] = [];
  private showLabel: boolean;

  constructor(options: StackedGaugeOptions) {
    super({
      border: 'line',
      height: 3,
      ...options,
    });

    this.stack = options.stack || [];
    this.showLabel = options.showLabel !== false;

    this.on('resize', () => this.updateContent());
    this.updateContent();
  }

  /**
   * Update the stack data
   */
  setStack(stack: { percent: number; color: string; label?: string }[]): void {
    this.stack = stack;
    this.updateContent();
  }

  private updateContent(): void {
    const pos = this._getCoords();
    if (!pos) return;

    const width = pos.xl - pos.xi - (this.options.border ? 2 : 0);
    if (width <= 0) return;

    let content = '';
    let totalPercent = 0;

    this.stack.forEach(segment => {
      const segmentWidth = Math.floor((width * segment.percent) / 100);
      const colorTag = `{${segment.color}-bg}`;
      content += `${colorTag}${' '.repeat(segmentWidth)}{/}`;
      totalPercent += segment.percent;
    });

    // Fill remaining space
    if (totalPercent < 100) {
      const remainingWidth = width - content.replace(/{[^}]*}/g, '').length;
      if (remainingWidth > 0) {
        content += ' '.repeat(remainingWidth);
      }
    }

    // Add labels if enabled
    if (this.showLabel && this.stack.length > 0) {
      let labels = '\n';
      this.stack.forEach(segment => {
        if (segment.label) {
          labels += `{${segment.color}-fg}${segment.label} (${segment.percent}%){/}  `;
        }
      });
      content += labels;
    }

    this.setContent(content);
    this.screen?.render();
  }

  get type(): string {
    return 'stacked-gauge';
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
    this.updateContent();
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}

/**
 * Factory function
 */
export function stackedGauge(options: StackedGaugeOptions): StackedGauge {
  return new StackedGauge(options);
}
