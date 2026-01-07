/**
 * Client-Side Modem Speed Emulator
 *
 * Throttles terminal output to simulate classic modem speeds.
 * Queues output and writes it to xterm.js at the configured baud rate.
 *
 * Unlike server-side throttling, client-side throttling works correctly
 * with Socket.IO/WebSocket which batch messages at the transport layer.
 */

import { Terminal } from '@xterm/xterm';

// Use String.fromCharCode(27) for ESC to survive Terser/Vite minification
// Terser strips literal \x1b from string constants during minification
const ESC = String.fromCharCode(27);

export interface ModemEmulatorOptions {
  bps: number; // Bits per second (1200, 2400, 9600, etc.)
}

export class ModemEmulator {
  private terminal: Terminal;
  private bps: number = 0;
  private bytesPerSecond: number = 0;
  private queue: string[] = [];
  private processing: boolean = false;
  private enabled: boolean = false;
  private startTime: number = 0;
  private bytesSent: number = 0;

  constructor(terminal: Terminal) {
    this.terminal = terminal;
  }

  /**
   * Enable modem emulation at specified baud rate
   */
  enable(bps: number): void {
    this.bps = bps;
    // 10 bits per byte (1 start + 8 data + 1 stop)
    this.bytesPerSecond = Math.max(1, Math.floor(bps / 10));
    this.enabled = bps > 0;
    this.startTime = performance.now();
    this.bytesSent = 0;

    console.log(
      `[ModemEmulator] Enabled at ${bps} bps (${this.bytesPerSecond} bytes/sec)`
    );
  }

  /**
   * Disable modem emulation (full speed)
   */
  disable(): void {
    this.enabled = false;
    this.bps = 0;
    this.bytesPerSecond = 0;
    // Flush any remaining queue immediately
    this.flushImmediate();
    console.log('[ModemEmulator] Disabled (full speed)');
  }

  /**
   * Check if emulation is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get current baud rate
   */
  getBps(): number {
    return this.bps;
  }

  /**
   * Queue data for throttled output
   */
  write(data: string): void {
    if (!this.enabled) {
      // No throttling - write immediately
      this.terminal.write(data);
      return;
    }

    // Reset token budget for a new burst after idle
    if (!this.processing && this.queue.length === 0) {
      this.startTime = performance.now();
      this.bytesSent = 0;
    }

    // Queue the data
    this.queue.push(data);

    // Start processing if not already
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Flush queue immediately (for disable/cleanup)
   */
  private flushImmediate(): void {
    while (this.queue.length > 0) {
      const data = this.queue.shift()!;
      this.terminal.write(data);
    }
  }

  /**
   * Process queue with throttling
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 && this.enabled) {
      const data = this.queue.shift()!;
      await this.sendThrottled(data);
    }

    this.processing = false;
  }

  /**
   * Send data with modem-speed throttling
   */
  private async sendThrottled(payload: string): Promise<void> {
    if (!this.enabled || this.bytesPerSecond <= 0) {
      this.terminal.write(payload);
      return;
    }

    // Tokenize ANSI so we never split escape sequences
    const tokens = this.tokenizeAnsi(payload);

    for (const tok of tokens) {
      const isEscape = tok.startsWith(ESC);

      if (isEscape) {
        // Send ANSI escape sequences immediately (they're control codes)
        this.terminal.write(tok);
        continue;
      }

      // Send visible characters with throttling
      let offset = 0;
      while (offset < tok.length) {
        const now = performance.now();
        const elapsedMs = now - this.startTime;
        const allowedBytes = Math.floor(this.bytesPerSecond * (elapsedMs / 1000));
        const available = Math.max(0, allowedBytes - this.bytesSent);

        if (available <= 0) {
          // Wait a bit for more budget
          await this.sleep(5);
          continue;
        }

        // Send a chunk (up to available budget, max 64 chars at a time for smoother output)
        const chunkSize = Math.min(available, tok.length - offset, 64);
        const chunk = tok.slice(offset, offset + chunkSize);
        this.terminal.write(chunk);
        offset += chunkSize;
        this.bytesSent += chunkSize;
      }
    }
  }

  /**
   * Tokenize string to separate ANSI escape sequences
   */
  private tokenizeAnsi(payload: string): string[] {
    const tokens: string[] = [];
    // Use ESC constant in regex to survive minification (same issue as string literals)
    const ansiRegex = new RegExp(ESC + '\\[[0-9;?]*[A-Za-z]', 'g');
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = ansiRegex.exec(payload)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(payload.slice(lastIndex, match.index));
      }
      tokens.push(match[0]);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < payload.length) {
      tokens.push(payload.slice(lastIndex));
    }

    return tokens;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
