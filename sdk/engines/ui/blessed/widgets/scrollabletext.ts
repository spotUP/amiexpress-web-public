/**
 * ScrollableText - Text widget with built-in scrolling support
 */

import { Text } from './text';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface ScrollableTextOptions extends ElementOptions {
  alwaysScroll?: boolean;
}

export class ScrollableText extends Text {
  constructor(options: ScrollableTextOptions = {}) {
    super({
      ...options,
      scrollable: true,
      alwaysScroll: options.alwaysScroll !== false,
      // Amiga-safe scrollbar: space with bg colors (no Unicode needed)
      scrollbar: options.scrollbar === undefined || options.scrollbar ? {
        ch: ' ',
        track: { ch: ' ', style: { bg: 'black' } },
        style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || { bg: 'cyan' },
      } : undefined,
    });

    // Force non-clickable so this internal content area doesn't swallow
    // clicks meant for its wrapping widget (e.g. List, which extends
    // Element and uses a ScrollableText-like scrollable area internally).
    // Callers can still pass `mouse: true` for wheel events — Element's
    // wheel emit path runs regardless of `clickable`.
    (this as any).clickable = false;
    (this.options as any).clickable = false;
    this.on('wheelup', () => this.scroll(-3));
    this.on('wheeldown', () => this.scroll(3));

    // Set up key bindings for scrolling
    this.key(['up', 'k'], () => this.scroll(-1));
    this.key(['down', 'j'], () => this.scroll(1));
    this.key(['pageup', 'C-b'], () => this.scroll(-this.iheight));
    this.key(['pagedown', 'C-f', 'space'], () => this.scroll(this.iheight));
    this.key(['home', 'g'], () => this.scrollTo(0));
    this.key(['end', 'G'], () => this.scrollTo(this.getScrollHeight()));
  }

  /**
   * Get the current scroll percentage
   */
  getScrollPercent(): number {
    return this.getScrollPerc();
  }

  /**
   * Set scroll by percentage (0-100)
   */
  setScrollPercent(percent: number): void {
    this.setScrollPerc(percent);
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
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}

/**
 * Factory function
 */
export function scrollabletext(options: ScrollableTextOptions = {}): ScrollableText {
  return new ScrollableText(options);
}
