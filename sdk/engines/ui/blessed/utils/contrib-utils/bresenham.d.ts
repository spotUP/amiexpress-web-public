/**
 * Bresenham's Line Algorithm
 *
 * Efficient line drawing algorithm for rasterizing lines
 * Used by drawille-canvas for drawing lines between points
 */
export interface Point {
    x: number;
    y: number;
}
/**
 * Generate points along a line from (x0, y0) to (x1, y1)
 * @param x0 Start X coordinate
 * @param y0 Start Y coordinate
 * @param x1 End X coordinate
 * @param y1 End Y coordinate
 * @param fn Optional callback function called for each point
 * @returns Array of points along the line
 */
export declare function bresenham(x0: number, y0: number, x1: number, y1: number, fn?: (x: number, y: number) => void): Point[];
