"use strict";
/**
 * Map Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/map.js
 * Geographic map display with markers
 *
 * Note: Original depends on 'map-canvas' npm package for rendering.
 * This implementation provides the API but requires map-canvas integration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Map = void 0;
exports.map = map;
const canvas_1 = require("./canvas");
/**
 * Map Widget
 * Displays geographic maps with marker support
 */
class Map extends canvas_1.Canvas {
    constructor(options = {}) {
        super(options);
        this.on('attach', () => {
            this.options.style = this.options.style || {};
            const opts = {
                excludeAntartica: this.options.excludeAntarctica === undefined ? true : this.options.excludeAntarctica,
                disableBackground: this.options.disableBackground === undefined ? true : this.options.disableBackground,
                disableMapBackground: this.options.disableMapBackground === undefined
                    ? true
                    : this.options.disableMapBackground,
                disableGraticule: this.options.disableGraticule === undefined ? true : this.options.disableGraticule,
                disableFill: this.options.disableFill === undefined ? true : this.options.disableFill,
                width: this.ctx._canvas.width,
                height: this.ctx._canvas.height,
                shapeColor: this.options.style.shapeColor || 'green',
                startLon: this.options.startLon,
                endLon: this.options.endLon,
                startLat: this.options.startLat,
                endLat: this.options.endLat,
                region: this.options.region,
                labelSpace: this.options.labelSpace || 5
            };
            this.ctx.strokeStyle = this.options.style.stroke || 'green';
            this.ctx.fillStyle = this.options.style.fill || 'green';
            // Note: map-canvas integration would go here
            // For now, draw a placeholder
            this._drawPlaceholder();
            if (this.options.markers) {
                for (const m of this.options.markers) {
                    this.addMarker(m);
                }
            }
            // Sync canvas content to element
            this.syncContent();
        });
    }
    _drawPlaceholder() {
        if (!this.ctx)
            return;
        const c = this.ctx;
        const w = this.canvasSize.width;
        const h = this.canvasSize.height;
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
    calcSize() {
        // Get widget dimensions with minimums
        const widgetWidth = Math.max(20, this.width);
        const widgetHeight = Math.max(10, this.height);
        // Calculate canvas size
        let width = widgetWidth * 2 - 8;
        let height = widgetHeight * 4;
        // Ensure minimum canvas size for map rendering
        width = Math.max(32, width);
        height = Math.max(24, height);
        // Round to required multiples (width: 2, height: 4) for braille mapping
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 4) * 4;
        this.canvasSize = { width, height };
    }
    get type() {
        return 'map';
    }
    addMarker(options) {
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
    clearMarkers() {
        this.options.markers = [];
        if (this.innerMap) {
            this.innerMap.draw();
        }
        else {
            this._drawPlaceholder();
        }
        // Sync canvas content to element
        this.syncContent();
    }
    getOptionsPrototype() {
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
exports.Map = Map;
/**
 * Factory function
 */
function map(options = {}) {
    return new Map(options);
}
