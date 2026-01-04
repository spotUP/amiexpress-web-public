/**
 * Map Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/map.js
 * Geographic map display with markers
 *
 * Note: Original depends on 'map-canvas' npm package for rendering.
 * This implementation provides the API but requires map-canvas integration.
 */
import { ContribCanvas as Canvas, ContribCanvasOptions as CanvasOptions } from './contrib-canvas';
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
export declare class Map extends Canvas {
    options: MapOptions;
    innerMap?: any;
    constructor(options?: MapOptions);
    private _drawPlaceholder;
    calcSize(): void;
    get type(): string;
    addMarker(options: MapMarker): void;
    clearMarkers(): void;
    getOptionsPrototype(): MapOptions;
}
/**
 * Factory function
 */
export declare function map(options?: MapOptions): Map;
