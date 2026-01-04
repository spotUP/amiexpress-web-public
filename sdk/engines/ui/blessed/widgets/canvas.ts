/**
 * Canvas - Basic drawing canvas for custom rendering
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface CanvasOptions extends ElementOptions {
  fillChar?: string;
  clearChar?: string;
}

export class Canvas extends Box {
  protected buffer: string[][] = [];
  protected fillChar: string;
  protected clearChar: string;
  protected canvasWidth: number = 0;
  protected canvasHeight: number = 0;
  protected _dirty: boolean = false;
  private _renderTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CanvasOptions = {}) {
    const { fillChar, clearChar, ...boxOptions } = options;

    super(boxOptions);

    this.fillChar = fillChar || '*';
    this.clearChar = clearChar || ' ';

    // Initialize canvas buffer
    this.initializeBuffer();

    // Reinitialize buffer when attached to screen (for percentage-based dimensions)
    this.on('attach', () => {
      this.initializeBuffer();
    });
  }

  /**
   * Initialize canvas buffer
   * Accounts for borders and padding to use actual content area
   */
  private initializeBuffer(): void {
    // Try to get actual calculated dimensions from _getCoords
    const coords = (this as any)._getCoords?.();
    let width: number;
    let height: number;

    if (coords) {
      // Use actual rendered dimensions (content area)
      width = coords.xl - coords.xi;
      height = coords.yl - coords.yi;

      // Subtract borders
      if (this.options.border) {
        width -= 2;
        height -= 2;
      }
    } else {
      // Fallback to specified dimensions
      width = typeof this.width === 'number' ? this.width : 80;
      height = typeof this.height === 'number' ? this.height : 24;

      // Account for borders
      if (this.options.border) {
        width -= 2;
        height -= 2;
      }

      // Account for padding
      const padding = this.options.padding;
      if (padding) {
        if (typeof padding === 'number') {
          width -= padding * 2;
          height -= padding * 2;
        } else {
          width -= (padding.left || 0) + (padding.right || 0);
          height -= (padding.top || 0) + (padding.bottom || 0);
        }
      }
    }

    // Ensure positive dimensions
    this.canvasWidth = Math.max(1, width);
    this.canvasHeight = Math.max(1, height);

    this.buffer = [];
    for (let y = 0; y < this.canvasHeight; y++) {
      this.buffer[y] = [];
      for (let x = 0; x < this.canvasWidth; x++) {
        this.buffer[y][x] = this.clearChar;
      }
    }
  }

  /**
   * Set pixel at coordinates
   * @param autoRender - If true (default), schedules a debounced render. Set to false for batch operations.
   */
  setPixel(x: number, y: number, char: string = this.fillChar, autoRender: boolean = true): void {
    if (x >= 0 && x < this.canvasWidth && y >= 0 && y < this.canvasHeight) {
      this.buffer[y][x] = char;
      if (autoRender) {
        this._scheduleRender();
      }
    }
  }

  /**
   * Schedule a debounced render (16ms = ~60fps)
   */
  private _scheduleRender(): void {
    this._dirty = true;
    if (!this._renderTimeout) {
      this._renderTimeout = setTimeout(() => {
        this._renderTimeout = null;
        if (this._dirty) {
          this._dirty = false;
          this.render();
        }
      }, 16);
    }
  }

  /**
   * Get pixel at coordinates
   */
  getPixel(x: number, y: number): string | undefined {
    if (x >= 0 && x < this.canvasWidth && y >= 0 && y < this.canvasHeight) {
      return this.buffer[y][x];
    }
    return undefined;
  }

  /**
   * Clear the canvas
   */
  clearCanvas(): void {
    for (let y = 0; y < this.canvasHeight; y++) {
      for (let x = 0; x < this.canvasWidth; x++) {
        this.buffer[y][x] = this.clearChar;
      }
    }
    this.render();
  }

  /**
   * Draw a line from (x1, y1) to (x2, y2)
   */
  drawLine(x1: number, y1: number, x2: number, y2: number, char: string = this.fillChar): void {
    // Bresenham's line algorithm
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
      this.setPixel(x, y, char);

      if (x === x2 && y === y2) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /**
   * Draw a rectangle
   */
  drawRect(x: number, y: number, width: number, height: number, char: string = this.fillChar, filled: boolean = false): void {
    if (filled) {
      // Fill rectangle
      for (let dy = 0; dy < height; dy++) {
        for (let dx = 0; dx < width; dx++) {
          this.setPixel(x + dx, y + dy, char);
        }
      }
    } else {
      // Draw rectangle outline
      // Top and bottom
      for (let dx = 0; dx < width; dx++) {
        this.setPixel(x + dx, y, char);
        this.setPixel(x + dx, y + height - 1, char);
      }
      // Left and right
      for (let dy = 0; dy < height; dy++) {
        this.setPixel(x, y + dy, char);
        this.setPixel(x + width - 1, y + dy, char);
      }
    }
  }

  /**
   * Draw a circle
   */
  drawCircle(cx: number, cy: number, radius: number, char: string = this.fillChar): void {
    // Midpoint circle algorithm
    let x = radius;
    let y = 0;
    let err = 0;

    while (x >= y) {
      this.setPixel(cx + x, cy + y, char);
      this.setPixel(cx + y, cy + x, char);
      this.setPixel(cx - y, cy + x, char);
      this.setPixel(cx - x, cy + y, char);
      this.setPixel(cx - x, cy - y, char);
      this.setPixel(cx - y, cy - x, char);
      this.setPixel(cx + y, cy - x, char);
      this.setPixel(cx + x, cy - y, char);

      if (err <= 0) {
        y += 1;
        err += 2 * y + 1;
      }
      if (err > 0) {
        x -= 1;
        err -= 2 * x + 1;
      }
    }
  }

  /**
   * Draw text at position
   */
  drawText(x: number, y: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.setPixel(x + i, y, text[i]);
    }
  }

  /**
   * Fill area with character
   */
  fill(x: number, y: number, char: string = this.fillChar): void {
    // Flood fill algorithm
    const targetChar = this.getPixel(x, y);
    if (targetChar === char || targetChar === undefined) return;

    const stack: [number, number][] = [[x, y]];

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;

      if (cx < 0 || cx >= this.canvasWidth || cy < 0 || cy >= this.canvasHeight) continue;
      if (this.buffer[cy][cx] !== targetChar) continue;

      this.buffer[cy][cx] = char;

      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }
  }

  /**
   * Render canvas to content
   */
  render(): void {
    const lines = this.buffer.map(row => row.join(''));
    this.setContent(lines.join('\n'));

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get canvas dimensions
   */
  getCanvasSize(): { width: number; height: number } {
    return {
      width: this.canvasWidth,
      height: this.canvasHeight,
    };
  }
}
