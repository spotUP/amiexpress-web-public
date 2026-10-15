/**
 * Output - ANSI Output Abstraction Layer
 *
 * Provides clean API for terminal output with ANSI escape codes
 */

import type { Socket } from 'socket.io';
import type { OutputAPI, AnsiColor, AnsiStyle } from './types';

export class Output implements OutputAPI {
  private socket: Socket;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  // ===== Basic Output =====

  async write(text: string): Promise<void> {
    this.socket.emit('ansi-output', text);
  }

  async writeLine(text: string): Promise<void> {
    this.socket.emit('ansi-output', text + '\r\n');
  }

  // ===== Screen Control =====

  async clear(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
  }

  async moveCursor(row: number, col: number): Promise<void> {
    this.socket.emit('ansi-output', `\x1b[${row};${col}H`);
  }

  async saveCursor(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[s');
  }

  async restoreCursor(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[u');
  }

  async hideCursor(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[?25l');
  }

  async showCursor(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[?25h');
  }

  async eraseToEndOfLine(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[K');
  }

  async eraseToEndOfScreen(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[J');
  }

  async scroll(lines: number): Promise<void> {
    const code = lines > 0 ? `\x1b[${lines}S` : `\x1b[${-lines}T`;
    this.socket.emit('ansi-output', code);
  }

  // ===== Color and Style =====

  async setForeground(color: AnsiColor): Promise<void> {
    this.socket.emit('ansi-output', `\x1b[0;3${color}m`);
  }

  async setBackground(color: AnsiColor): Promise<void> {
    this.socket.emit('ansi-output', `\x1b[4${color}m`);
  }

  async setStyle(style: AnsiStyle): Promise<void> {
    this.socket.emit('ansi-output', `\x1b[${style}m`);
  }

  async reset(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[0m');
  }

  // ===== Convenience Methods =====

  async coloredText(text: string, fg: AnsiColor, bg?: AnsiColor): Promise<void> {
    await this.setForeground(fg);
    if (bg !== undefined) {
      await this.setBackground(bg);
    }
    await this.write(text);
    await this.reset();
  }

  async centerText(text: string, width: number = 80): Promise<void> {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    await this.write(' '.repeat(padding) + text);
  }

  async box(text: string, width: number = 80): Promise<void> {
    const top = '+' + '-'.repeat(width - 2) + '+';
    const padded = '| ' + text.padEnd(width - 4) + ' |';
    const bottom = '+' + '-'.repeat(width - 2) + '+';

    await this.writeLine(top);
    await this.writeLine(padded);
    await this.writeLine(bottom);
  }

  async progressBar(current: number, total: number, width: number = 50): Promise<void> {
    const percent = Math.min(100, Math.max(0, Math.floor((current / total) * 100)));
    const filled = Math.floor((percent / 100) * width);
    const empty = width - filled;

    const bar = '[' + '='.repeat(filled) + ' '.repeat(empty) + ']';
    await this.write(`${bar} ${percent}%`);
  }
}
