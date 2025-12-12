/**
 * Canvas Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/canvas.js
 * Provides a canvas widget with Braille-based drawing
 */

import { Box } from '../../widgets/box';
import { Canvas as InnerCanvas, Context } from '../utils/drawille-canvas';
import type { ElementOptions } from '../../core/types';

export interface CanvasOptions extends ElementOptions {
  data?: any;
}

/**
 * Canvas Widget
 * Box with Braille-based drawing canvas
 */
export class Canvas extends Box {
  options: CanvasOptions;
  _canvas?: InnerCanvas;
  ctx?: Context;
  canvasSize?: { width: number; height: number };

  constructor(options: CanvasOptions = {}) {
    super(options);
    this.options = options;

    this.on('attach', () => {
      this.calcSize();

      this._canvas = new InnerCanvas(this.canvasSize!.width, this.canvasSize!.height);
      this.ctx = this._canvas.getContext();

      if (this.options.data) {
        this.setData(this.options.data);
      }
    });
  }

  /**
   * Calculate canvas size based on widget dimensions
   * Braille characters are 2x4 pixels, so we multiply accordingly
   */
  calcSize(): void {
    this.canvasSize = {
      width: (this.width as number) * 2 - 12,
      height: (this.height as number) * 4
    };
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvasSize!.width, this.canvasSize!.height);
    }
  }

  /**
   * Set data (override in subclasses)
   */
  setData(data: any): void {
    // Override in subclasses
  }

  /**
   * Render the canvas
   */
  render(): any {
    if (!this.ctx) return super.render();

    const inner = this.ctx._canvas.frame();
    this.setContent(inner);
    return super.render();
  }
}

/**
 * Factory function
 */
export function canvas(options: CanvasOptions = {}): Canvas {
  return new Canvas(options);
}
