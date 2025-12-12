/**
 * Gauge List Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/gauge-list.js
 * Multiple gauges displayed in a vertical list
 */

import { Canvas, CanvasOptions } from './canvas';

export interface GaugeListStack {
  percent: number;
  stroke?: string | number | number[];
}

export interface GaugeListItem {
  showLabel?: boolean;
  stack: (number | GaugeListStack)[];
}

export interface GaugeListOptions extends CanvasOptions {
  stroke?: string | number | number[];
  fill?: string | number | number[];
  showLabel?: boolean;
  gaugeSpacing?: number;
  gaugeHeight?: number;
  gauges?: GaugeListItem[];
}

/**
 * Gauge List Widget
 * Displays multiple progress gauges in a vertical list
 */
export class GaugeList extends Canvas {
  declare options: GaugeListOptions;
  gauges?: GaugeListItem[];

  constructor(options: GaugeListOptions = {}) {
    super(options);

    this.options.stroke = this.options.stroke || 'magenta';
    this.options.fill = this.options.fill || 'white';
    this.options.showLabel = this.options.showLabel !== false;
    this.options.gaugeSpacing = this.options.gaugeSpacing || 0;
    this.options.gaugeHeight = this.options.gaugeHeight || 1;

    this.on('attach', () => {
      const gauges = (this.gauges = this.options.gauges);
      if (gauges) {
        this.setGauges(gauges);
      }
    });
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

  setData(): void {
    // Empty implementation as in original
  }

  setGauges(gauges: GaugeListItem[]): void {
    if (!this.ctx) {
      throw new Error(
        'error: canvas context does not exist. setData() for gauges must be called after the gauge has been added to the screen via screen.append()'
      );
    }

    const c = this.ctx;
    c.clearRect(0, 0, this.canvasSize!.width, this.canvasSize!.height);

    for (let i = 0; i < gauges.length; i++) {
      this.setSingleGauge(gauges[i], i);
    }
  }

  setSingleGauge(gauge: GaugeListItem, offset: number): void {
    const colors = ['green', 'magenta', 'cyan', 'red', 'blue'];
    const stack = gauge.stack;

    const c = this.ctx!;
    let leftStart = 3;
    let textLeft = 5;

    c.strokeStyle = 'normal';
    c.fillStyle = 'white';
    c.fillText(
      offset.toString(),
      0,
      offset * (this.options.gaugeHeight! + this.options.gaugeSpacing!)
    );

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

      const width = (percent / 100) * (this.canvasSize!.width - 5);

      c.fillRect(
        leftStart,
        offset * (this.options.gaugeHeight! + this.options.gaugeSpacing!),
        width,
        this.options.gaugeHeight! - 1
      );

      textLeft = width / 2 - 1;
      const textX = leftStart + textLeft;

      if (leftStart + width < textX) {
        c.strokeStyle = 'normal';
      }
      if (gauge.showLabel) {
        c.fillText(percent + '%', textX, 3);
      }

      leftStart += width;
    }
  }

  getOptionsPrototype(): GaugeListOptions {
    return {
      gauges: [{
        showLabel: true,
        stack: [{ percent: 10, stroke: 'green' }]
      }]
    };
  }
}

/**
 * Factory function
 */
export function gaugeList(options: GaugeListOptions = {}): GaugeList {
  return new GaugeList(options);
}
