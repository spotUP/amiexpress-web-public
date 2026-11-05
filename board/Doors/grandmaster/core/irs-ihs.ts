/**
 * IRS/IHS System
 *
 * Initial Rotation System (IRS): Rotate piece during spawn
 * Initial Hold System (IHS): Hold piece during spawn
 *
 * Allows buffering inputs during ARE (Appearance Delay)
 */

/**
 * Buffered input types
 */
export type BufferedInput =
  | { type: 'rotate_cw' }
  | { type: 'rotate_ccw' }
  | { type: 'rotate_180' }
  | { type: 'hold' };

/**
 * IRS/IHS Manager
 *
 * Handles input buffering during ARE
 */
export class IRSIHSManager {
  private bufferedInputs: BufferedInput[] = [];
  private maxBufferSize: number = 3;  // Maximum buffered inputs
  private inARE: boolean = false;

  /**
   * Start ARE period (piece spawning)
   */
  startARE(): void {
    this.inARE = true;
    this.bufferedInputs = [];
  }

  /**
   * End ARE period
   */
  endARE(): void {
    this.inARE = false;
  }

  /**
   * Buffer an input during ARE
   */
  bufferInput(input: BufferedInput): boolean {
    if (!this.inARE) {
      return false;
    }

    // Limit buffer size
    if (this.bufferedInputs.length >= this.maxBufferSize) {
      return false;
    }

    // Don't buffer duplicate rotations or holds
    if (input.type === 'hold') {
      // Only one hold per spawn
      if (this.bufferedInputs.some(i => i.type === 'hold')) {
        return false;
      }
    }

    this.bufferedInputs.push(input);
    return true;
  }

  /**
   * Get buffered rotation (for IRS)
   * Returns total rotation amount
   */
  getBufferedRotation(): number {
    let rotation = 0;

    for (const input of this.bufferedInputs) {
      if (input.type === 'rotate_cw') {
        rotation += 1;
      } else if (input.type === 'rotate_ccw') {
        rotation -= 1;
      } else if (input.type === 'rotate_180') {
        rotation += 2;
      }
    }

    // Normalize to 0-3
    return ((rotation % 4) + 4) % 4;
  }

  /**
   * Check if hold was buffered (for IHS)
   */
  hasBufferedHold(): boolean {
    return this.bufferedInputs.some(i => i.type === 'hold');
  }

  /**
   * Clear buffered inputs
   */
  clear(): void {
    this.bufferedInputs = [];
  }

  /**
   * Check if currently in ARE
   */
  isInARE(): boolean {
    return this.inARE;
  }

  /**
   * Get buffered inputs (for debugging)
   */
  getBufferedInputs(): BufferedInput[] {
    return [...this.bufferedInputs];
  }
}

/**
 * Input buffer for smooth gameplay
 *
 * Allows buffering inputs during lock delay and ARE
 */
export class InputBuffer {
  private buffer: Array<{ action: string; timestamp: number }> = [];
  private bufferWindow: number = 100;  // ms
  private maxBufferSize: number = 5;

  /**
   * Add action to buffer
   */
  add(action: string): void {
    const now = Date.now();

    // Remove old buffered inputs
    this.buffer = this.buffer.filter(
      item => now - item.timestamp < this.bufferWindow
    );

    // Add new input if room in buffer
    if (this.buffer.length < this.maxBufferSize) {
      this.buffer.push({ action, timestamp: now });
    }
  }

  /**
   * Consume buffered action
   */
  consume(action: string): boolean {
    const index = this.buffer.findIndex(item => item.action === action);
    if (index !== -1) {
      this.buffer.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Check if action is buffered
   */
  has(action: string): boolean {
    return this.buffer.some(item => item.action === action);
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get all buffered actions
   */
  getAll(): string[] {
    return this.buffer.map(item => item.action);
  }
}
