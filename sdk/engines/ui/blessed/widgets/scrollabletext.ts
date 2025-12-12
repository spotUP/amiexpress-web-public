/**
 * ScrollableText - Text widget with built-in scrolling support
 */

import { Text } from './text';
import type { ElementOptions } from '../core/types';

export class ScrollableText extends Text {
  constructor(options: ElementOptions = {}) {
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

    // Set up key bindings for scrolling
    this.key(['up', 'k'], () => {
      this.scroll(-1);
      this.screen?.render();
    });

    this.key(['down', 'j'], () => {
      this.scroll(1);
      this.screen?.render();
    });

    this.key(['pageup', 'C-b'], () => {
      this.scroll(-this.iheight);
      this.screen?.render();
    });

    this.key(['pagedown', 'C-f', 'space'], () => {
      this.scroll(this.iheight);
      this.screen?.render();
    });

    this.key(['home', 'g'], () => {
      this.setScroll(0);
      this.screen?.render();
    });

    this.key(['end', 'G'], () => {
      this.setScroll(this.getScrollHeight());
      this.screen?.render();
    });

    // Mouse wheel scrolling
    this.on('wheelup', () => {
      this.scroll(-1);
      this.screen?.render();
    });

    this.on('wheeldown', () => {
      this.scroll(1);
      this.screen?.render();
    });
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
