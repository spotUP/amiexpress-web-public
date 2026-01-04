/**
 * ScrollableBox - Box with built-in scrolling support
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface ScrollableBoxOptions extends ElementOptions {
  alwaysScroll?: boolean;
}

export class ScrollableBox extends Box {
  constructor(options: ScrollableBoxOptions = {}) {
    super({
      ...options,
      scrollable: true,
      alwaysScroll: options.alwaysScroll !== false,
      scrollbar: options.scrollbar === undefined || options.scrollbar ? {
        ch: '█',
        track: {
          ch: '│',
        },
        style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || options.style,
      } : undefined,
    });

    // Enable mouse wheel scrolling
    this.enableMouse();

    // Set up key bindings for scrolling (scroll() auto-renders)
    this.key(['up', 'k'], () => this.scroll(-1));
    this.key(['down', 'j'], () => this.scroll(1));
    this.key(['pageup', 'C-b'], () => this.scroll(-this.iheight));
    this.key(['pagedown', 'C-f', 'space'], () => this.scroll(this.iheight));
    this.key(['home', 'g'], () => this.scrollTo(0));
    this.key(['end', 'G'], () => this.scrollTo(this.getScrollHeight()));

    // Note: Mouse wheel scrolling is handled by Element.onMouse()
    // which calls scroll() automatically for wheelup/wheeldown events
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

  /**
   * Check if scrolled to top
   */
  isScrolledToTop(): boolean {
    return this.getScroll() === 0;
  }

  /**
   * Check if scrolled to bottom
   */
  isScrolledToBottom(): boolean {
    return this.getScroll() >= this.getScrollHeight();
  }

  /**
   * Scroll to make line visible
   */
  scrollToLine(line: number): void {
    const current = this.getScroll();
    const viewHeight = this.iheight;

    if (line < current) {
      // Line is above view, scroll up
      this.setScroll(line);
    } else if (line >= current + viewHeight) {
      // Line is below view, scroll down
      this.setScroll(line - viewHeight + 1);
    }

    if (this.screen) {
      this.screen.render();
    }
  }
}

/**
 * Factory function
 */
export function scrollablebox(options: ScrollableBoxOptions = {}): ScrollableBox {
  return new ScrollableBox(options);
}
