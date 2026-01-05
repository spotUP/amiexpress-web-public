/**
 * Donut Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/donut.js
 * Displays donut/pie charts with percentage labels
 */

import { ContribCanvas as Canvas, ContribCanvasOptions as CanvasOptions } from './contrib-canvas';

export interface DonutData {
  label: string;
  percent: number | string;
  percentAltNumber?: number;
  color?: string | number | number[];
}

export interface DonutOptions extends CanvasOptions {
  stroke?: string | number | number[];
  fill?: string | number | number[];
  radius?: number;
  arcWidth?: number;
  spacing?: number;
  yPadding?: number;
  remainColor?: string | number | number[];
  data?: DonutData[];
}

/**
 * Donut Chart Widget
 * Displays circular progress indicators with labels
 */
export class Donut extends Canvas {
  declare options: DonutOptions;
  currentData?: DonutData[];
  private _pendingData?: DonutData[];

  constructor(options: DonutOptions = {}) {
    super(options);

    this.options.stroke = this.options.stroke || 'magenta';
    this.options.fill = this.options.fill || 'white';
    this.options.radius = this.options.radius || 8;
    this.options.arcWidth = this.options.arcWidth || 4;
    this.options.spacing = this.options.spacing || 2;
    this.options.yPadding = this.options.yPadding || 2;
    this.options.remainColor = this.options.remainColor || 'black';
    this.options.data = this.options.data || [];

    // Handle deferred setData - when widget is attached, render any pending data
    const applyData = () => {
      if (this._pendingData) {
        this.setData(this._pendingData);
        this._pendingData = undefined;
      } else if (this.options.data && this.options.data.length > 0) {
        this.setData(this.options.data);
      }
    };

    // If already attached (parent was specified in options), apply data now
    if ((this as any).screen && (this as any).ctx) {
      applyData();
    }

    // Also listen for future attach events
    (this as any).on('attach', applyData);
  }

  calcSize(): void {
    // Get widget dimensions with minimums
    const widgetWidth = Math.max(10, (this as any).width as number);
    const widgetHeight = Math.max(6, (this as any).height as number);

    // Calculate canvas size
    let width = Math.round(widgetWidth * 2 - 5);
    let height = widgetHeight * 4 - 8;

    // Ensure minimum canvas size for donut rendering (needs radius * 2)
    width = Math.max(20, width);
    height = Math.max(16, height);

    // Round to required multiples (width: 2, height: 4) for braille mapping
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 4) * 4;

    (this as any).canvasSize = { width, height };
  }

  get type(): string {
    return 'donut';
  }

  setData(data: DonutData[]): void {
    // If context not ready yet, store data for later when widget is attached
    if (!(this as any).ctx) {
      this._pendingData = data;
      return;
    }
    this.update(data);
  }

  update(data: DonutData[]): void {
    if (!(this as any).ctx) {
      // Should not happen if called through setData, but guard anyway
      this._pendingData = data;
      return;
    }

    const c = (this as any).ctx;
    const cos = Math.cos;
    const sin = Math.sin;
    const pi = 3.141592635;

    c.save();
    c.translate(0, -this.options.yPadding!);

    c.strokeStyle = this.options.stroke!;
    c.fillStyle = this.options.fill!;

    c.clearRect(0, 0, (this as any).canvasSize!.width, (this as any).canvasSize!.height);

    const cheight = (this as any).canvasSize!.height;
    const cwidth = (this as any).canvasSize!.width;

    const makeRound = (
      percent: number,
      radius: number,
      width: number,
      cx: number,
      cy: number,
      color: string | number | number[]
    ): void => {
      let s = 0;
      const points = 370;
      c.strokeStyle = color || 'green';
      while (s < radius) {
        if (s < radius - width) {
          s++;
          continue;
        }
        const slice = (2 * pi) / points;
        c.beginPath();
        const p = parseFloat((percent * 360).toString());
        for (let i = 0; i <= points; i++) {
          if (i > p) continue;
          const si = i - 90;
          const a = slice * si;
          c.lineTo(Math.round(cx + s * cos(a)), Math.round(cy + s * sin(a)));
        }
        c.stroke();
        c.closePath();
        s++;
      }
    };

    const donuts = data.length;
    const radius = this.options.radius!;
    const width = this.options.arcWidth!;
    const remainColor = this.options.remainColor!;

    const middle = cheight / 2;
    const spacing = (cwidth - donuts * radius * 2) / (donuts + 1);

    const drawDonut = (
      label: string,
      percent: number,
      radius: number,
      width: number,
      cxx: number,
      middle: number,
      color: string | number | number[],
      percentAltNumber?: number
    ): void => {
      // Skip drawing remain circle if remainColor is 'black' (invisible on black terminals)
      // or 'none'/'transparent' (explicit skip)
      const skipRemain = remainColor === 'black' || remainColor === 'none' || remainColor === 'transparent';
      if (!skipRemain) {
        makeRound(1, radius, width, cxx, middle, remainColor);
      }
      makeRound(percent, radius, width, cxx, middle, color);
      const ptext = percentAltNumber
        ? percentAltNumber.toFixed(0)
        : parseFloat((percent * 100).toString()).toFixed(0) + '%';
      c.fillText(
        ptext,
        cxx - Math.round(parseFloat(c.measureText(ptext).width.toString()) / 2) + 3,
        middle
      );
      c.fillText(
        label,
        cxx - Math.round(parseFloat(c.measureText(label).width.toString()) / 2) + 3,
        middle + radius + 5
      );
    };

    const makeDonut = (stat: DonutData, which: number): void => {
      const left = radius + spacing * which + radius * 2 * (which - 1);
      let percent =
        typeof stat.percent === 'string' ? parseFloat(stat.percent) : stat.percent;
      if (percent > 1.001) {
        percent = parseFloat((percent / 100).toFixed(2));
      }
      const label = stat.label;
      const percentAltNumber = stat.percentAltNumber;
      const color = stat.color || 'green';
      const cxx = left;
      drawDonut(label, percent, radius, width, cxx, middle, color, percentAltNumber);
    };

    const makeDonuts = (stats: DonutData[]): void => {
      for (let l = 0; l <= stats.length - 1; l++) {
        makeDonut(stats[l], l + 1);
      }
    };

    if (data.length) {
      makeDonuts(data);
    }

    this.currentData = data;

    c.strokeStyle = 'magenta';

    c.restore();

    // Sync canvas content to element
    (this as any).syncContent();
  }

  getOptionsPrototype(): DonutOptions {
    return {
      spacing: 1,
      yPadding: 1,
      radius: 1,
      arcWidth: 1,
      data: [
        { color: 'red', percent: '50', label: 'a' },
        { color: 'blue', percent: '20', label: 'b' },
        { color: 'yellow', percent: '80', label: 'c' }
      ]
    };
  }
}

/**
 * Factory function
 */
export function donut(options: DonutOptions = {}): Donut {
  return new Donut(options);
}
