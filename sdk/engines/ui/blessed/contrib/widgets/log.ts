/**
 * Log Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/log.js
 * Scrollable log viewer with buffer management
 */

import { List } from '../../widgets/list';
import type { ListOptions } from '../../core/types';

export interface LogOptions extends ListOptions {
  bufferLength?: number;
}

/**
 * Log Widget
 * Displays scrolling log messages with automatic buffer management
 */
export class Log extends List {
  declare options: LogOptions;
  logLines: string[] = [];

  constructor(options: LogOptions = {}) {
    super({ ...options, interactive: false });

    this.options.bufferLength = this.options.bufferLength || 30;
  }

  log(str: string): void {
    this.logLines.push(str);
    if (this.logLines.length > this.options.bufferLength!) {
      this.logLines.shift();
    }
    this.setItems(this.logLines);
    this.scrollTo(this.logLines.length);
  }

  get type(): string {
    return 'log';
  }
}

/**
 * Factory function
 */
export function log(options: LogOptions = {}): Log {
  return new Log(options);
}
