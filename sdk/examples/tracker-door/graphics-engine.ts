/**
 * Simple Graphics Engine for Client Doors
 * Provides text-based graphics rendering for BBS doors
 */

import { AnsiColor } from '@amiexpress/bbs-door-sdk/client';

export class GraphicsEngine {
  private buffer: string = '';

  /**
   * Clear the screen with a background color
   */
  public clear(bgColor: AnsiColor = AnsiColor.BLACK): void {
    this.buffer = '';
    this.buffer += '\x1b[2J\x1b[H'; // Clear screen and move cursor to home
    this.buffer += `\x1b[${bgColor}m`; // Set background color
  }

  /**
   * Draw text at a specific position
   */
  public drawText(x: number, y: number, text: string, color: AnsiColor): void {
    this.buffer += `\x1b[${y};${x}H`; // Move cursor to position
    this.buffer += `\x1b[${color}m`; // Set color
    this.buffer += text;
    this.buffer += '\x1b[0m'; // Reset color
  }

  /**
   * Move cursor to position
   */
  public moveCursor(x: number, y: number): void {
    this.buffer += `\x1b[${y};${x}H`;
  }

  /**
   * Set foreground color
   */
  public setColor(color: AnsiColor): void {
    this.buffer += `\x1b[${color}m`;
  }

  /**
   * Reset color to default
   */
  public resetColor(): void {
    this.buffer += '\x1b[0m';
  }

  /**
   * Render the buffer and return it
   */
  public render(): string {
    const output = this.buffer;
    this.buffer = ''; // Clear buffer after rendering
    return output;
  }

  /**
   * Get current buffer without clearing
   */
  public getBuffer(): string {
    return this.buffer;
  }

  /**
   * Append raw ANSI codes to buffer
   */
  public appendRaw(ansi: string): void {
    this.buffer += ansi;
  }
}
