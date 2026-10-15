/**
 * Log widget - Scrolling log viewer
 *
 * Responsive features:
 * - Touch-friendly scrolling on mobile
 */

import { Element } from '../core/element';
import type { LogOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export class Log extends Element {
  private scrollback: number = 1000;
  private scrollOnInput: boolean = false;

  constructor(options: LogOptions = {}) {
    super({
      scrollable: true,
      alwaysScroll: true,
      clickable: true,
      mouse: true,
      ...options,
      // On/off only: the look is the theme's (renderScrollbar).
      scrollbar: options.scrollbar === false ? undefined : true,
    });

    this.scrollback = options.scrollback || 1000;
    this.scrollOnInput = options.scrollOnInput !== false;

    // Mouse wheel scrolling
    this.on('wheelup', () => {
      this.scroll(-1);
    });

    this.on('wheeldown', () => {
      this.scroll(1);
    });
  }

  log(text: string): void {
    this.add(text);
  }

  add(text: string): void {
    const lines = this.getLines();
    lines.push(text);

    // Enforce scrollback limit
    while (lines.length > this.scrollback) {
      lines.shift();
    }

    const content = lines.join('\n');
    this.setContent(content);

    // ALWAYS scroll to bottom to show new content (regardless of scrollOnInput setting)
    // Use multiple methods to ensure scroll happens
    const scrollHeight = this.getScrollHeight();
    const maxScroll = Math.max(0, scrollHeight - (this.height as number || 10));

    // Method 1: setScrollPerc to 100%
    this.setScrollPerc(100);

    // Method 2: setScroll to max
    this.setScroll(maxScroll);

    // Method 3: Set childBase directly (internal scroll position)
    (this as any).childBase = maxScroll;

    this.emit('log', text);
  }

  clear(): void {
    this.setContent('');
  }

  /**
   * Set content of a specific line by index (for animations)
   * Uses the inherited getLines() from Element
   */
  setLine(index: number, content: string): void {
    const lines = this.getLines();
    if (index >= 0 && index < lines.length) {
      lines[index] = content;
      this.setContent(lines.join('\n'));
    }
  }

  /**
   * Get the number of lines
   */
  getLineCount(): number {
    return this.getLines().length;
  }

  /**
   * Get visible range of lines
   */
  getVisibleRange(): { start: number; end: number } {
    const childBase = (this as any).childBase || 0;
    const height = (this.height as number) || 10;
    return {
      start: childBase,
      end: childBase + height,
    };
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    // Ensure scroll position is valid after resize
    const scrollHeight = this.getScrollHeight();
    const maxScroll = Math.max(0, scrollHeight - ((this.height as number) || 10));
    const currentScroll = (this as any).childBase || 0;
    if (currentScroll > maxScroll) {
      this.setScroll(maxScroll);
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}
