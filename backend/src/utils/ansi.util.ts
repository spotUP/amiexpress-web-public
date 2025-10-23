/**
 * ANSI Formatting Utility Functions
 */

import { ANSI, LINE_ENDING } from '../constants/ansi-codes';

export class AnsiUtil {
  /**
   * Map color names to ANSI codes
   */
  private static readonly COLOR_MAP: { [key: string]: string } = {
    'black': ANSI.BLACK,
    'red': ANSI.RED,
    'green': ANSI.GREEN,
    'yellow': ANSI.YELLOW,
    'blue': ANSI.BLUE,
    'magenta': ANSI.MAGENTA,
    'cyan': ANSI.CYAN,
    'white': ANSI.WHITE,
  };

  /**
   * Colorize text with ANSI color code
   * @param text - Text to colorize
   * @param color - Color name (e.g., 'red', 'green') or ANSI code (e.g., '\x1b[31m')
   */
  static colorize(text: string, color: string): string {
    // If color is a name, map it to ANSI code; otherwise use it as-is
    const ansiCode = this.COLOR_MAP[color.toLowerCase()] || color;
    return `${ansiCode}${text}${ANSI.RESET}`;
  }

  /**
   * Format text in red (error messages)
   */
  static error(text: string): string {
    return this.colorize(text, ANSI.RED);
  }

  /**
   * Format text in green (success messages)
   */
  static success(text: string): string {
    return this.colorize(text, ANSI.GREEN);
  }

  /**
   * Format text in yellow (warnings)
   */
  static warning(text: string): string {
    return this.colorize(text, ANSI.YELLOW);
  }

  /**
   * Format text in cyan (headers/titles)
   */
  static header(text: string): string {
    return this.colorize(text, ANSI.CYAN);
  }

  /**
   * Format text in blue (info)
   */
  static info(text: string): string {
    return this.colorize(text, ANSI.BLUE);
  }

  /**
   * Clear the screen
   */
  static clearScreen(): string {
    return ANSI.CLEAR_SCREEN;
  }

  /**
   * Create a line with line ending
   */
  static line(text: string = ''): string {
    return `${text}${LINE_ENDING}`;
  }

  /**
   * Create a "Press any key to continue..." prompt
   */
  static pressKeyPrompt(): string {
    return this.line(this.success('Press any key to continue...'));
  }

  /**
   * Create a standardized prompt
   */
  static prompt(text: string): string {
    return `${text}${ANSI.RESET}`;
  }

  /**
   * Create a standardized error message with line endings
   */
  static errorLine(text: string): string {
    return this.line(this.error(text));
  }

  /**
   * Create a standardized success message with line endings
   */
  static successLine(text: string): string {
    return this.line(this.success(text));
  }

  /**
   * Create a standardized warning message with line endings
   */
  static warningLine(text: string): string {
    return this.line(this.warning(text));
  }

  /**
   * Create a header with decorative border
   */
  static headerBox(text: string): string {
    return this.line(this.header(`-= ${text} =-`));
  }

  /**
   * Format a menu option
   */
  static menuOption(key: string, description: string): string {
    return `${ANSI.GREEN}(${ANSI.YELLOW}${key}${ANSI.GREEN})${ANSI.CYAN}${description}${ANSI.RESET}`;
  }

  /**
   * Create a complex prompt with multiple color sections
   */
  static complexPrompt(parts: Array<{ text: string; color?: string }>): string {
    return parts.map(part =>
      part.color ? this.colorize(part.text, part.color) : part.text
    ).join('');
  }
}
