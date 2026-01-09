/**
 * Gauge List Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/gauge-list.js
 * Multiple gauges displayed in a vertical list
 *
 * Responsive features:
 * - Auto-scales to container on resize
 */

import { ContribCanvas as Canvas, ContribCanvasOptions as CanvasOptions } from './contrib-canvas';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

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
  private _pendingGauges: GaugeListItem[] | null = null;

  constructor(options: GaugeListOptions = {}) {
    super(options);

    this.options.stroke = this.options.stroke || 'magenta';
    this.options.fill = this.options.fill || 'white';
    this.options.showLabel = this.options.showLabel !== false;
    this.options.gaugeSpacing = this.options.gaugeSpacing || 0;
    this.options.gaugeHeight = this.options.gaugeHeight || 1;

    // Apply pending gauges or initial gauges once attached
    const applyData = () => {
      if (this._pendingGauges) {
        this._renderGauges(this._pendingGauges);
        this._pendingGauges = null;
      } else if (this.options.gauges) {
        this.gauges = this.options.gauges;
        this._renderGauges(this.gauges);
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
    // Get widget dimensions, ensuring minimum sizes
    const widgetWidth = Math.max(8, (this as any).width as number);
    const widgetHeight = Math.max(4, (this as any).height as number);

    // Calculate canvas size
    let width = widgetWidth - 2;
    let height = widgetHeight;

    // Ensure minimum canvas size
    width = Math.max(4, width);
    height = Math.max(4, height);

    // Round to required multiples (width: 2, height: 4)
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 4) * 4;

    (this as any).canvasSize = { width, height };
  }

  get type(): string {
    return 'gauge';
  }

  setData(): void {
    // Empty implementation as in original
  }

  setGauges(gauges: GaugeListItem[]): void {
    if (!(this as any).ctx) {
      this._pendingGauges = gauges;
      return;
    }
    this._renderGauges(gauges);
  }

  private _renderGauges(gauges: GaugeListItem[]): void {
    if (!(this as any).ctx) return;

    const c = (this as any).ctx;
    c.clearRect(0, 0, (this as any).canvasSize!.width, (this as any).canvasSize!.height);

    for (let i = 0; i < gauges.length; i++) {
      this.setSingleGauge(gauges[i], i);
    }

    // Sync canvas content to element
    (this as any).syncContent();
  }

  setSingleGauge(gauge: GaugeListItem, offset: number): void {
    const colors = ['green', 'magenta', 'cyan', 'red', 'blue'];
    const stack = gauge.stack;

    const c = (this as any).ctx!;
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

      const width = (percent / 100) * ((this as any).canvasSize!.width - 5);

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

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    this.calcSize();
    if (this.gauges) {
      this._renderGauges(this.gauges);
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}

/**
 * Factory function
 */
export function gaugeList(options: GaugeListOptions = {}): GaugeList {
  return new GaugeList(options);
}
