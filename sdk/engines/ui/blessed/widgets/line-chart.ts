/**
 * Line Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/line.js
 * Multi-line chart with legend, axes, and labels
 */

import { ContribCanvas as Canvas, ContribCanvasOptions as CanvasOptions } from './contrib-canvas';
import { Box } from './box';
import * as utils from '../utils/contrib-utils/utils';
import * as _ from '../utils/contrib-utils/lodash';
import type { Context } from '../utils/contrib-utils/drawille-canvas';

export interface LineData {
  title: string;
  x: string[];
  y: number[];
  style?: {
    line?: string | number | number[];
    [key: string]: any;
  };
}

export interface LineOptions extends Omit<CanvasOptions, 'style'> {
  showNthLabel?: number;
  style?: {
    line?: string | number | number[];
    text?: string | number | number[];
    baseline?: string | number | number[];
    [key: string]: any;
  };
  xLabelPadding?: number;
  xPadding?: number;
  numYLabels?: number;
  legend?: {
    width?: number;
    [key: string]: any;
  };
  wholeNumbersOnly?: boolean;
  minY?: number;
  maxY?: number;
  showLegend?: boolean;
  abbreviate?: boolean;
  data?: LineData[];
}

/**
 * Line Chart Widget
 * Draws multi-line charts with customizable styling
 */
export class Line extends Canvas {
  legend?: Box;
  private _pendingData?: LineData | LineData[];

  constructor(options: LineOptions = {}) {
    options.showNthLabel = options.showNthLabel || 1;
    options.style = options.style || {};
    options.style.line = options.style.line || 'yellow';
    options.style.text = options.style.text || 'green';
    options.style.baseline = options.style.baseline || 'black';
    options.xLabelPadding = options.xLabelPadding || 5;
    options.xPadding = options.xPadding || 10;
    options.numYLabels = options.numYLabels || 5;
    options.legend = options.legend || {};
    options.wholeNumbersOnly = options.wholeNumbersOnly || false;
    options.minY = options.minY || 0;

    super(options as any);
    // Override options with correct type
    (this as any).options = options;

    // Handle deferred setData - when widget is attached, render any pending data
    const applyData = () => {
      if (this._pendingData) {
        this.setData(this._pendingData);
        this._pendingData = undefined;
      } else if (options.data) {
        this.setData(options.data);
      }
    };

    // If already attached (parent was specified in options), apply data now
    if ((this as any).screen && (this as any).ctx) {
      applyData();
    }

    // Also listen for future attach events
    (this as any).on('attach', applyData);
  }

  // Type-safe accessor for line-specific options
  get lineOptions(): LineOptions {
    return this.options as any;
  }

  calcSize(): void {
    // Get widget dimensions, ensuring minimum sizes
    const widgetWidth = Math.max(8, (this as any).width as number);
    const widgetHeight = Math.max(4, (this as any).height as number);

    // Calculate canvas size
    let width = widgetWidth * 2 - 12;
    let height = widgetHeight * 4 - 8;

    // Ensure minimum canvas size
    width = Math.max(4, width);
    height = Math.max(4, height);

    // Round to required multiples (width: 2, height: 4)
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 4) * 4;

    (this as any).canvasSize = { width, height };
  }

  get type(): string {
    return 'line';
  }

  setData(dataInput: LineData | LineData[]): void {
    // If context not ready yet, store data for later when widget is attached
    if (!(this as any).ctx) {
      this._pendingData = dataInput;
      return;
    }

    // Compatibility with older API - normalize to array
    const data: LineData[] = Array.isArray(dataInput) ? dataInput : [dataInput];

    const self = this;
    const opts = this.lineOptions;
    let xLabelPadding = opts.xLabelPadding!;
    const yLabelPadding = 3;
    let xPadding = opts.xPadding!;
    const yPadding = 11;
    const c = (this as any).ctx;
    const labels = data[0].x;

    function addLegend() {
      if (!opts.showLegend) return;
      if (self.legend) self.remove(self.legend);
      const legendWidth = opts.legend!.width || 15;
      self.legend = new Box({
        height: data.length + 2,
        top: 1,
        width: legendWidth,
        left: (self.width as number) - legendWidth - 3,
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
      for (let i = 0; i < data.length; i++) {
        const style = data[i].style || {};
        const color = utils.getColorCode(style.line || opts.style!.line!);
        legendText +=
          '{' +
          color +
          '-fg}' +
          data[i].title.substring(0, maxChars) +
          '{/' +
          color +
          '-fg}\r\n';
      }
      self.legend.setContent(legendText);
      self.append(self.legend);
    }

    function getMaxY(): number {
      if (opts.maxY) {
        return opts.maxY;
      }

      let max = -Infinity;

      for (let i = 0; i < data.length; i++) {
        if (data[i].y.length) {
          const current = _.max(data[i].y, parseFloat);
          if (current > max) {
            max = current;
          }
        }
      }

      return max + (max - opts.minY!) * 0.2;
    }

    function formatYLabel(
      value: number,
      max: number,
      min: number,
      numLabels: number,
      wholeNumbersOnly: boolean,
      abbreviate?: boolean
    ): string {
      const fixed = (max - min) / numLabels < 1 && value !== 0 && !wholeNumbersOnly ? 2 : 0;
      const res = value.toFixed(fixed);
      return abbreviate ? String(utils.abbreviateNumber(parseFloat(res))) : res;
    }

    function getMaxXLabelPadding(
      numLabels: number,
      wholeNumbersOnly: boolean,
      abbreviate: boolean | undefined,
      min: number
    ): number {
      const max = getMaxY();
      return formatYLabel(max, max, min, numLabels, wholeNumbersOnly, abbreviate).length * 2;
    }

    const maxPadding = getMaxXLabelPadding(
      opts.numYLabels!,
      opts.wholeNumbersOnly!,
      opts.abbreviate,
      opts.minY!
    );
    if (xLabelPadding < maxPadding) {
      xLabelPadding = maxPadding;
    }

    if (xPadding - xLabelPadding < 0) {
      xPadding = xLabelPadding;
    }

    function getMaxX(): number {
      let maxLength = 0;

      for (let i = 0; i < labels.length; i++) {
        if (labels[i] === undefined) {
          // Skip undefined labels
        } else if (labels[i].length > maxLength) {
          maxLength = labels[i].length;
        }
      }

      return maxLength;
    }

    function getXPixel(val: number): number {
      return (
        ((self.canvasSize!.width - xPadding) / labels.length) * val + xPadding * 1.0 + 2
      );
    }

    function getYPixel(val: number, minY: number): number {
      let res =
        self.canvasSize!.height -
        yPadding -
        ((self.canvasSize!.height - yPadding) / (getMaxY() - minY)) * (val - minY);
      res -= 2; // to separate the baseline and the data line to separate chars so canvas will show separate colors
      return res;
    }

    // Draw the line graph
    function drawLine(values: number[], style: any, minY: number): void {
      style = style || {};
      const color = opts.style!.line!;
      c.strokeStyle = style.line || color;

      c.moveTo(0, 0);
      c.beginPath();
      c.lineTo(getXPixel(0), getYPixel(values[0], minY));

      for (let k = 1; k < values.length; k++) {
        c.lineTo(getXPixel(k), getYPixel(values[k], minY));
      }

      c.stroke();
    }

    addLegend();

    c.fillStyle = opts.style!.text!;

    c.clearRect(0, 0, (this as any).canvasSize!.width, (this as any).canvasSize!.height);

    let yLabelIncrement = (getMaxY() - opts.minY!) / opts.numYLabels!;
    if (opts.wholeNumbersOnly) yLabelIncrement = Math.floor(yLabelIncrement);

    if (yLabelIncrement === 0) yLabelIncrement = 1;

    // Draw the Y value texts
    const maxY = getMaxY();
    for (let i = opts.minY!; i < maxY; i += yLabelIncrement) {
      c.fillText(
        formatYLabel(
          i,
          maxY,
          opts.minY!,
          opts.numYLabels!,
          opts.wholeNumbersOnly!,
          opts.abbreviate
        ),
        xPadding - xLabelPadding,
        getYPixel(i, opts.minY!)
      );
    }

    for (let h = 0; h < data.length; h++) {
      drawLine(data[h].y, data[h].style, opts.minY!);
    }

    c.strokeStyle = opts.style!.baseline!;

    // Draw the axes
    c.beginPath();

    c.lineTo(xPadding, 0);
    c.lineTo(xPadding, (this as any).canvasSize!.height - yPadding);
    c.lineTo((this as any).canvasSize!.width, (this as any).canvasSize!.height - yPadding);

    c.stroke();

    // Draw the X value texts
    const charsAvailable = ((this as any).canvasSize!.width - xPadding) / 2;
    const maxLabelsPossible = charsAvailable / (getMaxX() + 2);
    const pointsPerMaxLabel = Math.ceil(data[0].y.length / maxLabelsPossible);
    let showNthLabel = opts.showNthLabel!;
    if (showNthLabel < pointsPerMaxLabel) {
      showNthLabel = pointsPerMaxLabel;
    }

    for (let i = 0; i < labels.length; i += showNthLabel) {
      if (getXPixel(i) + labels[i].length * 2 <= (this as any).canvasSize!.width) {
        c.fillText(labels[i], getXPixel(i), (this as any).canvasSize!.height - yPadding + yLabelPadding);
      }
    }

    // Sync canvas content to element
    (this as any).syncContent();
  }

  getOptionsPrototype(): LineOptions {
    return {
      width: 80,
      height: 30,
      left: 15,
      top: 12,
      xPadding: 5,
      label: 'Title',
      showLegend: true,
      legend: { width: 12 },
      data: [
        {
          title: 'us-east',
          x: ['t1', 't2', 't3', 't4'],
          y: [5, 1, 7, 5],
          style: {
            line: 'red'
          }
        },
        {
          title: 'us-west',
          x: ['t1', 't2', 't3', 't4'],
          y: [2, 4, 9, 8],
          style: { line: 'yellow' }
        },
        {
          title: 'eu-north-with-some-long-string',
          x: ['t1', 't2', 't3', 't4'],
          y: [22, 7, 12, 1],
          style: { line: 'blue' }
        }
      ]
    };
  }
}

/**
 * Factory function
 */
export function line(options: LineOptions = {}): Line {
  return new Line(options);
}
