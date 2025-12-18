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

    // Initialize canvas context when attached
    const initCanvas = () => {
      if (this.ctx) return; // Already initialized
      this.calcSize();
      this._canvas = new InnerCanvas(this.canvasSize!.width, this.canvasSize!.height);
      this.ctx = this._canvas.getContext();

      if (this.options.data) {
        this.setData(this.options.data);
      }
    };

    // If already attached (parent was specified in options), initialize now
    if (this.screen) {
      initCanvas();
    }

    // Also listen for future attach events
    this.on('attach', initCanvas);
  }

  /**
   * Calculate canvas size based on widget dimensions
   * Braille characters are 2x4 pixels, so we multiply accordingly
   * Width must be multiple of 2, height must be multiple of 4
   */
  calcSize(): void {
    // Get widget dimensions, ensuring minimum sizes
    const widgetWidth = Math.max(8, this.width as number);
    const widgetHeight = Math.max(4, this.height as number);

    // Calculate canvas size
    let width = widgetWidth * 2 - 12;
    let height = widgetHeight * 4;

    // Ensure minimum canvas size
    width = Math.max(4, width);
    height = Math.max(4, height);

    // Round to required multiples (width: 2, height: 4)
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 4) * 4;

    this.canvasSize = { width, height };
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
   * Sync canvas content to element content
   * Call this after drawing operations to make content visible
   */
  syncContent(): void {
    if (this.ctx) {
      const frame = this.ctx._canvas.frame();
      super.setContent(frame);
    }
  }

  /**
   * Render the canvas
   */
  render(): any {
    if (!this.ctx) return super.render();

    this.syncContent();
    return super.render();
  }
}

/**
 * Factory function
 */
export function canvas(options: CanvasOptions = {}): Canvas {
  return new Canvas(options);
}
