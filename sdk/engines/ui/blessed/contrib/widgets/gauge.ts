/**
 * Gauge Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/gauge.js
 * Progress bar gauge with single percent or stacked segments
 */

import { Canvas, CanvasOptions } from './canvas';

export interface GaugeStack {
  percent: number;
  stroke?: string | number | number[];
}

export interface GaugeOptions extends CanvasOptions {
  stroke?: string | number | number[];
  fill?: string | number | number[];
  showLabel?: boolean;
  percent?: number;
  stack?: (number | GaugeStack)[];
}

/**
 * Gauge Widget
 * Displays progress bars with percentage labels
 */
export class Gauge extends Canvas {
  declare options: GaugeOptions;
  percent?: number;
  stack?: (number | GaugeStack)[];
  private _pendingPercent: number | null = null;
  private _pendingStack: (number | GaugeStack)[] | null = null;

  constructor(options: GaugeOptions = {}) {
    super(options);

    this.options.stroke = this.options.stroke || 'magenta';
    this.options.fill = this.options.fill || 'white';
    this.options.showLabel = this.options.showLabel !== false;

    // Apply pending data first, then options data
    const applyData = () => {
      if (this._pendingStack) {
        this._renderStack(this._pendingStack);
        this._pendingStack = null;
      } else if (this._pendingPercent !== null) {
        this._renderPercent(this._pendingPercent);
        this._pendingPercent = null;
      } else if (this.options.stack) {
        this.stack = this.options.stack;
        this._renderStack(this.stack);
      } else if (this.options.percent !== undefined) {
        this.percent = this.options.percent;
        this._renderPercent(this.percent);
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
    this.canvasSize = {
      width: (this.width as number) - 2,
      height: this.height as number
    };
  }

  get type(): string {
    return 'gauge';
  }

  setData(data: number | (number | GaugeStack)[]): void {
    if (Array.isArray(data) && data.length > 0) {
      this.setStack(data);
    } else if (typeof data === 'number') {
      this.setPercent(data);
    }
  }

  setPercent(percent: number): void {
    if (!this.ctx) {
      this._pendingPercent = percent;
      return;
    }
    this._renderPercent(percent);
  }

  private _renderPercent(percent: number): void {
    if (!this.ctx) return;

    const c = this.ctx;

    c.strokeStyle = this.options.stroke!;
    c.fillStyle = this.options.fill!;

    c.clearRect(0, 0, this.canvasSize!.width, this.canvasSize!.height);

    let adjustedPercent = percent;
    if (percent < 1.001) {
      adjustedPercent = percent * 100;
    }

    const width = (adjustedPercent / 100) * (this.canvasSize!.width - 3);
    c.fillRect(1, 2, width, 2);

    let textX = 7;
    if (width < textX) {
      c.strokeStyle = 'normal';
    }

    if (this.options.showLabel) {
      c.fillText(Math.round(adjustedPercent) + '%', textX, 3);
    }
  }

  setStack(stack: (number | GaugeStack)[]): void {
    if (!this.ctx) {
      this._pendingStack = stack;
      return;
    }
    this._renderStack(stack);
  }

  private _renderStack(stack: (number | GaugeStack)[]): void {
    if (!this.ctx) return;

    const colors = ['green', 'magenta', 'cyan', 'red', 'blue'];
    const c = this.ctx;
    let leftStart = 1;
    let textLeft = 5;
    c.clearRect(0, 0, this.canvasSize!.width, this.canvasSize!.height);

    for (let i = 0; i < stack.length; i++) {
      const currentStack = stack[i];

      let percent: number;
      if (typeof currentStack === 'object') {
        percent = currentStack.percent;
      } else {
        percent = currentStack;
      }

      c.strokeStyle =
        (typeof currentStack === 'object' ? currentStack.stroke : undefined) ||
        colors[i % colors.length];
      c.fillStyle = this.options.fill!;

      textLeft = 5;
      if (percent < 1.001) {
        percent = percent * 100;
      }
      const width = (percent / 100) * (this.canvasSize!.width - 3);

      c.fillRect(leftStart, 2, width, 2);

      textLeft = width / 2 - 1;
      const textX = leftStart + textLeft;

      if (leftStart + width < textX) {
        c.strokeStyle = 'normal';
      }
      if (this.options.showLabel) {
        c.fillText(percent + '%', textX, 3);
      }

      leftStart += width;
    }
  }

  getOptionsPrototype(): GaugeOptions {
    return { percent: 10 };
  }
}

/**
 * Factory function
 */
export function gauge(options: GaugeOptions = {}): Gauge {
  return new Gauge(options);
}
