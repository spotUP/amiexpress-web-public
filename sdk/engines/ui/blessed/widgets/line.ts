/**
 * Line - Horizontal or vertical line widget
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

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

    this.updateContent();
  }

  /**
   * Get line character based on type
   */
  private getLineChar(type: 'line' | 'heavy' | 'double' | 'ascii'): string {
    if (this.orientation === 'horizontal') {
      const chars = {
        line: '─',
        heavy: '━',
        double: '═',
        ascii: '-',
      };
      return chars[type];
    } else {
      const chars = {
        line: '│',
        heavy: '┃',
        double: '║',
        ascii: '|',
      };
      return chars[type];
    }
  }

  /**
   * Update line content
   */
  private updateContent(): void {
    if (this.orientation === 'horizontal') {
      const width = this.iwidth;
      this.setContent(this.lineChar.repeat(width));
    } else {
      const height = this.iheight;
      const lines: string[] = [];
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
}
