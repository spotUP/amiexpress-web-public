/**
 * Sparkline Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/sparkline.js
 * Displays sparkline charts using Unicode sparkline characters
 */

import { Box } from '../../widgets/box';
import { sparkline as generateSparkline } from '../utils/sparkline';
import type { ElementOptions } from '../../core/types';

export interface SparklineOptions extends ElementOptions {
  bufferLength?: number;
  data?: {
    titles: string[];
    data: number[][];
  };
}

/**
 * Sparkline Widget
 * Displays multiple sparklines with titles
 */
export class Sparkline extends Box {
  options: SparklineOptions;
  private titleFg: string;

  constructor(options: SparklineOptions = {}) {
    options = options || {};
    options.bufferLength = options.bufferLength || 30;

    super(options);
    this.options = options;
    this.titleFg = 'white';

    this.on('attach', () => {
      if (this.options.data) {
        this.setData(this.options.data.titles, this.options.data.data);
      }
    });
  }

  /**
   * Set sparkline data
   * @param titles Array of titles for each sparkline
   * @param datasets Array of data arrays for each sparkline
   */
  setData(titles: string[], datasets: number[][]): void {
    let res = '\r\n';
    for (let i = 0; i < titles.length; i++) {
      res +=
        '{bold}{' +
        this.titleFg +
        '-fg}' +
        titles[i] +
        ':{/' +
        this.titleFg +
        '-fg}{/bold}\r\n';
      res += generateSparkline(datasets[i].slice(0, (this.width as number) - 2)) + '\r\n\r\n';
    }

    this.setContent(res);
  }

  /**
   * Get default options (for reference/examples)
   */
  getOptionsPrototype(): SparklineOptions {
    return {
      label: 'Sparkline',
      tags: true,
      border: { type: 'line', fg: 'cyan' },
      width: '50%',
      height: '50%',
      style: { fg: 'blue' },
      data: {
        titles: ['Sparkline1', 'Sparkline2'],
        data: [
          [10, 20, 30, 20, 50, 70, 60, 30, 35, 38],
          [40, 10, 40, 50, 20, 30, 20, 20, 19, 40]
        ]
      }
    };
  }

  get type(): string {
    return 'sparkline';
  }
}

/**
 * Factory function
 */
export function sparkline(options: SparklineOptions = {}): Sparkline {
  return new Sparkline(options);
}
