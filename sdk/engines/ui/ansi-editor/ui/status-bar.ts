/**
 * Status bar component
 * Displays cursor position, mode, modified flag, and other status info
 */

import { box, type Screen, type Box } from '../../blessed';
import type { EditorState } from '../core/editor-state';
import { ANSIUtils } from '../core/ansi-utils';

export interface StatusBarOptions {
  parent: Screen;
  bottom?: number;
  showEncoding?: boolean;
  showLineEndings?: boolean;
}

/**
 * Status bar widget
 */
export class StatusBar {
  private box: Box;
  private state: EditorState;

  constructor(state: EditorState, options: StatusBarOptions) {
    this.state = state;

    this.box = box({
      parent: options.parent,
      bottom: options.bottom ?? 0,
      left: 0,
      right: 0,
      height: 1,
      border: undefined,
      style: {
        fg: 'black',
        bg: 'cyan',
      },
      tags: true,
    });

    this.render();
  }

  /**
   * Update status bar content
   */
  render(): void {
    const cursor = this.state.getCursor();
    const lineCount = this.state.getLineCount();
    const insertMode = this.state.getInsertMode();
    const modified = this.state.isModified();

    // Calculate line/col (1-based for display)
    const line = cursor.line + 1;
    const col = cursor.col + 1;

    // Get current line for column calculation
    const currentLine = this.state.getLine(cursor.line) || '';
    const visualLength = ANSIUtils.visualLength(currentLine);

    // Build status text
    const parts: string[] = [];

    // Position info
    parts.push(`Line ${line}/${lineCount}, Col ${col}/${visualLength}`);

    // Insert/Overwrite mode
    parts.push(insertMode ? 'INS' : 'OVR');

    // Modified indicator
    if (modified) {
      parts.push('{yellow-fg}Modified{/}');
    }

    // Encoding (always UTF-8 for web)
    parts.push('UTF-8');

    // Join with separators
    const content = parts.join('  {cyan-fg}|{/}  ');

    // Add help text on the right
    const helpText = 'F1:Help  ESC:Exit';

    // Calculate padding to right-align help text
    const statusLength = ANSIUtils.stripANSI(content).length;
    const helpLength = helpText.length;

    // Get actual rendered width (use screen width if box width not computed)
    const boxWidth = this.box.width;
    const width = typeof boxWidth === 'number' && boxWidth > 0 ? boxWidth : 80;

    // Ensure padding doesn't cause overflow
    const minWidth = statusLength + helpLength + 4;
    const padding = width > minWidth ? Math.max(1, width - statusLength - helpLength - 4) : 1;

    this.box.setContent(` ${content}${' '.repeat(padding)}${helpText} `);
  }

  /**
   * Update display
   */
  update(): void {
    this.render();
  }

  /**
   * Get blessed widget
   */
  getWidget(): Box {
    return this.box;
  }

  /**
   * Show status bar
   */
  show(): void {
    this.box.show();
  }

  /**
   * Hide status bar
   */
  hide(): void {
    this.box.hide();
  }

  /**
   * Destroy status bar
   */
  destroy(): void {
    this.box.destroy();
  }
}
