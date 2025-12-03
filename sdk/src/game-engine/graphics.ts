import { ANSIColor } from './types';

/**
 * ANSI Graphics system for drawing shapes and text
 */
export class ANSIGraphics {
  private socket: any;
  private width: number;
  private height: number;
  private buffer: string[][];

  constructor(socket: any, width: number = 80, height: number = 24) {
    this.socket = socket;
    this.width = width;
    this.height = height;
    this.buffer = [];
    this.initBuffer();
  }

  /**
   * Initialize the graphics buffer
   */
  private initBuffer(): void {
    this.buffer = [];
    for (let y = 0; y < this.height; y++) {
      this.buffer[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = ' ';
      }
    }
  }

  /**
   * Draw a line using Bresenham's algorithm
   */
  drawLine(x1: number, y1: number, x2: number, y2: number, char: string = '-'): void {
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
  drawRect(x: number, y: number, width: number, height: number, char: string = '#'): void {
    for (let i = 0; i < width; i++) {
      for (let j = 0; j < height; j++) {
        this.setPixel(x + i, y + j, char);
      }
    }
  }

  /**
   * Draw a filled rectangle
   */
  fillRect(x: number, y: number, width: number, height: number, char: string = '#'): void {
    this.drawRect(x, y, width, height, char);
  }

  /**
   * Draw a circle
   */
  drawCircle(centerX: number, centerY: number, radius: number, char: string = 'O'): void {
    for (let y = centerY - radius; y <= centerY + radius; y++) {
      for (let x = centerX - radius; x <= centerX + radius; x++) {
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distance <= radius && distance > radius - 1) {
          this.setPixel(x, y, char);
        }
      }
    }
  }

  /**
   * Draw text at position
   */
  drawText(x: number, y: number, text: string, color?: ANSIColor): void {
    for (let i = 0; i < text.length; i++) {
      this.setPixel(x + i, y, text[i]);
    }
  }

  /**
   * Set a single pixel in the buffer
   */
  setPixel(x: number, y: number, char: string): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.buffer[y][x] = char;
  }

  /**
   * Draw a character at position (alias for setPixel, for compatibility)
   * Note: Color parameter is accepted but not used in buffer-based rendering
   */
  drawChar(x: number, y: number, char: string, color?: ANSIColor): void {
    this.setPixel(x, y, char);
  }

  /**
   * Get a pixel from the buffer
   */
  getPixel(x: number, y: number): string {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return ' ';
    return this.buffer[y][x];
  }

  /**
   * Clear the graphics buffer
   */
  clear(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = ' ';
      }
    }
  }

  /**
   * Render the buffer to the screen
   */
  render(): void {
    let output = '\x1b[2J\x1b[H'; // Clear screen and home cursor

    for (let y = 0; y < this.height; y++) {
      output += this.buffer[y].join('') + '\r\n';
    }

    this.socket.emit('ansi-output', output);
  }

  /**
   * Get width
   */
  getWidth(): number {
    return this.width;
  }

  /**
   * Get height
   */
  getHeight(): number {
    return this.height;
  }
}
