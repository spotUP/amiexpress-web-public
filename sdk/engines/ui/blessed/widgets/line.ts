/**
 * Line - Horizontal or vertical line widget
 *
 * Responsive features:
 * - Auto-updates content on resize
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface LineOptions extends ElementOptions {
  orientation?: 'horizontal' | 'vertical';
  type?: 'line' | 'heavy' | 'double' | 'ascii';
  ch?: string;
}

export class Line extends Box {
  private orientation: 'horizontal' | 'vertical';
  private lineChar: string;

  constructor(options: LineOptions = {}) {
    const orientation = options.orientation || 'horizontal';
    
    super({
      ...options,
      width: orientation === 'horizontal' ? options.width || '100%' : options.width || 1,
      height: orientation === 'horizontal' ? options.height || 1 : options.height || '100%',
    });

    this.orientation = orientation;
    this.lineChar = options.ch || this.getLineChar(options.type || 'line');
    
    this.on('attach', () => {
      this.updateContent();
    });
    
    if (this.screen) {
      this.updateContent();
    }
  }

  /**
   * Get line character based on type
   */
  private getLineChar(type: string): string {
    if (this.orientation === 'horizontal') {
      const chars: any = {
        line: '-',
        heavy: '=',
        double: '=',
        ascii: '-',
      };
      return chars[type] || chars.line;
    } else {
      const chars: any = {
        line: '|',
        heavy: '|',
        double: '|',
        ascii: '|',
      };
      return chars[type] || chars.line;
    }
  }

  /**
   * Update line content
   */
  updateContent(): void {
    if (this.orientation === 'horizontal') {
      const width = this.iwidth || (typeof this.width === 'number' ? this.width : 0);
      this.setContent(this.lineChar.repeat(width));
    } else {
      const height = this.iheight || (typeof this.height === 'number' ? this.height : 0);
      const lines = [];
      for (let i = 0; i < height; i++) {
        lines.push(this.lineChar);
      }
      this.setContent(lines.join('\n'));
    }
  }

  /**
   * Set line character
   */
  setChar(ch: string): void {
    this.lineChar = ch;
    this.updateContent();
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Set line type
   */
  setType(type: 'line' | 'heavy' | 'double' | 'ascii'): void {
    this.lineChar = this.getLineChar(type);
    this.updateContent();
    if (this.screen) {
      this.screen.render();
    }
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
export function line(options: LineOptions = {}): Line {
  return new Line(options);
}
