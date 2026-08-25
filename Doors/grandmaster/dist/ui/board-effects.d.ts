/** One cell of the fading streak a hard drop leaves behind. */
export interface HardDropTrail {
    x: number;
    y: number;
    color: string;
    /** 0..1 - how solid this cell starts out, brightest nearest the landing. */
    strength: number;
    createdAt: number;
}
/** How long a trail cell stays on screen. Shared with every other door. */
export declare const TRAIL_LIFETIME_MS = 160;
/** The landing shadow. */
export declare const GHOST_CHAR = "{gray-fg}\u2591\u2591{/gray-fg}";
export declare function brightColor(color: string): string;
/**
 * A trail cell, solid while fresh and thinning as it fades.
 */
export declare function hardDropTrailChar(color: string, strength: number): string;
/**
 * The streak a piece leaves when it is slammed down.
 *
 * @param shape        piece shape, rows of 0/1
 * @param pieceX       piece column before the drop
 * @param pieceY       piece row before the drop
 * @param dropDistance rows travelled
 * @param color        colour name to fade out
 * @param bounds       rows outside [minY, maxY) are not drawn (the TGM board
 *                     hides its four spawn rows; TetriNET shows everything)
 */
export declare function buildHardDropTrail(shape: number[][], pieceX: number, pieceY: number, dropDistance: number, color: string, bounds: {
    minY: number;
    maxY: number;
}, now: number): HardDropTrail[];
/** Drop trail cells that have finished fading. */
export declare function expireTrails(trails: HardDropTrail[], now: number): HardDropTrail[];
/** The character for a trail cell at this moment, or null once it is gone. */
export declare function trailCharAt(trails: HardDropTrail[], x: number, y: number, now: number): string | null;
//# sourceMappingURL=board-effects.d.ts.map