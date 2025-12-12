/**
 * Map Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/map.js
 * Geographic map display with markers
 *
 * Note: Original depends on 'map-canvas' npm package for rendering.
 * This implementation provides the API but requires map-canvas integration.
 */

import { Canvas, CanvasOptions } from './canvas';

export interface MapMarker {
  lon: string | number;
  lat: string | number;
  color?: string | number | number[];
  char?: string;
}

export interface MapOptions extends CanvasOptions {
  excludeAntarctica?: boolean;
  disableBackground?: boolean;
  disableMapBackground?: boolean;
  disableGraticule?: boolean;
  disableFill?: boolean;
  shapeColor?: string | number | number[];
  startLon?: number;
  endLon?: number;
  startLat?: number;
  endLat?: number;
  region?: string;
  labelSpace?: number;
  markers?: MapMarker[];
}

/**
 * Map Widget
 * Displays geographic maps with marker support
 */
export class Map extends Canvas {
  declare options: MapOptions;
  innerMap?: any;

  constructor(options: MapOptions = {}) {
    super(options);

    this.on('attach', () => {
      this.options.style = this.options.style || {};

      const opts = {
        excludeAntartica:
          this.options.excludeAntarctica === undefined ? true : this.options.excludeAntarctica,
        disableBackground:
          this.options.disableBackground === undefined ? true : this.options.disableBackground,
        disableMapBackground:
          this.options.disableMapBackground === undefined
            ? true
            : this.options.disableMapBackground,
        disableGraticule:
          this.options.disableGraticule === undefined ? true : this.options.disableGraticule,
        disableFill: this.options.disableFill === undefined ? true : this.options.disableFill,
        width: this.ctx!._canvas.width,
        height: this.ctx!._canvas.height,
        shapeColor: (this.options.style as any).shapeColor || 'green',
        startLon: this.options.startLon,
        endLon: this.options.endLon,
        startLat: this.options.startLat,
        endLat: this.options.endLat,
        region: this.options.region,
        labelSpace: this.options.labelSpace || 5
      };

      this.ctx!.strokeStyle = (this.options.style as any).stroke || 'green';
      this.ctx!.fillStyle = (this.options.style as any).fill || 'green';

      // Note: map-canvas integration would go here
      // For now, draw a placeholder
      this._drawPlaceholder();

      if (this.options.markers) {
        for (const m of this.options.markers) {
          this.addMarker(m);
        }
      }
    });
  }

  private _drawPlaceholder(): void {
    if (!this.ctx) return;

    const c = this.ctx;
    const w = this.canvasSize!.width;
    const h = this.canvasSize!.height;

    // Draw a simple world outline placeholder
    c.strokeStyle = 'green';
    c.beginPath();
    c.moveTo(w * 0.1, h * 0.3);
    c.lineTo(w * 0.9, h * 0.3);
    c.lineTo(w * 0.9, h * 0.7);
    c.lineTo(w * 0.1, h * 0.7);
    c.lineTo(w * 0.1, h * 0.3);
    c.stroke();
    c.closePath();

    c.fillStyle = 'white';
    c.fillText('[Map Widget - map-canvas integration needed]', w * 0.2, h * 0.5);
  }

  calcSize(): void {
    this.canvasSize = {
      width: (this.width as number) * 2 - 12,
      height: (this.height as number) * 4
    };
  }

  get type(): string {
    return 'map';
  }

  addMarker(options: MapMarker): void {
    if (!this.innerMap) {
      // Store markers for later rendering
      if (!this.options.markers) {
        this.options.markers = [];
      }
      if (!this.options.markers.find((m) => m.lon === options.lon && m.lat === options.lat)) {
        this.options.markers.push(options);
      }
      return;
    }

    this.innerMap.addMarker(options);
  }

  clearMarkers(): void {
    this.options.markers = [];
    if (this.innerMap) {
      this.innerMap.draw();
    } else {
      this._drawPlaceholder();
    }
  }

  getOptionsPrototype(): MapOptions {
    return {
      startLon: 10,
      endLon: 10,
      startLat: 10,
      endLat: 10,
      region: 'us',
      markers: [
        { lon: '-79.0000', lat: '37.5000', color: 'red', char: 'X' },
        { lon: '79.0000', lat: '37.5000', color: 'blue', char: 'O' }
      ]
    };
  }
}

/**
 * Factory function
 */
export function map(options: MapOptions = {}): Map {
  return new Map(options);
}
