/**
 * Log Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/log.js
 * Scrollable log viewer with buffer management
 */

import { Element } from '../core/element';
import type { ElementOptions } from '../core/types';

export interface ContribLogOptions extends ElementOptions {

  bufferLength?: number;

}



/**

 * Log Widget

 * Displays scrolling log messages with automatic buffer management

 * Unlike List, Log doesn't add selection markers to preserve text width

 */

export class ContribLog extends Element {

  declare options: ContribLogOptions;

  logLines: string[] = [];



  constructor(options: ContribLogOptions = {}) {

    super({

      scrollable: true,

      focusable: true,

      mouse: true,

      wrap: true,  // Enable word wrapping

      ...options,

    });



    this.options.bufferLength = this.options.bufferLength || 30;

  }



  log(str: string): void {

    this.logLines.push(str);

    if (this.logLines.length > this.options.bufferLength!) {

      this.logLines.shift();

    }

    this._updateContent();

    this.scrollTo(this.logLines.length);

  }



  private _updateContent(): void {

    // Join lines without adding markers - preserve full width for text

    this.setContent(this.logLines.join('\n'));

  }



  setItems(items: string[]): void {

    this.logLines = items;

    this._updateContent();

  }



  scrollTo(line: number): void {

    // Calculate scroll position to show the specified line

    const pos = this._getCoords();

    if (!pos) return;



    const border = this.options.border ? 1 : 0;

    const height = pos.yl - pos.yi - border * 2;

    const maxScroll = Math.max(0, this.logLines.length - height);

    const targetScroll = Math.min(line, maxScroll);



    this.setScroll(targetScroll);

  }



  get type(): string {

    return 'log';

  }

}



/**

 * Factory function

 */

export function contribLog(options: ContribLogOptions = {}): ContribLog {

  return new ContribLog(options);

}
