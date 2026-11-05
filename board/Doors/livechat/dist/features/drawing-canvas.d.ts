import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export declare function createDrawingCanvas(s: Screen, sock: any, st: any, cl: any, tb: any, bbs: any, ib: any, gcdn: (c: string) => string, ucl: () => void, usb: () => void, asm: (m: string) => void, MH: number, SW: number, SH: number, IH: number): {
    drawingCanvas: import("@amiexpress/bbs-door-sdk/engines/ui/blessed").Canvas;
    drawingChannels: Set<string>;
    isDrawingChannel: (cn: string) => boolean;
    enterDrawingMode: (cn: string) => void;
    exitDrawingMode: () => void;
};
