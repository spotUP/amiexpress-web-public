/**
 * Canvas Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/canvas.js
 * Provides a canvas widget with Braille-based drawing
 *
 * Responsive features:
 * - Recalculates canvas size on breakpoint change
 */

import { Box } from './box';
import { Canvas as InnerCanvas, Context } from '../utils/contrib-utils/drawille-canvas';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface ContribCanvasOptions extends ElementOptions {
  data?: any;
}

/**
 * Canvas Widget
 * Box with Braille-based drawing canvas
 */
export class ContribCanvas extends Box {
  options: ContribCanvasOptions;
  protected _canvas?: InnerCanvas;
  protected ctx?: Context;
  protected canvasSize?: { width: number; height: number };

  constructor(options: ContribCanvasOptions = {}) {
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

  get type(): string {
    return 'canvas';
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
    // Recalculate canvas size for new dimensions
    this.calcSize();
    if (this._canvas && this.canvasSize) {
      this._canvas = new InnerCanvas(this.canvasSize.width, this.canvasSize.height);
      this.ctx = this._canvas.getContext();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}

/**
 * Factory function
 */
export function contribCanvas(options: ContribCanvasOptions = {}): ContribCanvas {
  return new ContribCanvas(options);
}
