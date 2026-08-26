/**
 * Browser-side video encoders.
 *
 * Extracted from client.ts so they can be TESTED. They lived inside the
 * browser bundle, where a row that came out one column too wide - the fault
 * behind "every second frame in some render modes is broken" - could only be
 * found by looking at a webcam. The frame is drawn by concatenating one
 * string per cell, so equal width per row is the whole contract, and that is
 * checkable without a camera.
 *
 * Pure: pixels in, blessed-tagged text out. No DOM beyond the shape of the
 * pixel buffer, which is declared here rather than imported so this compiles
 * in a door that has no DOM lib.
 */
/** The part of ImageData these encoders use. */
export interface PixelBuffer {
    data: Uint8ClampedArray | number[];
    width?: number;
    height?: number;
}
/**
 * Source pixels per output char for each render mode.
 *  - ascii / color: 1 char = 1 pixel
 *  - halfblock:     1 char = 1x2 pixels (top half + bottom half)
 *  - braille:       1 char = 2x4 pixels (8 dots)
 */
export declare function pixelsPerChar(mode: string): {
    px: number;
    py: number;
};
export declare function rgbToBlessed(r: number, g: number, b: number): string;
export declare function renderAscii(img: PixelBuffer, w: number, h: number, colored: boolean): string;
/**
 * Half-block: U+2580 with fg=top, bg=bottom — each char encodes two
 * vertically-stacked pixels. Uses blessed 16-colour palette tokens via
 * rgbToBlessed() so the output is safe for blessed's cell buffer.
 */
export declare function renderHalfblock(img: PixelBuffer, w: number, h: number): string;
/**
 * Braille: 1 char = 2x4 source pixels mapped to 8 braille dots. Mono only
 * (Unicode braille blocks have no fg/bg style by themselves; renderer
 * picks a threshold). 8x effective resolution.
 *
 * Dot positions in U+2800..U+28FF:
 *   1 4
 *   2 5
 *   3 6
 *   7 8
 */
export declare function renderBraille(img: PixelBuffer, w: number, h: number): string;
/**
 * How wide one canvas pixel appears on screen, relative to its height.
 *
 * A terminal cell is about twice as tall as it is wide, and each render mode
 * packs a different number of canvas pixels into one cell (see
 * pixelsPerChar). In ASCII and colour modes one pixel IS one cell, so it
 * appears half as wide as it is tall; halfblock and braille pack two and four
 * rows into a cell, which comes out square.
 */
export declare function pixelAspect(mode: string): number;
export interface FitRect {
    dx: number;
    dy: number;
    dw: number;
    dh: number;
}
/**
 * Where to draw the camera inside the capture canvas so it keeps its shape.
 *
 * The camera used to be stretched to fill the canvas, which is fine only
 * while the tile happens to match the camera's proportions - and once the
 * video tile could be any shape, a wide tile gave everyone a wide face
 * ("it does not force aspect, it's wide now").
 *
 * The picture is fitted inside the canvas instead, centred, with the
 * leftover space black. `pixelAspect` is what makes this correct in a
 * TERMINAL rather than on a square-pixel screen.
 */
export declare function fitPreservingAspect(srcW: number, srcH: number, canvasW: number, canvasH: number, aspect: number): FitRect;
