/**
 * Viewport rendering (Neo-Blessed Panel Enhanced)
 * Manages visible area of the document and renders lines
 * Uses Panel widgets for better structure and visual separation
 */

import { type Screen, type Box } from '../../blessed';
import { Panel } from '../../blessed/widgets/panel';
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
  private lineNumberPanel?: Panel;
  private contentPanel: Panel;
  private rulerPanel?: Panel;
  private scrollbarPanel?: Panel;
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
      label: ' {cyan-fg}Editor{/} ',
    });

    // Create ruler panel (optional, at top of container)
    if (this.showRuler) {
      this.rulerPanel = new Panel({
        parent: this.containerPanel,
        top: 0,
        left: this.showLineNumbers ? this.lineNumberWidth + 3 : 0,
        right: this.showScrollbar ? 2 : 0,
        height: 1,
        style: {
          fg: 'cyan',
          bg: 'black',
        },
        tags: true,
      });
    }

    // Create line number panel (optional, left side)
    if (this.showLineNumbers) {
      this.lineNumberPanel = new Panel({
        parent: this.containerPanel,
        top: this.showRuler ? 1 : 0,
        bottom: 0,
        left: 0,
        width: this.lineNumberWidth + 3,  // "+ 3" for " │ "
        style: {
          fg: 'blue',
          bg: 'black',
        },
        tags: true,
      });
    }

    // Create scrollbar panel (optional, right side)
    if (this.showScrollbar) {
      this.scrollbarPanel = new Panel({
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

    // Create content panel (main editing area)
    this.contentPanel = new Panel({
      parent: this.containerPanel,
      top: this.showRuler ? 1 : 0,
      bottom: 0,
      left: this.showLineNumbers ? this.lineNumberWidth + 3 : 0,
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
    this.viewport.width = (this.contentPanel.width as number) || 80;
    this.viewport.height = (this.contentPanel.height as number) || 24;

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
    if (this.showRuler && this.rulerPanel) {
      this.renderRuler();
    }

    // Render line numbers if enabled
    if (this.showLineNumbers && this.lineNumberPanel) {
      this.renderLineNumbers(cursor);
    }

    // Render content area
    this.renderContent(cursor);

    // Render scrollbar if enabled
    if (this.showScrollbar && this.scrollbarPanel) {
      this.renderScrollbar();
    }
  }

  /**
   * Render ruler with column numbers
   */
  private renderRuler(): void {
    if (!this.rulerPanel) return;

    const scroll = this.state.getScroll();
    const width = (this.rulerPanel.width as number) || 80;

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

    this.rulerPanel.setContent(`{cyan-fg}${ruler}{/}`);
  }

  /**
   * Render line numbers panel
   */
  private renderLineNumbers(cursor: { line: number; col: number }): void {
    if (!this.lineNumberPanel) return;

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

    this.lineNumberPanel.setContent(lineNumberLines.join('\n'));
  }

  /**
   * Render main content area
   */
  private renderContent(cursor: { line: number; col: number }): void {
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

          visibleText = before + `{black-bg}{white-fg}${cursorChar}{/}` + after;
        }
      }

      contentLines.push(visibleText);
    }

    // Fill remaining height with empty lines
    while (contentLines.length < this.viewport.height) {
      contentLines.push('');
    }

    this.contentPanel.setContent(contentLines.join('\n'));
  }

  /**
   * Render scrollbar indicator
   */
  private renderScrollbar(): void {
    if (!this.scrollbarPanel) return;

    const totalLines = this.state.getLineCount();
    const height = (this.scrollbarPanel.height as number) || 24;

    if (totalLines <= this.viewport.height) {
      // No scrolling needed
      this.scrollbarPanel.setContent('');
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

    this.scrollbarPanel.setContent(scrollbarLines.join('\n'));
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
