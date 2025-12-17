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
  private _pendingData: BarData | null = null;

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

    // Apply pending data or initial data once attached
    const applyData = () => {
      if (this._pendingData) {
        this._renderData(this._pendingData);
        this._pendingData = null;
      } else if (this.options.data) {
        this._renderData(this.options.data);
      }
    };

    // If already attached (parent was specified in options), apply data now
    if (this.screen && this.ctx) {
      applyData();
    }

    // Also listen for future attach events
    this.on('attach', applyData);
  }

  calcSize(): void {
    // Get widget dimensions, ensuring minimum sizes
    const widgetWidth = Math.max(8, this.width as number);
    const widgetHeight = Math.max(4, this.height as number);

    // Calculate canvas size
    let width = widgetWidth - 2;
    let height = widgetHeight;

    // Ensure minimum canvas size
    width = Math.max(4, width);
    height = Math.max(4, height);

    // Round to required multiples (width: 2, height: 4)
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 4) * 4;

    this.canvasSize = { width, height };
  }

  setData(bar: BarData): void {
    if (!this.ctx) {
      // Defer rendering until attached to screen
      this._pendingData = bar;
      return;
    }
    this._renderData(bar);
  }

  private _renderData(bar: BarData): void {
    if (!this.ctx) return;

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
