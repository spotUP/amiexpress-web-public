/**
 * ANSI Formatting Utility Functions
 */

import { ANSI, LINE_ENDING } from '../constants/ansi-codes';

/**
 * How far a scroll-clear scrolls: more than one screen, so nothing visible
 * survives on the glass and all of it lands in the caller's history.
 */
export const SCROLL_CLEAR_LINES = 30;

/**
 * THE CLEAR A CALLER'S TERMINAL SHOULD GET.
 *
 * `ESC[2J` erases the viewport and pushes NOTHING into the scrollback - in
 * xterm.js and in every real terminal - so each menu repaint threw the last
 * screen away and a caller could scroll back "a few lines" at best (the
 * sysop, 2026-09-24, and callers on telnet before him). Scrolling the screen
 * off instead puts it in the history of every client, telnet included,
 * without asking the client for anything.
 *
 * A C64 IS THE EXCEPTION and keeps the hard clear. It has no scrollback to
 * preserve, its clear is one byte (`$93`, which the transducer makes of
 * `ESC[2J`), and thirty newlines at forty columns would be thirty rows of
 * scrolling for nothing. Teletext the same.
 */
export function clearScreenFor(session: { petsciiMode?: boolean; texttvMode?: boolean } | null | undefined): string {
  const noScrollback = session?.petsciiMode === true || session?.texttvMode === true;
  return noScrollback ? ANSI.CLEAR_SCREEN : ('\r\n'.repeat(SCROLL_CLEAR_LINES) + '\x1b[H');
}

export class AnsiUtil {
  /**
   * What a caller is sent: the text itself, or - when the caller has turned
   * ANSI colour off with M (`ansiMode === false`) - the text with its SGR
   * colour codes removed.
   *
   * express.e keeps one global, `ansiColour` (express.e:118, flipped by
   * internalCommandM, 25239-25248), and `aePuts2` (1663-1690) runs every
   * string through `stripAnsi` (MiscFuncs.e:656) when it is FALSE. That strip
   * removes `ESC [ ... m` and leaves every other sequence (cursor moves)
   * alone, which is exactly `stripAnsiForPlainText`. Only strings are
   * filtered: binary payloads (ZMODEM) pass untouched. Called once, at the
   * innermost output choke of each transport, so nothing that writes can
   * route around it.
   */
  static forCaller<T>(session: { ansiMode?: boolean } | null | undefined, data: T): T | string {
    if (session?.ansiMode === false && typeof data === 'string') {
      return this.stripAnsiForPlainText(data);
    }
    return data;
  }

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
   * Clear the screen while preserving xterm.js scrollback history.
   *
   * ESC[2J erases the visible viewport without pushing content to the
   * scrollback buffer — previous output is permanently lost in xterm.js.
   * Instead we scroll 30 lines (> one screen height) so all visible content
   * moves into scrollback, then home the cursor. The screen appears blank
   * from the top but users can scroll up to see prior output.
   *
   * For animated transitions (screen-wipe.util.ts) that intentionally want a
   * hard clear use ANSI.CLEAR_SCREEN ('\x1b[2J\x1b[H') directly.
   */
  static clearScreen(): string {
    return '\r\n'.repeat(SCROLL_CLEAR_LINES) + '\x1b[H';
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

  /**
   * Strip ANSI codes from text to get visible length
   * Matches all ANSI escape sequences including colors, cursor movement, etc.
   */
  static stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  /**
   * Get visible length of text (excluding ANSI codes)
   */
  static visibleLength(text: string): number {
    return this.stripAnsi(text).length;
  }

  /**
   * Strip SGR color codes (used when ANSI is disabled for plain terminals)
   */
  static stripAnsiForPlainText(text: string): string {
    // Match sequences like \x1b[0m or \x1b[1;31m but do not touch cursor movement or positioning.
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Strip CSI SGR color codes (only the color/formatting sequences)
   */
  static stripColorCodes(text: string): string {
    return this.stripAnsiForPlainText(text);
  }

  /**
   * Pad text to right with spaces (ANSI-aware)
   * @param text - Text to pad (may contain ANSI codes)
   * @param width - Target visible width
   */
  static padRight(text: string, width: number): string {
    const visibleLen = this.visibleLength(text);
    const padding = Math.max(0, width - visibleLen);
    return text + ' '.repeat(padding);
  }

  /**
   * Pad text to left with spaces (ANSI-aware)
   * @param text - Text to pad (may contain ANSI codes)
   * @param width - Target visible width
   */
  static padLeft(text: string, width: number): string {
    const visibleLen = this.visibleLength(text);
    const padding = Math.max(0, width - visibleLen);
    return ' '.repeat(padding) + text;
  }

  /**
   * Center text with spaces (ANSI-aware)
   * @param text - Text to center (may contain ANSI codes)
   * @param width - Target visible width
   */
  static center(text: string, width: number): string {
    const visibleLen = this.visibleLength(text);
    const totalPadding = Math.max(0, width - visibleLen);
    const leftPadding = Math.floor(totalPadding / 2);
    const rightPadding = totalPadding - leftPadding;
    return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
  }
}
