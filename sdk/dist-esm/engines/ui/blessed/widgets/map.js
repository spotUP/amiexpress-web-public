/**
 * Map Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/map.js
 * Geographic map display with markers
 *
 * Responsive features:
 * - Auto-scales to container on resize
 * - Recalculates map dimensions on breakpoint change
 *
 * Note: Original depends on 'map-canvas' npm package for rendering.
 * This implementation provides the API but requires map-canvas integration.
 */
import { ContribCanvas as Canvas } from './contrib-canvas';
import { world, antarctica } from './map-data';
/**
 * Map Widget
 * Displays geographic maps with marker support
 */
export class Map extends Canvas {
    constructor(options = {}) {
        super(options);
        const init = () => {
            this.options.style = this.options.style || {};
            this.draw();
        };
        if (this.screen) {
            init();
        }
        this.on('attach', init);
    }
    calcSize() {
        // Get widget dimensions with minimums
        const widgetWidth = Math.max(20, this.width);
        const widgetHeight = Math.max(10, this.height);
        // Calculate canvas size
        // Width: subtract 12 pixels for padding/borders (approx 6 chars)
        let width = widgetWidth * 2 - 12;
        let height = widgetHeight * 4;
        // Ensure minimum canvas size for map rendering
        width = Math.max(32, width);
        height = Math.max(24, height);
        // Round to required multiples (width: 2, height: 4) for braille mapping
        width = Math.floor(width / 2) * 2;
        height = Math.floor(height / 4) * 4;
        this.canvasSize = { width, height };
        const labelSpace = this.options.labelSpace === undefined ? 5 : this.options.labelSpace;
        this.iMAP_START_X_POS = labelSpace;
        this.iMAP_START_Y_POS = labelSpace;
        this.iMAP_WIDTH = width - (labelSpace * 2);
        this.iMAP_HEIGHT = height - (labelSpace * 2);
    }
    get type() {
        return 'map';
    }
    degreesOfLatitudeToScreenY(iDegreesOfLatitude) {
        const minLat = this.options.startLat || 0;
        const maxLat = this.options.endLat || 180;
        const iAdjustedDegreesOfLatitude = Number(iDegreesOfLatitude) + 90;
        if (iAdjustedDegreesOfLatitude < minLat || iAdjustedDegreesOfLatitude > maxLat) {
            return undefined;
        }
        if (iAdjustedDegreesOfLatitude === minLat) {
            return this.iMAP_HEIGHT + this.iMAP_START_Y_POS;
        }
        else if (iAdjustedDegreesOfLatitude === maxLat) {
            return this.iMAP_START_Y_POS;
        }
        else {
            return (this.iMAP_HEIGHT - ((iAdjustedDegreesOfLatitude - minLat) * (this.iMAP_HEIGHT / (maxLat - minLat)))) + this.iMAP_START_Y_POS;
        }
    }
    degreesOfLongitudeToScreenX(iDegreesOfLongitude) {
        const minLon = this.options.startLon || 0;
        const maxLon = this.options.endLon || 360;
        const iAdjustedDegreesOfLongitude = Number(iDegreesOfLongitude) + 180;
        if (iAdjustedDegreesOfLongitude < minLon || iAdjustedDegreesOfLongitude > maxLon) {
            return undefined;
        }
        if (iAdjustedDegreesOfLongitude === minLon) {
            return this.iMAP_START_X_POS;
        }
        else if (iAdjustedDegreesOfLongitude === maxLon) {
            return this.iMAP_START_X_POS + this.iMAP_WIDTH;
        }
        else {
            return (this.iMAP_START_X_POS + ((iAdjustedDegreesOfLongitude - minLon) * (this.iMAP_WIDTH / (maxLon - minLon))));
        }
    }
    draw() {
        if (!this.ctx)
            return;
        const ctx = this.ctx;
        this.clear();
        // Draw background
        if (!this.options.disableBackground) {
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, this.canvasSize.width, this.canvasSize.height);
        }
        // Draw map background (ocean)
        if (!this.options.disableMapBackground) {
            ctx.fillStyle = 'blue';
            ctx.fillRect(this.iMAP_START_X_POS, this.iMAP_START_Y_POS, this.iMAP_WIDTH, this.iMAP_HEIGHT);
        }
        // Draw landmass
        this.drawLandMass();
        // Draw markers
        if (this.options.markers) {
            for (const m of this.options.markers) {
                this.drawMarker(m);
            }
        }
        this.syncContent();
    }
    drawLandMass() {
        const ctx = this.ctx;
        const shapes = [...world.shapes];
        if (!this.options.excludeAntarctica) {
            shapes.push(...antarctica.shapes);
        }
        const shapeColor = this.options.shapeColor || this.options.style.shapeColor || 'green';
        ctx.fillStyle = shapeColor;
        ctx.strokeStyle = shapeColor;
        for (const shape of shapes) {
            ctx.beginPath();
            let first = true;
            for (const point of shape) {
                const x = this.degreesOfLongitudeToScreenX(point.lon);
                const y = this.degreesOfLatitudeToScreenY(point.lat);
                if (x !== undefined && y !== undefined) {
                    if (first) {
                        ctx.moveTo(x, y);
                        first = false;
                    }
                    else {
                        ctx.lineTo(x, y);
                    }
                }
            }
            if (!this.options.disableFill)
                ctx.fill();
            ctx.stroke();
        }
    }
    drawMarker(marker) {
        const ctx = this.ctx;
        const x = this.degreesOfLongitudeToScreenX(marker.lon);
        const y = this.degreesOfLatitudeToScreenY(marker.lat);
        if (x !== undefined && y !== undefined) {
            ctx.fillStyle = marker.color || 'red';
            ctx.fillText(marker.char || 'X', x, y);
        }
    }
    addMarker(marker) {
        if (!this.options.markers) {
            this.options.markers = [];
        }
        this.options.markers.push(marker);
        if (this.ctx) {
            this.drawMarker(marker);
            this.syncContent();
        }
    }
    clearMarkers() {
        this.options.markers = [];
        this.draw();
    }
    getOptionsPrototype() {
        return {
            startLon: 10,
            endLon: 10,
            startLat: 10,
            endLat: 10,
            region: 'world',
            markers: [
                { lon: '-79.0000', lat: '37.5000', color: 'red', char: 'X' },
                { lon: '79.0000', lat: '37.5000', color: 'blue', char: 'O' }
            ]
        };
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        this.calcSize();
        this.draw();
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
/**
 * Factory function
 */
export function map(options = {}) {
    return new Map(options);
}
