import type { TypingUser } from '../types';

/** Keystroke handler for real-time char-by-char display */
export class KeystrokeHandler {
  private buffer = '';
  private onKeystroke: (char: string) => void;
  private onEnter: (message: string) => void;

  constructor(
    onKeystroke: (char: string) => void,
    onEnter: (message: string) => void
  ) {
    this.onKeystroke = onKeystroke;
    this.onEnter = onEnter;
  }

  /** Handle incoming keystroke */
  handle(data: string): void {
    if (data.length === 1 && data >= ' ' && data <= '~') {
      this.buffer += data;
      this.onKeystroke(data);
    } else if (data === '\x7f' || data === '\b') {
      if (this.buffer.length > 0) {
        this.buffer = this.buffer.slice(0, -1);
        this.onKeystroke('BACKSPACE');
      }
    } else if (data === '\r' || data === '\n') {
      if (this.buffer.trim()) {
        this.onEnter(this.buffer);
      }
      this.buffer = '';
    }
  }

  /** Get current buffer */
  getBuffer(): string {
    return this.buffer;
  }

  /** Clear buffer */
  clear(): void {
    this.buffer = '';
  }
}
