import { ANSIColor, ANSIBackground, ANSIStyle } from './types';

/**
 * ANSI utility class for text formatting
 */
export class ANSI {
  static color(text: string, color: ANSIColor, background?: ANSIBackground): string {
    let code = `\x1b[${color}`;
    if (background) {
      code += `;${background}`;
    }
    code += 'm';
    return code + text + '\x1b[0m';
  }

  static style(text: string, style: ANSIStyle): string {
    return `\x1b[${style}m${text}\x1b[0m`;
  }

  static bold(text: string): string {
    return this.style(text, ANSIStyle.BOLD);
  }

  static underline(text: string): string {
    return this.style(text, ANSIStyle.UNDERLINE);
  }

  static reverse(text: string): string {
    return this.style(text, ANSIStyle.REVERSE);
  }

  static moveCursor(row: number, col: number): string {
    return `\x1b[${row};${col}H`;
  }

  static clearScreen(): string {
    return '\x1b[2J\x1b[H';
  }

  static hideCursor(): string {
    return '\x1b[?25l';
  }

  static showCursor(): string {
    return '\x1b[?25h';
  }

  static reset(): string {
    return '\x1b[0m';
  }
}
