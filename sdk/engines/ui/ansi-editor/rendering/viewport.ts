/**
 * Viewport rendering (Neo-Blessed Panel Enhanced)
 * Manages visible area of the document and renders lines
 * Uses Panel widgets for better structure and visual separation
 */

import { type Screen } from '../../blessed';
import { Panel } from '../../blessed/widgets/panel';
import { Box } from '../../blessed/widgets/box';
import type { EditorState } from '../core/editor-state';
import type { ViewportInfo } from '../types';
import { ANSIUtils } from '../core/ansi-utils';

export interface ViewportOptions {
  parent: Screen;
  top?: number;
  bottom?: number;
  showLineNumbers?: boolean;
  lineNumberWidth?: number;
  showRuler?: boolean;
  showScrollbar?: boolean;
}

/**
 * Viewport component with Panel-based layout
 */
export class Viewport {
  private containerPanel: Panel;
  private lineNumberBox?: Box;
  private contentBox: Box;
  private rulerBox?: Box;
  private scrollbarBox?: Box;
  private state: EditorState;
  private showLineNumbers: boolean;
  private lineNumberWidth: number;
  private showRuler: boolean;
  private showScrollbar: boolean;
  private viewport: ViewportInfo;

  constructor(state: EditorState, options: ViewportOptions) {
    this.state = state;
    this.showLineNumbers = options.showLineNumbers ?? true;
    this.lineNumberWidth = options.lineNumberWidth ?? 5;
    this.showRuler = options.showRuler ?? false;
    this.showScrollbar = options.showScrollbar ?? false;

    this.viewport = {
      width: 0,
      height: 0,
      scrollTop: 0,
      scrollLeft: 0,
      visibleLineStart: 0,
      visibleLineEnd: 0,
    };

    // Create main container panel
    this.containerPanel = new Panel({
      parent: options.parent,
      top: options.top ?? 1,
      bottom: options.bottom ?? 1,
      left: 0,
      right: 0,
      border: {
        type: 'line',
        label: 'Editor',
        labelStyle: { fg: 'cyan' },
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'blue',
        },
      },
      keys: true,
      mouse: true,
      tags: true,
    });

    // Create ruler box (optional, at top of container)
    if (this.showRuler) {
      this.rulerBox = new Box({
        parent: this.containerPanel,
        top: 0,
        left: this.showLineNumbers ? this.lineNumberWidth + 1 : 0,
        right: this.showScrollbar ? 2 : 0,
        height: 1,
        style: {
          fg: 'cyan',
          bg: 'black',
        },
        tags: true,
      });
    }

    // Create line number box (optional, left side)
    if (this.showLineNumbers) {
      this.lineNumberBox = new Box({
        parent: this.containerPanel,
        top: this.showRuler ? 1 : 0,
        bottom: 0,
        left: 0,
        width: this.lineNumberWidth + 1,  // Width for numbers + separator
        style: {
          fg: 'blue',
          bg: 'black',
        },
        tags: true,
      });
    }

    // Create scrollbar box (optional, right side)
    if (this.showScrollbar) {
      this.scrollbarBox = new Box({
        parent: this.containerPanel,
        top: this.showRuler ? 1 : 0,
        bottom: 0,
        right: 0,
        width: 2,
        style: {
          fg: 'cyan',
          bg: 'black',
        },
        tags: true,
      });
    }

    // Create content box (main editing area)
    this.contentBox = new Box({
      parent: this.containerPanel,
      top: this.showRuler ? 1 : 0,
      bottom: 0,
      left: this.showLineNumbers ? this.lineNumberWidth + 1 : 0,
      right: this.showScrollbar ? 2 : 0,
      style: {
        fg: 'white',
        bg: 'black',
      },
      scrollable: false,
      keys: true,
      mouse: true,
      tags: true,
    });

    this.updateViewport();
  }

  /**
   * Update viewport dimensions
   */
  updateViewport(): void {
    // Use content panel dimensions (not container)
    this.viewport.width = (this.contentBox.width as number) || 80;
    this.viewport.height = (this.contentBox.height as number) || 24;

    const scroll = this.state.getScroll();
    this.viewport.scrollTop = scroll.top;
    this.viewport.scrollLeft = scroll.left;

    this.viewport.visibleLineStart = this.viewport.scrollTop;
    this.viewport.visibleLineEnd = Math.min(
      this.viewport.scrollTop + this.viewport.height,
      this.state.getLineCount()
    );
  }

  /**
   * Render viewport content into separate panels
   */
  render(): void {
    this.updateViewport();

    const cursor = this.state.getCursor();
    const lineCount = this.state.getLineCount();

    // Render ruler (column numbers) if enabled
    if (this.showRuler && this.rulerBox) {
      this.renderRuler();
    }

    // Render line numbers if enabled
    if (this.showLineNumbers && this.lineNumberBox) {
      this.renderLineNumbers(cursor);
    }

    // Render content area
    this.renderContent(cursor);

    // Render scrollbar if enabled
    if (this.showScrollbar && this.scrollbarBox) {
      this.renderScrollbar();
    }
  }

  /**
   * Render ruler with column numbers
   */
  private renderRuler(): void {
    if (!this.rulerBox) return;

    const scroll = this.state.getScroll();
    const width = (this.rulerBox.width as number) || 80;

    // Generate ruler: "....5....10...15..."
    let ruler = '';
    for (let col = scroll.left; col < scroll.left + width; col++) {
      const displayCol = col + 1;
      if (displayCol % 10 === 0) {
        const numStr = String(displayCol);
        ruler += numStr;
        col += numStr.length - 1; // Skip ahead
      } else if (displayCol % 5 === 0) {
        ruler += '5';
      } else {
        ruler += '.';
      }
    }

    this.rulerBox.setContent(`{cyan-fg}${ruler}{/}`);
  }

  /**
   * Render line numbers panel
   */
  private renderLineNumbers(cursor: { line: number; col: number }): void {
    if (!this.lineNumberBox) return;

    const lineNumberLines: string[] = [];

    for (let i = this.viewport.visibleLineStart; i < this.viewport.visibleLineEnd; i++) {
      const lineNum = i + 1;
      const lineNumStr = String(lineNum).padStart(this.lineNumberWidth, ' ');
      const lineNumColor = i === cursor.line ? '{cyan-fg}' : '{blue-fg}';
      lineNumberLines.push(`${lineNumColor}${lineNumStr}{/} {cyan-fg}│{/}`);
    }

    // Fill remaining height
    while (lineNumberLines.length < this.viewport.height) {
      lineNumberLines.push(`{blue-fg}${' '.repeat(this.lineNumberWidth)}{/} {cyan-fg}│{/}`);
    }

    this.lineNumberBox.setContent(lineNumberLines.join('\n'));
  }

  /**
   * Render main content area
   */
  private renderContent(cursor: { line: number; col: number }): void {
    const mode = this.state.getMode();

    if (mode === 'draw') {
      this.renderCanvasContent(cursor);
    } else {
      this.renderTextContent(cursor);
    }
  }

  /**
   * Render text editing content
   */
  private renderTextContent(cursor: { line: number; col: number }): void {
    const contentLines: string[] = [];
    const contentWidth = this.viewport.width;

    // Render visible lines
    for (let i = this.viewport.visibleLineStart; i < this.viewport.visibleLineEnd; i++) {
      const line = this.state.getLine(i) || '';

      // Get visible portion of line (horizontal scrolling)
      const strippedLine = ANSIUtils.stripANSI(line);
      const visibleStart = this.viewport.scrollLeft;
      const visibleEnd = visibleStart + contentWidth;

      // Extract visible text
      let visibleText = strippedLine.substring(visibleStart, visibleEnd);

      // Render cursor if on this line
      if (i === cursor.line) {
        const cursorCol = cursor.col - this.viewport.scrollLeft;
        if (cursorCol >= 0 && cursorCol <= visibleText.length) {
          // Insert cursor character with inverted colors
          const before = visibleText.substring(0, cursorCol);
          const cursorChar = visibleText[cursorCol] || ' ';
          const after = visibleText.substring(cursorCol + 1);

          visibleText = before + `{inverse}${cursorChar}{/inverse}` + after;
        }
      }

      contentLines.push(visibleText);
    }

    // Fill remaining height with empty lines
    // Reserve last line for cursor position indicator
    const maxContentLines = this.viewport.height - 1;
    while (contentLines.length < maxContentLines) {
      contentLines.push('');
    }

    // Add cursor position indicator at bottom of canvas
    const lineNum = cursor.line + 1;
    const colNum = cursor.col + 1;
    const cursorPrompt = `{cyan-fg}▌{/cyan-fg} Line ${lineNum}, Col ${colNum}`;
    contentLines.push(cursorPrompt);

    this.contentBox.setContent(contentLines.join('\n'));
  }

  /**
   * Render canvas drawing content
   */
  private renderCanvasContent(cursor: { line: number; col: number }): void {
    const canvas = this.state.getCanvas();
    if (!canvas) {
      this.contentBox.setContent('Canvas not initialized');
      return;
    }

    const contentLines: string[] = [];
    const contentWidth = this.viewport.width;
    const visibleStart = this.viewport.scrollLeft;
    const visibleEnd = visibleStart + contentWidth;

    // Render visible canvas rows
    for (let y = this.viewport.visibleLineStart; y < this.viewport.visibleLineEnd; y++) {
      if (y >= canvas.length) {
        contentLines.push('');
        continue;
      }

      let line = '';
      let currentFg = -1;
      let currentBg = -1;
      let currentBlink = false;

      // Render visible columns
      for (let x = visibleStart; x < Math.min(visibleEnd, canvas[y].length); x++) {
        const cell = canvas[y][x];

        // Optimize ANSI codes - only emit when attributes change
        const cellBlink = cell.blink ?? false;
        if (cell.fg !== currentFg || cell.bg !== currentBg || cellBlink !== currentBlink) {
          // Close previous tags
          if (currentFg !== -1) {
            line += '{/}';
          }

          // Open new tags
          const fgColor = this.getColorName(cell.fg);
          const bgColor = this.getColorName(cell.bg);
          line += `{${fgColor}-fg}{${bgColor}-bg}`;

          currentFg = cell.fg;
          currentBg = cell.bg;
          currentBlink = cellBlink;
        }

        // Render cursor if on this position
        if (y === cursor.line && x === cursor.col) {
          line += `{inverse}${cell.char}{/inverse}`;
        } else {
          line += cell.char;
        }
      }

      // Close tags at end of line
      if (currentFg !== -1) {
        line += '{/}';
      }

      contentLines.push(line);
    }

    // Fill remaining height with empty lines
    // Reserve last line for cursor position indicator
    const maxContentLines = this.viewport.height - 1;
    while (contentLines.length < maxContentLines) {
      contentLines.push('');
    }

    // Add cursor position indicator with tool info
    const x = cursor.col + 1;
    const y = cursor.line + 1;
    const tool = this.state.getCurrentTool();
    const fg = this.state.getCurrentFg();
    const bg = this.state.getCurrentBg();
    const char = this.state.getCurrentChar();

    const fgColor = this.getColorName(fg);
    const bgColor = this.getColorName(bg);
    const sample = `{${fgColor}-fg}{${bgColor}-bg}${char}{/}`;

    const cursorPrompt = `{cyan-fg}▌{/cyan-fg} X:${x} Y:${y} Tool:${tool} ${sample}`;
    contentLines.push(cursorPrompt);

    this.contentBox.setContent(contentLines.join('\n'));
  }

  /**
   * Get color name from color code (0-15)
   */
  private getColorName(code: number): string {
    const colors = [
      'black',       // 0
      'red',         // 1
      'green',       // 2
      'yellow',      // 3
      'blue',        // 4
      'magenta',     // 5
      'cyan',        // 6
      'white',       // 7
      'lightblack',  // 8 (gray)
      'lightred',    // 9
      'lightgreen',  // 10
      'lightyellow', // 11
      'lightblue',   // 12
      'lightmagenta',// 13
      'lightcyan',   // 14
      'lightwhite'   // 15
    ];
    return colors[code] || 'white';
  }

  /**
   * Render scrollbar indicator
   */
  private renderScrollbar(): void {
    if (!this.scrollbarBox) return;

    const totalLines = this.state.getLineCount();
    const height = (this.scrollbarBox.height as number) || 24;

    if (totalLines <= this.viewport.height) {
      // No scrolling needed
      this.scrollbarBox.setContent('');
      return;
    }

    const scrollbarLines: string[] = [];
    const thumbHeight = Math.max(1, Math.floor((this.viewport.height / totalLines) * height));
    const thumbPosition = Math.floor((this.viewport.scrollTop / totalLines) * height);

    for (let i = 0; i < height; i++) {
      if (i >= thumbPosition && i < thumbPosition + thumbHeight) {
        scrollbarLines.push('{cyan-bg} {/}');
      } else {
        scrollbarLines.push('{blue-fg}│{/}');
      }
    }

    this.scrollbarBox.setContent(scrollbarLines.join('\n'));
  }

  /**
   * Scroll viewport to ensure cursor is visible
   */
  scrollToCursor(): void {
    const cursor = this.state.getCursor();
    const scroll = this.state.getScroll();

    // Vertical scrolling
    if (cursor.line < scroll.top) {
      // Cursor above viewport
      this.state.setScroll(cursor.line, scroll.left);
    } else if (cursor.line >= scroll.top + this.viewport.height) {
      // Cursor below viewport
      this.state.setScroll(cursor.line - this.viewport.height + 1, scroll.left);
    }

    // Horizontal scrolling
    // viewport.width already represents contentPanel width (line numbers in separate panel)
    const contentWidth = this.viewport.width;

    if (cursor.col < scroll.left) {
      // Cursor left of viewport
      this.state.setScroll(scroll.top, cursor.col);
    } else if (cursor.col >= scroll.left + contentWidth) {
      // Cursor right of viewport
      this.state.setScroll(scroll.top, cursor.col - contentWidth + 1);
    }
  }

  /**
   * Update display
   */
  update(): void {
    this.scrollToCursor();
    this.render();
  }

  /**
   * Get blessed widget (container panel)
   */
  getWidget(): Box {
    return this.containerPanel as unknown as Box;
  }

  /**
   * Toggle line numbers
   */
  toggleLineNumbers(): void {
    this.showLineNumbers = !this.showLineNumbers;
    this.render();
  }

  /**
   * Set line numbers visibility
   */
  setLineNumbers(show: boolean): void {
    this.showLineNumbers = show;
    this.render();
  }

  /**
   * Get viewport info
   */
  getViewport(): Readonly<ViewportInfo> {
    return this.viewport;
  }

  /**
   * Destroy viewport and all child panels
   */
  destroy(): void {
    this.containerPanel.destroy();
  }
}
