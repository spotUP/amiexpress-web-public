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
/**
 * How often the playfield is actually painted (game-screen RENDER_FPS).
 *
 * Effects have to be authored against this, not against wall-clock taste: a
 * flash shorter than one interval is not a fast flash, it is a flash the
 * player sees or misses depending on where the frame boundary falls.
 */
export declare const RENDER_INTERVAL_MS: number;
export declare const LOCK_FLASH_MS: number;
/**
 * The white flash over a piece that has just locked, or null once it is over.
 *
 * Driven straight off elapsed time in whole render frames rather than off a
 * fading curve. The curve version was visible for 56 ms of a 100 ms life, so
 * at 20 fps it was sampled once, never, or - when it landed inside the first
 * 20 ms - as a solid white block. Same landing, three different pictures.
 */
export declare function lockFlashChar(elapsedMs: number): string | null;
/**
 * A cheap identity for an overlay frame.
 *
 * Only used to answer "did the effects change since the last paint", so it
 * compares content, not object identity - and an EMPTY overlay must be
 * distinguishable from a full one, which is the case that was missed.
 */
export declare function overlaySignature(overlay: (string | null)[][]): string;
/**
 * Whether the playfield has to be painted again this frame.
 *
 * `overlayChanged` is the one that was missing. The old gate asked whether
 * an effect was RUNNING, which is true on every frame of a flash and false
 * on the frame after it ends - so the last frame of the flash was never
 * cleared and stayed on the board until something unrelated moved. Asking
 * whether the overlay DIFFERS from what is on screen covers the appearance,
 * the animation and the disappearance with one question.
 */
export declare function boardNeedsRepaint(state: {
    boardChanged: boolean;
    overlayChanged: boolean;
    hasTrails: boolean;
    hadTrails: boolean;
    isShaking: boolean;
}): boolean;
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