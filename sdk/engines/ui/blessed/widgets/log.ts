/**
 * Log widget - Scrolling log viewer
 */

import { Element } from '../core/element';
import type { LogOptions } from '../core/types';

export class Log extends Element {
  private scrollback: number = 1000;
  private scrollOnInput: boolean = false;

  constructor(options: LogOptions = {}) {
    // Build scrollbar config - preserve user's settings if provided, otherwise use defaults
    let scrollbarConfig: any;
    if (options.scrollbar && typeof options.scrollbar === 'object') {
      // User provided scrollbar config
      scrollbarConfig = {
        ch: options.scrollbar.ch || '█'
      };
    } else {
      // No scrollbar config provided - use defaults
      scrollbarConfig = {
        ch: '█'
      };
    }

    super({
      scrollable: true,
      alwaysScroll: true,
      clickable: true,
      mouse: true,
      ...options,
      scrollbar: scrollbarConfig,
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

    this.setContent(lines.join('\n'));

    // Auto-scroll to bottom
    if (this.scrollOnInput) {
      this.setScroll(this.getScrollHeight());
    }

    this.emit('log', text);
  }

  clear(): void {
    this.setContent('');
  }
}
