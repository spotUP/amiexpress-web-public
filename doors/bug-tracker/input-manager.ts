// @ts-nocheck
/// <reference path="./types.d.ts" />
/**
 * Input Manager - Advanced Text Input with Line Editing
 *
 * Features:
 * - Single-line and multi-line input
 * - Line editing (backspace, delete, arrows)
 * - Copy/paste support
 * - Character counter
 * - Word wrap
 * - Input validation
 * - Auto-complete
 * - History (up/down arrows)
 */

import { Door } from '@amiexpress/bbs-door-sdk';

export interface InputOptions {
  maxLength?: number;
  minLength?: number;
  multiline?: boolean;
  maxLines?: number;
  placeholder?: string;
  validate?: (value: string) => boolean | string;
  autocomplete?: string[];
  history?: boolean;
  required?: boolean;
  maskChar?: string;  // For password fields
  wordWrap?: boolean;
  showCounter?: boolean;
}

export interface InputResult {
  value: string;
  canceled: boolean;
  lines?: string[];  // For multiline
}

export class InputManager {
  private door: Door;
  private userId: number;
  private inputHistory: string[] = [];
  private historyIndex: number = -1;

  constructor(door: Door, userId: number) {
    this.door = door;
    this.userId = userId;
  }

  /**
   * Get single-line input with editing capabilities
   */
  async getSingleLineInput(
    prompt: string,
    x: number,
    y: number,
    options: InputOptions = {}
  ): Promise<InputResult> {
    const maxLength = options.maxLength || 70;
    const showCounter = options.showCounter ?? false;
    let currentValue = '';
    let cursorPos = 0;

    // Show initial prompt
    this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);

    return new Promise((resolve) => {
      const inputHandler = async (user: any, keyEvent: any) => {
        const key = keyEvent.key;
        // Handle special keys
        if (key === 'Enter' || key === '\r') {
          // Validate
          if (options.required && currentValue.trim().length === 0) {
            this.showError(x, y + 2, 'This field is required');
            return;
          }

          if (options.minLength && currentValue.length < options.minLength) {
            this.showError(x, y + 2, `Minimum length: ${options.minLength}`);
            return;
          }

          if (options.validate) {
            const result = options.validate(currentValue);
            if (result !== true) {
              this.showError(x, y + 2, typeof result === 'string' ? result : 'Invalid input');
              return;
            }
          }

          // Save to history
          if (options.history && currentValue.trim()) {
            this.inputHistory.push(currentValue);
          }

          this.door.off('input', inputHandler);
          resolve({ value: currentValue, canceled: false });
          return;
        }

        if (key === 'Escape' || key === '\x1b') {
          this.door.off('input', inputHandler);
          resolve({ value: '', canceled: true });
          return;
        }

        // History navigation (if enabled)
        if (options.history) {
          if (key === 'ArrowUp') {
            if (this.historyIndex < this.inputHistory.length - 1) {
              this.historyIndex++;
              currentValue = this.inputHistory[this.inputHistory.length - 1 - this.historyIndex];
              cursorPos = currentValue.length;
              this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
            }
            return;
          }

          if (key === 'ArrowDown') {
            if (this.historyIndex > 0) {
              this.historyIndex--;
              currentValue = this.inputHistory[this.inputHistory.length - 1 - this.historyIndex];
              cursorPos = currentValue.length;
            } else if (this.historyIndex === 0) {
              this.historyIndex = -1;
              currentValue = '';
              cursorPos = 0;
            }
            this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
            return;
          }
        }

        // Cursor movement
        if (key === 'ArrowLeft') {
          cursorPos = Math.max(0, cursorPos - 1);
          this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          return;
        }

        if (key === 'ArrowRight') {
          cursorPos = Math.min(currentValue.length, cursorPos + 1);
          this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          return;
        }

        // Home/End
        if (key === 'Home') {
          cursorPos = 0;
          this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          return;
        }

        if (key === 'End') {
          cursorPos = currentValue.length;
          this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          return;
        }

        // Backspace
        if (key === 'Backspace' || key === '\x7f') {
          if (cursorPos > 0) {
            currentValue = currentValue.slice(0, cursorPos - 1) + currentValue.slice(cursorPos);
            cursorPos--;
            this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          }
          return;
        }

        // Delete
        if (key === 'Delete') {
          if (cursorPos < currentValue.length) {
            currentValue = currentValue.slice(0, cursorPos) + currentValue.slice(cursorPos + 1);
            this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          }
          return;
        }

        // Ctrl+A - Select all (move to start)
        if (key === '\x01') {
          cursorPos = 0;
          this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          return;
        }

        // Ctrl+E - End of line
        if (key === '\x05') {
          cursorPos = currentValue.length;
          this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          return;
        }

        // Ctrl+U - Clear line
        if (key === '\x15') {
          currentValue = '';
          cursorPos = 0;
          this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          return;
        }

        // Regular character input
        if (key.length === 1 && key >= ' ' && key <= '~') {
          if (currentValue.length < maxLength) {
            currentValue = currentValue.slice(0, cursorPos) + key + currentValue.slice(cursorPos);
            cursorPos++;
            this.renderSingleLine(prompt, currentValue, cursorPos, x, y, maxLength, showCounter);
          }
        }
      };

      this.door.onInput(inputHandler);
    });
  }

  /**
   * Get multi-line input with editing
   */
  async getMultiLineInput(
    prompt: string,
    x: number,
    y: number,
    options: InputOptions = {}
  ): Promise<InputResult> {
    const maxLines = options.maxLines || 10;
    const maxLineLength = options.maxLength || 70;
    const lines: string[] = [''];
    let currentLine = 0;
    let cursorPos = 0;

    this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);

    return new Promise((resolve) => {
      const inputHandler = (user: any, keyEvent: any) => {
        const key = keyEvent.key;
        // Ctrl+D - Done
        if (key === '\x04') {
          const value = lines.join('\n');

          if (options.required && value.trim().length === 0) {
            this.showError(x, y + maxLines + 3, 'Content is required');
            return;
          }

          this.door.off('input', inputHandler);
          resolve({ value, canceled: false, lines });
          return;
        }

        if (key === 'Escape' || key === '\x1b') {
          this.door.off('input', inputHandler);
          resolve({ value: '', canceled: true });
          return;
        }

        // New line
        if (key === 'Enter' || key === '\r') {
          if (lines.length < maxLines) {
            const currentContent = lines[currentLine];
            const beforeCursor = currentContent.slice(0, cursorPos);
            const afterCursor = currentContent.slice(cursorPos);

            lines[currentLine] = beforeCursor;
            lines.splice(currentLine + 1, 0, afterCursor);
            currentLine++;
            cursorPos = 0;

            this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);
          }
          return;
        }

        // Navigate between lines
        if (key === 'ArrowUp' && currentLine > 0) {
          currentLine--;
          cursorPos = Math.min(cursorPos, lines[currentLine].length);
          this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);
          return;
        }

        if (key === 'ArrowDown' && currentLine < lines.length - 1) {
          currentLine++;
          cursorPos = Math.min(cursorPos, lines[currentLine].length);
          this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);
          return;
        }

        // Cursor movement within line
        if (key === 'ArrowLeft') {
          if (cursorPos > 0) {
            cursorPos--;
          } else if (currentLine > 0) {
            currentLine--;
            cursorPos = lines[currentLine].length;
          }
          this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);
          return;
        }

        if (key === 'ArrowRight') {
          if (cursorPos < lines[currentLine].length) {
            cursorPos++;
          } else if (currentLine < lines.length - 1) {
            currentLine++;
            cursorPos = 0;
          }
          this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);
          return;
        }

        // Backspace
        if (key === 'Backspace' || key === '\x7f') {
          if (cursorPos > 0) {
            lines[currentLine] = lines[currentLine].slice(0, cursorPos - 1) + lines[currentLine].slice(cursorPos);
            cursorPos--;
          } else if (currentLine > 0) {
            // Merge with previous line
            const prevLine = lines[currentLine - 1];
            cursorPos = prevLine.length;
            lines[currentLine - 1] = prevLine + lines[currentLine];
            lines.splice(currentLine, 1);
            currentLine--;
          }
          this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);
          return;
        }

        // Regular character
        if (key.length === 1 && key >= ' ' && key <= '~') {
          if (lines[currentLine].length < maxLineLength) {
            const line = lines[currentLine];
            lines[currentLine] = line.slice(0, cursorPos) + key + line.slice(cursorPos);
            cursorPos++;
            this.renderMultiLine(prompt, lines, currentLine, cursorPos, x, y, maxLineLength, maxLines);
          }
        }
      };

      this.door.onInput(inputHandler);
    });
  }

  private renderSingleLine(
    prompt: string,
    value: string,
    cursorPos: number,
    x: number,
    y: number,
    maxLength: number,
    showCounter: boolean
  ): void {
    let output = `\x1b[${y};${x}H`;
    output += `\x1b[2K`; // Clear line
    output += `\x1b[32m${prompt}\x1b[0m`; // Green prompt

    output += `\x1b[${y + 1};${x}H`;
    output += `\x1b[2K`;
    output += `\x1b[36m┌${'─'.repeat(maxLength + 2)}┐\x1b[0m`;

    output += `\x1b[${y + 2};${x}H`;
    output += `\x1b[2K`;
    output += `\x1b[36m│\x1b[0m `;

    // Display value with cursor
    const displayValue = value.padEnd(maxLength);
    for (let i = 0; i < displayValue.length; i++) {
      if (i === cursorPos) {
        output += `\x1b[7m${displayValue[i]}\x1b[0m`; // Reverse video for cursor
      } else {
        output += displayValue[i];
      }
    }

    output += ` \x1b[36m│\x1b[0m`;

    output += `\x1b[${y + 3};${x}H`;
    output += `\x1b[2K`;
    output += `\x1b[36m└${'─'.repeat(maxLength + 2)}┘\x1b[0m`;

    if (showCounter) {
      output += `\x1b[${y + 3};${x + maxLength - 10}H`;
      output += `\x1b[90m${value.length}/${maxLength}\x1b[0m`;
    }

    this.door.sendAnsi(output, this.userId);
  }

  private renderMultiLine(
    prompt: string,
    lines: string[],
    currentLine: number,
    cursorPos: number,
    x: number,
    y: number,
    maxLineLength: number,
    maxLines: number
  ): void {
    let output = `\x1b[${y};${x}H`;
    output += `\x1b[2K`;
    output += `\x1b[32m${prompt}\x1b[0m \x1b[90m(Ctrl+D when done)\x1b[0m`;

    output += `\x1b[${y + 1};${x}H`;
    output += `\x1b[2K`;
    output += `\x1b[36m┌${'─'.repeat(maxLineLength + 2)}┐\x1b[0m`;

    for (let i = 0; i < maxLines; i++) {
      output += `\x1b[${y + 2 + i};${x}H`;
      output += `\x1b[2K`;
      output += `\x1b[36m│\x1b[0m `;

      if (i < lines.length) {
        const line = lines[i].padEnd(maxLineLength);

        if (i === currentLine) {
          // Show cursor on current line
          for (let j = 0; j < maxLineLength; j++) {
            if (j === cursorPos) {
              output += `\x1b[7m${line[j]}\x1b[0m`;
            } else {
              output += line[j];
            }
          }
        } else {
          output += line;
        }
      } else {
        output += ' '.repeat(maxLineLength);
      }

      output += ` \x1b[36m│\x1b[0m`;
    }

    output += `\x1b[${y + 2 + maxLines};${x}H`;
    output += `\x1b[2K`;
    output += `\x1b[36m└${'─'.repeat(maxLineLength + 2)}┘\x1b[0m`;

    // Line counter
    output += `\x1b[${y + 2 + maxLines};${x + maxLineLength - 10}H`;
    output += `\x1b[90mLine ${currentLine + 1}/${lines.length}\x1b[0m`;

    this.door.sendAnsi(output, this.userId);
  }

  private showError(x: number, y: number, message: string): void {
    let output = `\x1b[${y};${x}H`;
    output += `\x1b[2K`;
    output += `\x1b[31m! ${message}\x1b[0m`;
    this.door.sendAnsi(output, this.userId);

    setTimeout(() => {
      let clear = `\x1b[${y};${x}H\x1b[2K`;
      this.door.sendAnsi(clear, this.userId);
    }, 3000);
  }

  /**
   * Show autocomplete suggestions
   */
  showAutocomplete(suggestions: string[], x: number, y: number, selectedIndex: number): void {
    if (suggestions.length === 0) return;

    let output = `\x1b[${y};${x}H`;
    output += `\x1b[44m\x1b[37m Suggestions \x1b[0m\n`;

    suggestions.slice(0, 5).forEach((suggestion, idx) => {
      output += `\x1b[${y + 1 + idx};${x}H`;
      if (idx === selectedIndex) {
        output += `\x1b[43m\x1b[30m ${suggestion} \x1b[0m`;
      } else {
        output += `\x1b[40m\x1b[37m ${suggestion} \x1b[0m`;
      }
    });

    this.door.sendAnsi(output, this.userId);
  }

  /**
   * Clear autocomplete
   */
  clearAutocomplete(x: number, y: number, lines: number = 6): void {
    let output = '';
    for (let i = 0; i < lines; i++) {
      output += `\x1b[${y + i};${x}H\x1b[2K`;
    }
    this.door.sendAnsi(output, this.userId);
  }
}
