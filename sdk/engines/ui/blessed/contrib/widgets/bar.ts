/**
 * Bar Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/bar.js
 * Vertical bar chart with labels
 */

import { Canvas, CanvasOptions } from './canvas';

export interface BarData {
  titles: string[];
  data: number[];
}

export interface BarOptions extends CanvasOptions {
  barWidth?: number;
  barSpacing?: number;
  xOffset?: number;
  maxHeight?: number;
  showText?: boolean;
  barBgColor?: string | number | number[];
  barFgColor?: string | number | number[];
  labelColor?: string | number | number[];
  data?: BarData;
}

/**
 * Bar Chart Widget
 * Displays vertical bars with labels and values
 */
export class Bar extends Canvas {
  declare options: BarOptions;

  constructor(options: BarOptions = {}) {
    super(options);

    this.options.barWidth = this.options.barWidth || 6;
    this.options.barSpacing = this.options.barSpacing || 9;

    if (this.options.barSpacing! - this.options.barWidth! < 3) {
      this.options.barSpacing = this.options.barWidth! + 3;
    }

    this.options.xOffset = this.options.xOffset == null ? 5 : this.options.xOffset;
    if (this.options.showText === false) {
      this.options.showText = false;
    } else {
      this.options.showText = true;
    }

    this.on('attach', () => {
      if (this.options.data) {
        this.setData(this.options.data);
      }
    });
  }

  calcSize(): void {
    this.canvasSize = {
      width: (this.width as number) - 2,
      height: this.height as number
    };
  }

  setData(bar: BarData): void {
    if (!this.ctx) {
      throw new Error(
        'error: canvas context does not exist. setData() for bar charts must be called after the chart has been added to the screen via screen.append()'
      );
    }

    this.clear();

    const c = this.ctx;
    let max = Math.max(...bar.data);
    max = Math.max(max, this.options.maxHeight || 0);
    let x = this.options.xOffset!;
    const barY = this.canvasSize!.height - 5;

    for (let i = 0; i < bar.data.length; i++) {
      const h = Math.round(barY * (bar.data[i] / max));

      if (bar.data[i] > 0) {
        c.strokeStyle = 'blue';
        if (this.options.barBgColor) {
          c.strokeStyle = this.options.barBgColor;
        }
        c.fillRect(x, barY - h + 1, this.options.barWidth!, h);
      } else {
        c.strokeStyle = 'normal';
      }

      c.fillStyle = 'white';
      if (this.options.barFgColor) {
        c.fillStyle = this.options.barFgColor;
      }
      if (this.options.showText) {
        c.fillText(bar.data[i].toString(), x + 1, this.canvasSize!.height - 4);
      }
      c.strokeStyle = 'normal';
      c.fillStyle = 'white';
      if (this.options.labelColor) {
        c.fillStyle = this.options.labelColor;
      }
      if (this.options.showText) {
        c.fillText(bar.titles[i], x + 1, this.canvasSize!.height - 3);
      }

      x += this.options.barSpacing!;
    }
  }

  getOptionsPrototype(): BarOptions {
    return {
      barWidth: 1,
      barSpacing: 1,
      xOffset: 1,
      maxHeight: 1,
      data: {
        titles: ['s'],
        data: [1]
      }
    };
  }

  get type(): string {
    return 'bar';
  }
}

/**
 * Factory function
 */
export function bar(options: BarOptions = {}): Bar {
  return new Bar(options);
}
