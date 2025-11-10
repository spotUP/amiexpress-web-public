/**
 * Braille Graphics Engine - High-Resolution Terminal Graphics
 *
 * Uses the node-drawille (drawille) library for Unicode braille character rendering
 * at 2x4 resolution per character cell. Perfect for visualizations, VU meters,
 * waveforms, and spectrums.
 *
 * This module wraps the drawille library from https://github.com/madbence/node-drawille
 * to provide a consistent API for the AmiExpress SDK while using the battle-tested
 * drawille implementation.
 *
 * @example
 * ```typescript
 * import { BrailleCanvas } from '@amiexpress/sdk/engines/graphics';
 *
 * const canvas = new BrailleCanvas(80, 24);
 *
 * // Draw a sine wave
 * for (let x = 0; x < 160; x++) {
 *   const y = Math.sin(x / 10) * 20 + 48;
 *   canvas.set(x, Math.floor(y));
 * }
 *
 * door.sendAnsi(canvas.frame());
 * ```
 */

// Import the real node-drawille module
// @ts-ignore - drawille doesn't have TypeScript definitions
import Canvas from 'drawille';

export interface BrailleCanvasConfig {
  width?: number;
  height?: number;
  background?: string;
}

/**
 * Braille Canvas for high-resolution terminal graphics
 *
 * Wraps the node-drawille library to provide a pixel buffer using Unicode
 * braille characters (2x4 pixels per char) for smooth graphics at double
 * the resolution of standard terminal cells.
 */
export class BrailleCanvas {
  /** Internal drawille canvas */
  private canvas: any;

  /** Canvas width in pixels (not characters) */
  private width: number;

  /** Canvas height in pixels (not characters) */
  private height: number;

  /** Background character (not used by drawille but kept for API compatibility) */
  private background: string;

  constructor(width: number = 160, height: number = 96, config?: BrailleCanvasConfig) {
    this.width = width;
    this.height = height;
    this.background = config?.background || ' ';

    // Create drawille canvas - it auto-adjusts dimensions to multiples of 2 and 4
    this.canvas = new Canvas(width, height);
  }

  /**
   * Set a pixel at coordinates
   *
   * @param x - X coordinate (0 to width-1)
   * @param y - Y coordinate (0 to height-1)
   */
  set(x: number, y: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.canvas.set(x, y);
  }

  /**
   * Unset a pixel at coordinates
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  unset(x: number, y: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.canvas.unset(x, y);
  }

  /**
   * Toggle a pixel at coordinates
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  toggle(x: number, y: number): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.canvas.toggle(x, y);
  }

  /**
   * Get pixel state at coordinates
   * Note: drawille doesn't provide a get() method, so this is a workaround
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns true if pixel is set (approximation)
   */
  get(x: number, y: number): boolean {
    // drawille doesn't expose get(), so we approximate by toggling twice
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;

    // This is a limitation of drawille - we can't query individual pixels
    // For now, return false as a safe default
    return false;
  }

  /**
   * Clear the entire canvas
   */
  clear(): void {
    this.canvas.clear();
  }

  /**
   * Draw a line from (x0, y0) to (x1, y1)
   * Uses Bresenham's line algorithm
   *
   * @param x0 - Start X
   * @param y0 - Start Y
   * @param x1 - End X
   * @param y1 - End Y
   */
  drawLine(x0: number, y0: number, x1: number, y1: number): void {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.set(x0, y0);

      if (x0 === x1 && y0 === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /**
   * Draw a rectangle
   *
   * @param x - Left position
   * @param y - Top position
   * @param width - Width in pixels
   * @param height - Height in pixels
   * @param filled - Fill the rectangle
   */
  drawRect(x: number, y: number, width: number, height: number, filled: boolean = false): void {
    if (filled) {
      for (let py = y; py < y + height; py++) {
        for (let px = x; px < x + width; px++) {
          this.set(px, py);
        }
      }
    } else {
      // Top and bottom
      for (let px = x; px < x + width; px++) {
        this.set(px, y);
        this.set(px, y + height - 1);
      }
      // Left and right
      for (let py = y; py < y + height; py++) {
        this.set(x, py);
        this.set(x + width - 1, py);
      }
    }
  }

  /**
   * Draw a circle
   *
   * @param cx - Center X
   * @param cy - Center Y
   * @param radius - Radius in pixels
   * @param filled - Fill the circle
   */
  drawCircle(cx: number, cy: number, radius: number, filled: boolean = false): void {
    if (filled) {
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          if (x * x + y * y <= radius * radius) {
            this.set(cx + x, cy + y);
          }
        }
      }
    } else {
      // Midpoint circle algorithm
      let x = radius;
      let y = 0;
      let err = 0;

      while (x >= y) {
        this.set(cx + x, cy + y);
        this.set(cx + y, cy + x);
        this.set(cx - y, cy + x);
        this.set(cx - x, cy + y);
        this.set(cx - x, cy - y);
        this.set(cx - y, cy - x);
        this.set(cx + y, cy - x);
        this.set(cx + x, cy - y);

        y++;
        err += 1 + 2 * y;
        if (2 * (err - x) + 1 > 0) {
          x--;
          err += 1 - 2 * x;
        }
      }
    }
  }

  /**
   * Render canvas to string
   * Uses drawille's frame() method
   *
   * @returns String representation of canvas using braille characters
   */
  frame(): string {
    return this.canvas.frame();
  }

  /**
   * Get canvas dimensions in characters (not pixels)
   */
  getCharDimensions(): { width: number; height: number } {
    return {
      width: Math.ceil(this.width / 2),
      height: Math.ceil(this.height / 4),
    };
  }

  /**
   * Get canvas dimensions in pixels
   */
  getPixelDimensions(): { width: number; height: number } {
    return {
      width: this.width,
      height: this.height,
    };
  }
}

/**
 * VU Meter visualization using braille graphics
 */
export class BrailleVUMeter {
  private canvas: BrailleCanvas;
  private peakHold: number = 0;
  private peakDecay: number = 0.95;

  constructor(width: number = 40, height: number = 32) {
    this.canvas = new BrailleCanvas(width, height);
  }

  /**
   * Update VU meter with new level
   *
   * @param level - Audio level (0.0 to 1.0)
   * @returns Rendered VU meter
   */
  update(level: number): string {
    this.canvas.clear();

    const { width, height } = this.canvas.getPixelDimensions();

    // Update peak hold
    if (level > this.peakHold) {
      this.peakHold = level;
    } else {
      this.peakHold *= this.peakDecay;
    }

    // Draw level bar
    const barHeight = Math.floor(height * level);
    for (let y = height - barHeight; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.canvas.set(x, y);
      }
    }

    // Draw peak hold line
    const peakY = Math.floor(height * (1 - this.peakHold));
    for (let x = 0; x < width; x++) {
      this.canvas.set(x, peakY);
    }

    // Draw border
    this.canvas.drawRect(0, 0, width, height, false);

    return this.canvas.frame();
  }

  /**
   * Reset peak hold
   */
  resetPeak(): void {
    this.peakHold = 0;
  }
}

/**
 * Waveform visualization using braille graphics
 */
export class BrailleWaveform {
  private canvas: BrailleCanvas;
  private samples: number[] = [];

  constructor(width: number = 160, height: number = 32) {
    this.canvas = new BrailleCanvas(width, height);
  }

  /**
   * Update waveform with audio samples
   *
   * @param samples - Audio samples (-1.0 to 1.0)
   * @returns Rendered waveform
   */
  update(samples: number[]): string {
    this.canvas.clear();
    this.samples = samples;

    const { width, height } = this.canvas.getPixelDimensions();
    const centerY = Math.floor(height / 2);

    // Draw center line
    for (let x = 0; x < width; x++) {
      this.canvas.set(x, centerY);
    }

    // Draw waveform
    const step = samples.length / width;
    for (let x = 0; x < width; x++) {
      const index = Math.floor(x * step);
      const sample = samples[index] || 0;
      const y = centerY - Math.floor(sample * centerY);

      // Draw line from previous point
      if (x > 0) {
        const prevIndex = Math.floor((x - 1) * step);
        const prevSample = samples[prevIndex] || 0;
        const prevY = centerY - Math.floor(prevSample * centerY);
        this.canvas.drawLine(x - 1, prevY, x, y);
      }
    }

    return this.canvas.frame();
  }
}

/**
 * Spectrum analyzer visualization using braille graphics
 */
export class BrailleSpectrum {
  private canvas: BrailleCanvas;

  constructor(width: number = 160, height: number = 32) {
    this.canvas = new BrailleCanvas(width, height);
  }

  /**
   * Update spectrum with frequency data
   *
   * @param frequencies - Frequency magnitudes (0.0 to 1.0)
   * @returns Rendered spectrum
   */
  update(frequencies: number[]): string {
    this.canvas.clear();

    const { width, height } = this.canvas.getPixelDimensions();
    const barWidth = Math.max(1, Math.floor(width / frequencies.length));

    frequencies.forEach((magnitude, index) => {
      const x = index * barWidth;
      const barHeight = Math.floor(height * magnitude);

      // Draw bar from bottom up
      for (let y = height - barHeight; y < height; y++) {
        for (let bx = 0; bx < barWidth - 1; bx++) {
          if (x + bx < width) {
            this.canvas.set(x + bx, y);
          }
        }
      }
    });

    return this.canvas.frame();
  }
}

export default BrailleCanvas;
