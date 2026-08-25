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
