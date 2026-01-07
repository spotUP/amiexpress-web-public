/**
 * Viewport - Scrollable viewport for content larger than container
 */

import { Box } from './box';
import type { ElementOptions } from '../core/types';

export interface ViewportOptions extends ElementOptions {
  alwaysScroll?: boolean;
  baseLimit?: number;
  scrollbarBg?: string;
  scrollbarFg?: string;
}

export class Viewport extends Box {
  private alwaysScroll: boolean;
  private baseLimit: number;
  private scrollPosition: number = 0;
  private contentHeight: number = 0;

  constructor(options: ViewportOptions = {}) {
    const { alwaysScroll, baseLimit, scrollbarBg, scrollbarFg, ...boxOptions } = options;

    super({
      ...boxOptions,
      scrollable: true,
      alwaysScroll: alwaysScroll !== false,
      // Amiga-safe scrollbar: space with bg colors (no Unicode needed)
      scrollbar: options.scrollbar !== undefined ? options.scrollbar : {
        ch: ' ',
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: scrollbarBg || 'cyan' },
      },
    });

    this.alwaysScroll = alwaysScroll !== false;
    this.baseLimit = baseLimit || 10000;

    // Enable keyboard scrolling
    this.enableKeys();

    // Scroll keys
    this.key(['up', 'k'], () => {
      this.scroll(-1);
    });

    this.key(['down', 'j'], () => {
      this.scroll(1);
    });

    this.key(['pageup'], () => {
      const viewportHeight = typeof this.height === 'number' ? this.height : 20;
      this.scroll(-Math.floor(viewportHeight / 2));
    });

    this.key(['pagedown'], () => {
      const viewportHeight = typeof this.height === 'number' ? this.height : 20;
      this.scroll(Math.floor(viewportHeight / 2));
    });

    this.key(['home'], () => {
      this.scrollTo(0);
    });

    this.key(['end'], () => {
      this.scrollTo(this.contentHeight);
    });

    // Mouse wheel support
    if (options.mouse !== false) {
      this.enableMouse();

      this.on('wheeldown', () => {
        this.scroll(3);
      });

      this.on('wheelup', () => {
        this.scroll(-3);
      });
    }
  }

  /**
   * Scroll by delta
   */
  scroll(offset: number): void {
    const newPosition = this.scrollPosition + offset;
    this.scrollTo(newPosition);
  }

  /**
   * Scroll to absolute position
   */
  scrollTo(position: number): void {
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);

    this.scrollPosition = Math.max(0, Math.min(position, maxScroll));
    this.setScrollPerc((this.scrollPosition / maxScroll) * 100 || 0);

    this.emit('scroll', this.scrollPosition);

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get scroll position
   */
  getScrollPosition(): number {
    return this.scrollPosition;
  }

  /**
   * Get scroll percentage
   */
  getScrollPerc(): number {
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);
    return maxScroll > 0 ? (this.scrollPosition / maxScroll) * 100 : 0;
  }

  /**
   * Set content and update scrollable height
   */
  setContent(content: string): void {
    super.setContent(content);

    // Calculate content height
    const lines = content.split('\n');
    this.contentHeight = lines.length;

    // Adjust scroll position if needed
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);
    if (this.scrollPosition > maxScroll) {
      this.scrollTo(maxScroll);
    }
  }

  /**
   * Get content height
   */
  getContentHeight(): number {
    return this.contentHeight;
  }

  /**
   * Check if scrolled to bottom
   */
  isAtBottom(): boolean {
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);
    return this.scrollPosition >= maxScroll;
  }

  /**
   * Check if scrolled to top
   */
  isAtTop(): boolean {
    return this.scrollPosition === 0;
  }

  /**
   * Reset scroll position to top
   */
  resetScroll(): void {
    this.scrollTo(0);
  }
}
