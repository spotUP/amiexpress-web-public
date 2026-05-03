/**
 * Modem Speed Emulator
 *
 * Throttles terminal output to simulate classic modem speeds.
 * Queues output and sends it at the configured baud rate.
 */

import { Socket } from 'socket.io';

export interface ModemEmulatorOptions {
  bps: number;  // Bits per second (1200, 2400, 9600, etc.)
}

export class ModemEmulator {
  private socket: Socket;
  private bps: number = 0;
  private bytesPerSecond: number = 0;
  private queue: string[] = [];
  private processing: boolean = false;
  private enabled: boolean = false;
  private directEmit: (event: string, ...args: any[]) => boolean;  // The raw socket emit, bypassing all wrappers
  private startTime: bigint = BigInt(0);
  private bytesSent: number = 0;

  constructor(socket: Socket) {
    this.socket = socket;
    // Store the TRUE original emit before any wrappers
    this.directEmit = (socket as any)._directEmit || socket.emit.bind(socket);
    if (!(socket as any)._directEmit) {
      (socket as any)._directEmit = this.directEmit;
    }
  }

  /**
   * Enable modem emulation at specified baud rate
   */
  enable(bps: number): void {
    this.bps = bps;
    // 10 bits per byte (1 start + 8 data + 1 stop)
    this.bytesPerSecond = Math.max(1, Math.floor(bps / 10));
    this.enabled = bps > 0;
    this.startTime = process.hrtime.bigint();
    this.bytesSent = 0;

console.log(`[ModemEmulator] enable() called with bps=${bps}, enabled=${this.enabled}, bytesPerSecond=${this.bytesPerSecond}`);
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
  }

  /**
   * Wait for queue to drain with throttling intact
   * Use this before disabling to preserve animation timing
   */
  async drain(): Promise<void> {
    // Wait for processing to complete
    while (this.processing || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Check if queue has pending data
   */
  hasPendingData(): boolean {
    return this.queue.length > 0 || this.processing;
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
    // WIRE_TRACE=1 — log UTF-8 hex around any high-bit codepoint (>=U+0080) so
    // we can see whether server-side sends 0xC2 0xB7 intact. Used to diagnose
    // the FLT-logo `·` → `��` mojibake report (handoff #66). Off by default.
    if (process.env.WIRE_TRACE === '1') {
      for (let i = 0; i < data.length; i++) {
        const cp = data.codePointAt(i);
        if (cp !== undefined && cp >= 0x80 && cp <= 0xff) {
          const ctx = data.slice(Math.max(0, i - 4), i + 5);
          const utf8 = Buffer.from(ctx, 'utf-8');
          const hex = Array.from(utf8).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`[WIRE-TRACE] high-bit U+${cp.toString(16).padStart(4, '0')} at idx=${i}  ctx=${JSON.stringify(ctx)}  utf8=${hex}`);
          break; // log first occurrence per emit, not every char
        }
      }
    }

    if (!this.enabled) {
      // No throttling - send immediately
      this.directEmit('ansi-output', data);
      return;
    }

    // Reset token budget for a new burst after idle
    if (!this.processing && this.queue.length === 0) {
      this.startTime = process.hrtime.bigint();
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
      this.directEmit('ansi-output', data);
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
   * CRITICAL: Must slice at CHARACTER boundaries, not byte boundaries,
   * to avoid corrupting multi-byte UTF-8 characters like box-drawing (3 bytes each)
   */
  private async sendThrottled(payload: string): Promise<void> {
    if (!this.enabled || this.bytesPerSecond <= 0) {
      this.directEmit('ansi-output', payload);
      return;
    }

    // Tokenize ANSI so we never split escape sequences
    const tokens = this.tokenizeAnsi(payload);

    for (const tok of tokens) {
      const isEscape = tok.startsWith('\x1b');

      if (isEscape) {
        // Send ANSI escape sequences immediately (they're control codes)
        this.directEmit('ansi-output', tok);
        continue;
      }

      // Send visible characters with throttling
      // Use Array.from to properly split by Unicode code points (not bytes!)
      const chars = Array.from(tok);
      let charOffset = 0;

      while (charOffset < chars.length) {
        const now = process.hrtime.bigint();
        const elapsedMs = Number(now - this.startTime) / 1_000_000;
        const allowedBytes = Math.floor(this.bytesPerSecond * (elapsedMs / 1000));
        const available = Math.max(0, allowedBytes - this.bytesSent);

        if (available <= 0) {
          // Wait a bit for more budget
          await this.sleep(5);
          continue;
        }

        // Calculate how many characters we can send based on byte budget
        // Each character may be 1-4 bytes in UTF-8
        let chunkChars = 0;
        let chunkBytes = 0;
        const maxChars = Math.min(64, chars.length - charOffset); // Max 64 chars at a time

        while (chunkChars < maxChars && chunkBytes < available) {
          const char = chars[charOffset + chunkChars];
          const charBytes = Buffer.byteLength(char, 'utf-8');
          if (chunkBytes + charBytes > available && chunkChars > 0) {
            break; // Would exceed budget, stop here
          }
          chunkChars++;
          chunkBytes += charBytes;
        }

        if (chunkChars === 0) {
          // Not enough budget for even one character, wait
          await this.sleep(5);
          continue;
        }

        // Send the chunk (proper character boundaries preserved)
        const chunk = chars.slice(charOffset, charOffset + chunkChars).join('');
        this.directEmit('ansi-output', chunk);
        charOffset += chunkChars;
        this.bytesSent += chunkBytes;
      }
    }
  }

  /**
   * Tokenize string to separate ANSI escape sequences
   */
  private tokenizeAnsi(payload: string): string[] {
    const tokens: string[] = [];
    const ansiRegex = /\x1b\[[0-9;?]*[A-Za-z]/g;
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Install modem emulator as socket.emit wrapper
   * This intercepts all ansi-output events and throttles them
   */
  install(): void {
    const self = this;

    // Only wrap if not already wrapped
    if ((this.socket as any)._modemEmulatorInstalled) {
console.log(`[ModemEmulator] install() skipped - already installed`);
      return;
    }

console.log(`[ModemEmulator] install() - wrapping socket.emit`);

    // We use directEmit which was stored at construction time
    // This ensures we always send to the real socket
    this.socket.emit = ((event: string, ...args: any[]) => {
      if (event === 'ansi-output' && self.enabled && args.length > 0) {
        const data = args[0];
        if (typeof data === 'string') {
          // Log first intercept to confirm it's working (don't spam logs)
          if (!self.processing) {
console.log(`[ModemEmulator] Intercepting ansi-output (${data.length} bytes), throttling at ${self.bps} bps`);
          }
          self.write(data);
          return true;
        }
      }
      return self.directEmit(event, ...args);
    }) as any;

    (this.socket as any)._modemEmulatorInstalled = true;
    (this.socket as any)._modemEmulator = this;

    // _directEmit is exposed for code paths that legitimately need to send
    // a single byte to the wire bypassing the throttle queue (e.g. screen
    // wipes / slowmo timing emit their own per-frame chunks and must not
    // double-throttle). It is NOT used by 68K / AREXX doors anymore — those
    // throttle at the user's modem speed for 1:1 Amiga fidelity. Modern
    // TypeScript doors disable throttling outright via modemEmulator.disable()
    // on door entry (see handlers/door.handler.ts executeTypeScriptDoor).
    (this.socket as any)._directEmit = (event: string, ...args: any[]) => {
      return self.directEmit(event, ...args);
    };
console.log(`[ModemEmulator] install() complete - _directEmit provided for screen-wipe/slowmo paths`);
  }
}

/**
 * Get or create ModemEmulator for a socket
 */
export function getModemEmulator(socket: Socket): ModemEmulator {
  if ((socket as any)._modemEmulator) {
    return (socket as any)._modemEmulator;
  }
  const emulator = new ModemEmulator(socket);
  return emulator;
}
