/**
 * ANSI Formatting Utility Functions
 */

import { ANSI, LINE_ENDING } from '../constants/ansi-codes';

export class AnsiUtil {
  /**
   * Colorize text with ANSI color code
   */
  static colorize(text: string, color: string): string {
    return `${color}${text}${ANSI.RESET}`;
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
