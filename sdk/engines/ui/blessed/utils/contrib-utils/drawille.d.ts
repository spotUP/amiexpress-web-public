/**
 * Drawille - Braille Canvas for Terminal
 *
 * 1:1 port from drawille-blessed-contrib/index.js
 * Uses Unicode Braille characters (U+2800-U+28FF) for high-resolution terminal graphics
 *
 * Each Braille character represents a 2x4 pixel grid:
 * ⠁ ⠂ ⠄ ⠈ ⠐ ⠠ ⡀ ⢀
 */
/**
 * Standard terminal color codes
 */
export declare const colors: {
    black: number;
    red: number;
    green: number;
    yellow: number;
    blue: number;
    magenta: number;
    cyan: number;
    white: number;
    normal: number;
};
/**
 * Braille Canvas
 * Provides high-resolution drawing using Unicode Braille characters
 */
export declare class DrawilleCanvas {
    width: number;
    height: number;
    content: Uint8Array;
    colors: (string | number | null)[];
    chars: (string | null)[];
    fontFg: string | number;
    fontBg: string | number;
    color: string | number;
    constructor(width: number, height: number);
    /**
     * Get coordinate index in the buffer
     */
    getCoord(x: number, y: number): number;
    /**
     * Set a pixel (turn on)
     */
    set(x: number, y: number): void;
    /**
     * Unset a pixel (turn off)
     */
    unset(x: number, y: number): void;
    /**
     * Toggle a pixel
     */
    toggle(x: number, y: number): void;
    /**
     * Clear the entire canvas
     */
    clear(): void;
    /**
     * Measure text width
     */
    measureText(str: string): {
        width: number;
    };
    /**
     * Write text at position
     */
    writeText(str: string, x: number, y: number): void;
    /**
     * Render canvas to string
     * @param delimiter Line delimiter (default: '\n')
     * @returns Rendered canvas as string with ANSI codes
     */
    frame(delimiter?: string): string;
}
