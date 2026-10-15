/**
 * Input - User Input Abstraction Layer
 *
 * Provides clean API for handling user input
 */

import type { InputAPI, KeyPress, SpecialKey } from './types';
import { Output } from './Output';

export class Input implements InputAPI {
  private bbsSession: any;
  private output: Output;
  private timeoutMs: number | null = null;

  constructor(bbsSession: any, output: Output) {
    this.bbsSession = bbsSession;
    this.output = output;
  }

  // ===== Timeout Management =====

  setTimeout(ms: number): void {
    this.timeoutMs = ms;
  }

  clearTimeout(): void {
    this.timeoutMs = null;
  }

  // ===== Core Input Methods =====

  async waitForKey(): Promise<KeyPress> {
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout | null = null;

      const handler = (data: string) => {
        if (timeout) clearTimeout(timeout);
        this.bbsSession.doorInputHandler = null;

        resolve(this.parseKeyPress(data));
      };

      this.bbsSession.doorInputHandler = handler;

      if (this.timeoutMs) {
        timeout = setTimeout(() => {
          this.bbsSession.doorInputHandler = null;
          reject(new Error('Input timeout'));
        }, this.timeoutMs);
      }
    });
  }

  async waitForKeyPress(key: string): Promise<void> {
    while (true) {
      const press = await this.waitForKey();
      if (press.key === key) {
        return;
      }
    }
  }

  async getChar(): Promise<string> {
    const press = await this.waitForKey();
    return press.key;
  }

  async getLine(prompt?: string, maxLength: number = 255): Promise<string> {
    if (prompt) {
      await this.output.write(prompt);
    }

    let input = '';

    while (true) {
      const press = await this.waitForKey();

      // Handle enter
      if (press.key === '\r' || press.key === '\n') {
        await this.output.writeLine('');
        return input;
      }

      // Handle backspace
      if (press.key === '\x7f' || press.key === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          await this.output.write('\b \b');
        }
        continue;
      }

      // Handle escape
      if (press.key === '\x1b') {
        return '';
      }

      // Handle printable characters
      if (press.key.length === 1 && press.key >= ' ' && press.key <= '~') {
        if (input.length < maxLength) {
          input += press.key;
          await this.output.write(press.key);
        }
      }
    }
  }

  async getYesNo(prompt?: string): Promise<boolean> {
    if (prompt) {
      await this.output.write(prompt + ' (Y/N): ');
    }

    while (true) {
      const press = await this.waitForKey();
      const key = press.key.toLowerCase();

      if (key === 'y') {
        await this.output.writeLine('Yes');
        return true;
      }
      if (key === 'n') {
        await this.output.writeLine('No');
        return false;
      }
    }
  }

  async getNumber(prompt?: string, min?: number, max?: number): Promise<number> {
    while (true) {
      const line = await this.getLine(prompt);
      const num = parseInt(line, 10);

      if (isNaN(num)) {
        await this.output.writeLine('Invalid number. Try again.');
        continue;
      }

      if (min !== undefined && num < min) {
        await this.output.writeLine(`Number must be at least ${min}.`);
        continue;
      }

      if (max !== undefined && num > max) {
        await this.output.writeLine(`Number must be at most ${max}.`);
        continue;
      }

      return num;
    }
  }

  async getChoice(prompt: string, choices: string[]): Promise<number> {
    await this.output.writeLine(prompt);
    choices.forEach((choice, i) => {
      this.output.writeLine(`${i + 1}. ${choice}`);
    });

    while (true) {
      const num = await this.getNumber('Choice: ', 1, choices.length);
      if (num >= 1 && num <= choices.length) {
        return num - 1;
      }
    }
  }

  // ===== Helper Methods =====

  private parseKeyPress(data: string): KeyPress {
    const press: KeyPress = {
      key: data,
      raw: data,
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
    };

    // Detect ctrl keys (ASCII 1-26)
    if (data.length === 1 && data.charCodeAt(0) >= 1 && data.charCodeAt(0) <= 26) {
      press.ctrl = true;
      press.key = String.fromCharCode(data.charCodeAt(0) + 96); // Convert to letter
    }

    // Detect alt keys (starts with ESC)
    if (data.length === 2 && data[0] === '\x1b') {
      press.alt = true;
      press.key = data[1];
    }

    return press;
  }
}
