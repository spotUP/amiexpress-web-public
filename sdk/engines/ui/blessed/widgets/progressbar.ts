/**
 * ProgressBar widget - Visual progress indicator
 */

import { Element } from '../core/element';
import type { ProgressBarOptions } from '../core/types';

export class ProgressBar extends Element {
  private filled: number = 0;
  private orientation: 'horizontal' | 'vertical' = 'horizontal';
  // Use space character - style.bg provides the fill color (Amiga-safe, no Unicode needed)
  private ch: string = ' ';
  private pch: string = ' ';

  constructor(options: ProgressBarOptions = {}) {
    super({
      border: 'line',
      // Default style: cyan fill on black background for visibility
      style: { bg: 'black', fg: 'cyan' },
      ...options,
    });

    this.filled = options.filled || options.value || 0;
    this.orientation = options.orientation || 'horizontal';
    // Space character with background color for Amiga compatibility
    this.ch = options.ch || ' ';
    this.pch = options.pch || ' ';

    this._updateContent();
  }

  private _updateContent(): void {
    const pos = this._getCoords();
    if (!pos) return;

    const padding = this.options.padding || 0;
    const border = this.options.border ? 1 : 0;

    const padLeft = typeof padding === 'number' ? padding : (padding as any).left || 0;
    const padTop = typeof padding === 'number' ? padding : (padding as any).top || 0;
    const padRight = typeof padding === 'number' ? padding : (padding as any).right || 0;
    const padBottom = typeof padding === 'number' ? padding : (padding as any).bottom || 0;

    const width = pos.xl - pos.xi - border * 2 - padLeft - padRight;
    const height = pos.yl - pos.yi - border * 2 - padTop - padBottom;

    // Get fill color from style (default cyan)
    const fillBg = (this.options.style as any)?.fg || 'cyan';

    if (this.orientation === 'horizontal') {
      const filledWidth = Math.floor((width * this.filled) / 100);
      // Use blessed tags for filled portion with background color (Amiga-safe)
      const filledPart = filledWidth > 0 ? `{${fillBg}-bg}${this.ch.repeat(filledWidth)}{/${fillBg}-bg}` : '';
      const emptyPart = this.pch.repeat(width - filledWidth);
      this.setContent(filledPart + emptyPart);
    } else {
      const filledHeight = Math.floor((height * this.filled) / 100);
      const lines: string[] = [];

      for (let i = 0; i < height; i++) {
        if (i < height - filledHeight) {
          lines.push(this.pch.repeat(width));
        } else {
          // Use blessed tags for filled portion with background color
          lines.push(`{${fillBg}-bg}${this.ch.repeat(width)}{/${fillBg}-bg}`);
        }
      }

      this.setContent(lines.join('\n'));
    }
  }

  setProgress(percent: number): void {
    this.filled = Math.max(0, Math.min(100, percent));
    this._updateContent();
    this.emit('progress', this.filled);
  }

  getProgress(): number {
    return this.filled;
  }

  progress(amount: number): void {
    this.setProgress(this.filled + amount);
  }

  reset(): void {
    this.setProgress(0);
  }
}
