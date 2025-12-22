/**
 * ANSI color and style utilities
 */
export declare const TRANSPARENT = -1;
export declare const colorNames: Record<string, number>;
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
//# sourceMappingURL=colors.d.ts.map