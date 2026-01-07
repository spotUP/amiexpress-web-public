/**
 * ScrollableText - Text widget with built-in scrolling support
 */

import { Text } from './text';
import type { ElementOptions } from '../core/types';

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

    // Enable mouse wheel scrolling
    this.enableMouse();

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
}

/**
 * Factory function
 */
export function scrollabletext(options: ScrollableTextOptions = {}): ScrollableText {
  return new ScrollableText(options);
}
