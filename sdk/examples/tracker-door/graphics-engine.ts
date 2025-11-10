/**
 * Simple Graphics Helper for TrackerDoor
 *
 * Provides basic text-based rendering for the tracker interface.
 * For advanced graphics like visualizations, see the SDK's BrailleCanvas
 * and graphics engine modules.
 */

import { AnsiColor } from '@amiexpress/bbs-door-sdk/client';

/**
 * Simple graphics buffer for text-based UIs
 *
 * This is a minimal helper for basic text positioning and rendering.
 * For pixel-based graphics, use the SDK's BrailleCanvas with node-drawille.
 */
export class GraphicsEngine {
  private buffer: string = '';

  /**
   * Clear the screen
   */
  public clear(bgColor?: AnsiColor): void {
    this.buffer = '';
    this.buffer += '\x1b[2J\x1b[H'; // Clear screen and move cursor to home
  }

  /**
   * Draw text at a specific position (0-based coordinates)
   */
  public drawText(x: number, y: number, text: string, color?: AnsiColor): void {
    // ANSI escape sequences use 1-based positioning, so add 1 to both x and y
    this.buffer += `\x1b[${y + 1};${x + 1}H`; // Move cursor to position
    this.buffer += text;
  }

  /**
   * Move cursor to position (0-based coordinates)
   */
  public moveCursor(x: number, y: number): void {
    // ANSI escape sequences use 1-based positioning, so add 1 to both x and y
    this.buffer += `\x1b[${y + 1};${x + 1}H`;
  }

  /**
   * Set foreground color (deprecated - no-op for monochrome mode)
   */
  public setColor(color?: AnsiColor): void {
    // No-op: colors disabled
  }

  /**
   * Reset color to default (deprecated - no-op for monochrome mode)
   */
  public resetColor(): void {
    // No-op: colors disabled
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
