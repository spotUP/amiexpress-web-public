/**
 * ANSI-aware text utilities
 * Handles ANSI escape sequences in text for proper cursor positioning and length calculation
 */

import type { ANSIToken, ANSIColor } from '../types';

/**
 * ANSI escape sequence regex
 * Matches: ESC [ <params> <command>
 */
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Utility class for ANSI code handling
 */
export class ANSIUtils {
  /**
   * Strip all ANSI codes from text
   */
  static stripANSI(text: string): string {
    return text.replace(ANSI_REGEX, '');
  }

  /**
   * Calculate visual length (excluding ANSI codes)
   */
  static visualLength(text: string): number {
    return this.stripANSI(text).length;
  }

  /**
   * Get actual string position from visual column position
   * Accounts for ANSI codes that don't contribute to visual length
   */
  static getActualPosition(text: string, visualCol: number): number {
    let actualPos = 0;
    let visualPos = 0;

    while (actualPos < text.length && visualPos < visualCol) {
      // Check if we're at the start of an ANSI sequence
      if (text[actualPos] === '\x1b' && text[actualPos + 1] === '[') {
        // Skip the entire ANSI sequence
        let end = actualPos + 2;
        while (end < text.length && !/[a-zA-Z]/.test(text[end])) {
          end++;
        }
        end++; // Include the command letter
        actualPos = end;
      } else {
        // Regular character
        actualPos++;
        visualPos++;
      }
    }

    return actualPos;
  }

  /**
   * Get visual column from actual string position
   */
  static getVisualPosition(text: string, actualCol: number): number {
    let actualPos = 0;
    let visualPos = 0;

    while (actualPos < actualCol && actualPos < text.length) {
      if (text[actualPos] === '\x1b' && text[actualPos + 1] === '[') {
        // Skip ANSI sequence
        let end = actualPos + 2;
        while (end < text.length && !/[a-zA-Z]/.test(text[end])) {
          end++;
        }
        end++;
        actualPos = end;
      } else {
        actualPos++;
        visualPos++;
      }
    }

    return visualPos;
  }

  /**
   * Parse ANSI codes into structured tokens
   */
  static parseANSI(text: string): ANSIToken[] {
    const tokens: ANSIToken[] = [];
    let lastIndex = 0;

    const matches = text.matchAll(ANSI_REGEX);

    for (const match of matches) {
      const start = match.index!;

      // Add text before this ANSI code
      if (start > lastIndex) {
        tokens.push({
          type: 'text',
          content: text.substring(lastIndex, start),
          start: lastIndex,
          end: start,
        });
      }

      // Add ANSI code token
      const ansiCode = match[0];
      tokens.push({
        type: this.classifyANSI(ansiCode),
        content: ansiCode,
        start,
        end: start + ansiCode.length,
      });

      lastIndex = start + ansiCode.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      tokens.push({
        type: 'text',
        content: text.substring(lastIndex),
        start: lastIndex,
        end: text.length,
      });
    }

    return tokens;
  }

  /**
   * Classify ANSI code type
   */
  private static classifyANSI(code: string): 'reset' | 'color' | 'style' | 'ansi' {
    if (code === '\x1b[0m' || code === '\x1b[m') {
      return 'reset';
    }

    // Check for color codes (30-37, 40-47, 90-97, 100-107)
    const match = code.match(/\x1b\[([0-9;]+)m/);
    if (match) {
      const params = match[1].split(';').map(Number);
      for (const param of params) {
        if ((param >= 30 && param <= 37) || (param >= 40 && param <= 47) ||
            (param >= 90 && param <= 97) || (param >= 100 && param <= 107)) {
          return 'color';
        }
      }
    }

    // Style codes (1=bold, 2=dim, 4=underline, 5=blink, 7=reverse)
    if (code.match(/\x1b\[[1245 7]m/)) {
      return 'style';
    }

    return 'ansi';
  }

  /**
   * Insert ANSI code at visual position
   */
  static insertANSI(text: string, visualPosition: number, ansiCode: string): string {
    const actualPos = this.getActualPosition(text, visualPosition);
    return text.substring(0, actualPos) + ansiCode + text.substring(actualPos);
  }

  /**
   * Remove ANSI codes at visual position
   */
  static removeANSIAt(text: string, visualPosition: number): string {
    const actualPos = this.getActualPosition(text, visualPosition);

    // Check if there's an ANSI code at this position
    if (text[actualPos] === '\x1b' && text[actualPos + 1] === '[') {
      let end = actualPos + 2;
      while (end < text.length && !/[a-zA-Z]/.test(text[end])) {
        end++;
      }
      end++;
      return text.substring(0, actualPos) + text.substring(end);
    }

    return text;
  }

  /**
   * Standard ANSI color codes (16 colors)
   */
  static readonly colors: { [key: string]: ANSIColor } = {
    // Foreground colors
    black:   { name: 'Black',   fg: '\x1b[30m', bg: '\x1b[40m', sample: '\x1b[30m███\x1b[0m' },
    red:     { name: 'Red',     fg: '\x1b[31m', bg: '\x1b[41m', sample: '\x1b[31m███\x1b[0m' },
    green:   { name: 'Green',   fg: '\x1b[32m', bg: '\x1b[42m', sample: '\x1b[32m███\x1b[0m' },
    yellow:  { name: 'Yellow',  fg: '\x1b[33m', bg: '\x1b[43m', sample: '\x1b[33m███\x1b[0m' },
    blue:    { name: 'Blue',    fg: '\x1b[34m', bg: '\x1b[44m', sample: '\x1b[34m███\x1b[0m' },
    magenta: { name: 'Magenta', fg: '\x1b[35m', bg: '\x1b[45m', sample: '\x1b[35m███\x1b[0m' },
    cyan:    { name: 'Cyan',    fg: '\x1b[36m', bg: '\x1b[46m', sample: '\x1b[36m███\x1b[0m' },
    white:   { name: 'White',   fg: '\x1b[37m', bg: '\x1b[47m', sample: '\x1b[37m███\x1b[0m' },

    // Bright colors
    gray:          { name: 'Gray',          fg: '\x1b[90m', bg: '\x1b[100m', sample: '\x1b[90m███\x1b[0m' },
    brightRed:     { name: 'Bright Red',    fg: '\x1b[91m', bg: '\x1b[101m', sample: '\x1b[91m███\x1b[0m' },
    brightGreen:   { name: 'Bright Green',  fg: '\x1b[92m', bg: '\x1b[102m', sample: '\x1b[92m███\x1b[0m' },
    brightYellow:  { name: 'Bright Yellow', fg: '\x1b[93m', bg: '\x1b[103m', sample: '\x1b[93m███\x1b[0m' },
    brightBlue:    { name: 'Bright Blue',   fg: '\x1b[94m', bg: '\x1b[104m', sample: '\x1b[94m███\x1b[0m' },
    brightMagenta: { name: 'Bright Magenta',fg: '\x1b[95m', bg: '\x1b[105m', sample: '\x1b[95m███\x1b[0m' },
    brightCyan:    { name: 'Bright Cyan',   fg: '\x1b[96m', bg: '\x1b[106m', sample: '\x1b[96m███\x1b[0m' },
    brightWhite:   { name: 'Bright White',  fg: '\x1b[97m', bg: '\x1b[107m', sample: '\x1b[97m███\x1b[0m' },
  };

  /**
   * ANSI style codes
   */
  static readonly styles = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    underline: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
  };

  /**
   * Get color name from ANSI code
   */
  static getColorName(ansiCode: string): string | null {
    for (const [name, color] of Object.entries(this.colors)) {
      if (color.fg === ansiCode || color.bg === ansiCode) {
        return name;
      }
    }
    return null;
  }

  /**
   * Convert blessed color tags to ANSI codes
   * Example: "{red-fg}text{/}" -> "\x1b[31mtext\x1b[0m"
   */
  static blessedToANSI(text: string): string {
    let result = text;

    // Foreground colors
    for (const [name, color] of Object.entries(this.colors)) {
      const tag = `{${name}-fg}`;
      result = result.replace(new RegExp(tag, 'g'), color.fg);
    }

    // Background colors
    for (const [name, color] of Object.entries(this.colors)) {
      const tag = `{${name}-bg}`;
      result = result.replace(new RegExp(tag, 'g'), color.bg);
    }

    // Closing tag
    result = result.replace(/{\/}/g, this.styles.reset);

    return result;
  }

  /**
   * Convert ANSI codes to blessed color tags
   */
  static ansiToBlessed(text: string): string {
    let result = text;

    // Foreground colors
    for (const [name, color] of Object.entries(this.colors)) {
      result = result.replace(new RegExp(color.fg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `{${name}-fg}`);
    }

    // Background colors
    for (const [name, color] of Object.entries(this.colors)) {
      result = result.replace(new RegExp(color.bg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), `{${name}-bg}`);
    }

    // Reset
    result = result.replace(/\x1b\[0m/g, '{/}');

    return result;
  }

  /**
   * Validate ANSI code
   */
  static isValidANSI(code: string): boolean {
    return ANSI_REGEX.test(code);
  }

  /**
   * Extract all ANSI codes from text
   */
  static extractANSI(text: string): string[] {
    return Array.from(text.matchAll(ANSI_REGEX), match => match[0]);
  }

  /**
   * Count ANSI codes in text
   */
  static countANSI(text: string): number {
    return (text.match(ANSI_REGEX) || []).length;
  }

  /**
   * Get line without ANSI codes for editing
   */
  static getEditableLine(text: string): string {
    return this.stripANSI(text);
  }

  /**
   * Preserve ANSI codes when editing text
   * Returns new text with ANSI codes preserved from original
   */
  static preserveANSI(originalText: string, newText: string): string {
    // Extract ANSI codes from original
    const tokens = this.parseANSI(originalText);
    const ansiCodes = tokens.filter(t => t.type !== 'text');

    // If no ANSI codes, return new text as-is
    if (ansiCodes.length === 0) {
      return newText;
    }

    // Rebuild with ANSI codes at proportional positions
    let result = '';
    let newTextPos = 0;
    const originalVisualLength = this.visualLength(originalText);
    const newTextLength = newText.length;

    for (const ansiCode of ansiCodes) {
      const visualPos = this.getVisualPosition(originalText, ansiCode.start);
      const newPos = Math.floor((visualPos / originalVisualLength) * newTextLength);

      // Add text up to this position
      if (newPos > newTextPos) {
        result += newText.substring(newTextPos, newPos);
        newTextPos = newPos;
      }

      // Add ANSI code
      result += ansiCode.content;
    }

    // Add remaining text
    if (newTextPos < newText.length) {
      result += newText.substring(newTextPos);
    }

    return result;
  }
}
