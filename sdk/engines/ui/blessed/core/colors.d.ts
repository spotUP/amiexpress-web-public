/**
 * colors.ts - color-related functions for blessed.
 * EXACT 1:1 PORT of neo-blessed lib/colors.js
 * Copyright (c) 2013-2015, Christopher Jeffrey and contributors (MIT License).
 * https://github.com/chjj/blessed
 */
export declare const _cache: Record<number, number>;
export declare function match(r1: number | string | number[], g1?: number, b1?: number): number;
export declare function RGBToHex(r: number | number[], g?: number, b?: number): string;
export declare function hexToRGB(hex: string): [number, number, number];
export declare function mixColors(c1: number, c2: number, alpha?: number | null): number;
export declare function blend(attr: number, attr2?: number | null, alpha?: number): number;
export declare function reduce(color: number, total: number): number;
export declare const xterm: string[];
export declare const colors: string[];
export declare const vcolors: number[][];
export declare let ccolors: number[];
export declare const colorNames: Record<string, number>;
export declare function convert(color: number | string | number[]): number;
export declare const ncolors: string[];
export declare const TRANSPARENT = -1;
export declare function parseColor(color: string | number | undefined): number;
export declare function fg(color: string | number): string;
export declare function bg(color: string | number): string;
export declare const attrs: {
    reset: string;
    bold: string;
    dim: string;
    italic: string;
    underline: string;
    blink: string;
    inverse: string;
    invisible: string;
    strike: string;
    noBold: string;
    noItalic: string;
    noUnderline: string;
    noBlink: string;
    noInverse: string;
    noInvisible: string;
    noStrike: string;
};
export declare const cursor: {
    hide: string;
    show: string;
    save: string;
    restore: string;
    pos: (x: number, y: number) => string;
    up: (n?: number) => string;
    down: (n?: number) => string;
    forward: (n?: number) => string;
    backward: (n?: number) => string;
    nextLine: (n?: number) => string;
    prevLine: (n?: number) => string;
    col: (n: number) => string;
    home: string;
};
export declare const screen: {
    clear: string;
    clearToBottom: string;
    clearToTop: string;
    clearLine: string;
    clearLineRight: string;
    clearLineLeft: string;
    scrollUp: (n?: number) => string;
    scrollDown: (n?: number) => string;
    saveCursor: string;
    restoreCursor: string;
    setScrollRegion: (top: number, bottom: number) => string;
    resetScrollRegion: string;
};
export interface StyleFlags {
    fg?: string | number;
    bg?: string | number;
    bold?: boolean;
    dim?: boolean;
    italic?: boolean;
    underline?: boolean;
    blink?: boolean;
    inverse?: boolean;
    invisible?: boolean;
}
export declare function buildStyle(flags: StyleFlags): string;
export declare function parseTags(text: string): string;
export declare function stripAnsi(text: string): string;
export declare function textWidth(text: string): number;
export declare const colorToRgb: (color: number) => number[];
export declare const rgbToNearestColor: typeof match;
