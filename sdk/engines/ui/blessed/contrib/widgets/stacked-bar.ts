/**
 * Stacked Bar Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/stacked-bar.js
 * Vertical stacked bar chart with legend
 */

import { Canvas, CanvasOptions } from './canvas';
import { Box } from '../../widgets/box';
import * as utils from '../utils/utils';

export interface StackedBarData {
  barCategory: string[];
  stackedCategory: string[];
  data: number[][];
}

export interface StackedBarOptions extends CanvasOptions {
  barWidth?: number;
  barSpacing?: number;
  xOffset?: number;
  maxValue?: number;
  showText?: boolean;
  barBgColor?: (string | number | number[])[];
  barFgColor?: string | number | number[];
  labelColor?: string | number | number[];
  legend?: {
    width?: number;
    [key: string]: any;
  };
  showLegend?: boolean;
  data?: StackedBarData;
}

/**
 * Stacked Bar Chart Widget
 * Displays vertical stacked bars with legend
 */
export class StackedBar extends Canvas {
  declare options: StackedBarOptions;
  legend?: Box;

  constructor(options: StackedBarOptions = {}) {
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

    this.options.legend = this.options.legend || {};
    if (this.options.showLegend === false) {
      this.options.showLegend = false;
    } else {
      this.options.showLegend = true;
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

  getSummedBars(bars: number[][]): number[] {
    const res: number[] = [];
    bars.forEach(function (stackedValues) {
      const sum = stackedValues.reduce(function (a, b) {
        return a + b;
      }, 0);
      res.push(sum);
    });
    return res;
  }

  setData(bars: StackedBarData): void {
    if (!this.ctx) {
      throw new Error(
        'error: canvas context does not exist. setData() for bar charts must be called after the chart has been added to the screen via screen.append()'
      );
    }

    this.clear();

    const summedBars = this.getSummedBars(bars.data);
    let maxBarValue = Math.max(...summedBars);
    if (this.options.maxValue) {
      maxBarValue = Math.max(maxBarValue, this.options.maxValue);
    }
    let x = this.options.xOffset!;
    for (let i = 0; i < bars.data.length; i++) {
      this.renderBar(x, bars.data[i], summedBars[i], maxBarValue, bars.barCategory[i]);
      x += this.options.barSpacing!;
    }

    this.addLegend(bars, x);
  }

  renderBar(
    x: number,
    bar: number[],
    curBarSummedValue: number,
    maxBarValue: number,
    category: string
  ): void {
    // First line is for label
    const BUFFER_FROM_TOP = 2;
    const BUFFER_FROM_BOTTOM = (this.options.border ? 2 : 0) + (this.options.showText ? 1 : 0);

    const c = this.ctx!;
    c.strokeStyle = 'normal';
    c.fillStyle = 'white';
    if (this.options.labelColor) {
      c.fillStyle = this.options.labelColor;
    }
    if (this.options.showText) {
      c.fillText(category, x + 1, this.canvasSize!.height - BUFFER_FROM_BOTTOM);
    }

    if (curBarSummedValue < 0) return;
    const maxBarHeight = this.canvasSize!.height - BUFFER_FROM_TOP - BUFFER_FROM_BOTTOM;
    const currentBarHeight = Math.round(maxBarHeight * (curBarSummedValue / maxBarValue));
    // Start painting from bottom of bar, section by section
    let y = maxBarHeight + BUFFER_FROM_TOP;
    let availableBarHeight = currentBarHeight;
    for (let i = 0; i < bar.length; i++) {
      const currStackHeight = this.renderBarSection(
        x,
        y,
        bar[i],
        curBarSummedValue,
        currentBarHeight,
        availableBarHeight,
        this.options.barBgColor![i]
      );
      y -= currStackHeight;
      availableBarHeight -= currStackHeight;
    }
  }

  renderBarSection(
    x: number,
    y: number,
    data: number,
    curBarSummedValue: number,
    currentBarHeight: number,
    availableBarHeight: number,
    bg: string | number | number[]
  ): number {
    const c = this.ctx!;

    const currStackHeight =
      currentBarHeight <= 0
        ? 0
        : Math.min(
            availableBarHeight, // round() can make total stacks exceed curr bar height so we limit it
            Math.round(currentBarHeight * (data / curBarSummedValue))
          );
    c.strokeStyle = bg;

    if (currStackHeight > 0) {
      const calcY = y - currStackHeight;
      // fillRect starts from the point bottom of start point so we compensate
      const calcHeight = Math.max(0, currStackHeight - 1);
      c.fillRect(x, calcY, this.options.barWidth!, calcHeight);

      c.fillStyle = 'white';
      if (this.options.barFgColor) {
        c.fillStyle = this.options.barFgColor;
      }
      if (this.options.showText) {
        const str = String(utils.abbreviateNumber(data));
        c.fillText(
          str,
          Math.floor(x + this.options.barWidth! / 2 + str.length / 2),
          calcY + Math.round(calcHeight / 2)
        );
      }
    }

    return currStackHeight;
  }

  addLegend(bars: StackedBarData, x: number): void {
    const self = this;
    if (!self.options.showLegend) return;
    if (self.legend) self.remove(self.legend);
    const legendWidth = self.options.legend!.width || 15;
    self.legend = new Box({
      height: bars.stackedCategory.length + 2,
      top: 1,
      width: legendWidth,
      left: x,
      content: '',
      tags: true,
      border: {
        type: 'line',
        fg: 'black'
      },
      style: {
        fg: 'green'
      },
      screen: self.screen
    });

    let legendText = '';
    const maxChars = legendWidth - 2;
    for (let i = 0; i < bars.stackedCategory.length; i++) {
      const color = utils.getColorCode(self.options.barBgColor![i]);
      legendText +=
        '{' +
        color +
        '-fg}' +
        bars.stackedCategory[i].substring(0, maxChars) +
        '{/' +
        color +
        '-fg}\r\n';
    }
    self.legend.setContent(legendText);
    self.append(self.legend);
  }

  getOptionsPrototype(): StackedBarOptions {
    return {
      barWidth: 1,
      barSpacing: 1,
      xOffset: 1,
      maxValue: 1,
      barBgColor: ['s'],
      data: {
        barCategory: ['s'],
        stackedCategory: ['s'],
        data: [[1]]
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
export function stackedBar(options: StackedBarOptions = {}): StackedBar {
  return new StackedBar(options);
}
