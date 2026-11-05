/**
 * Worms in teletext: the part that decides where the shell lands.
 *
 * The 1996 original could not have this file. A television had no
 * processor, so Team17 drew every screen the game could ever reach in
 * advance and broadcast them as hidden pages - and the game died because a
 * day's broadcast could not hold enough of them. A BBS can simply work out
 * the shot.
 *
 * The playfield is what teletext gives us and no more: block graphics are
 * 2x3 pixels per character cell, so twenty rows of a 40-column page is
 * exactly 80 by 60 pixels. Every constant here is chosen for that size -
 * there is no point in a physics model finer than the screen.
 *
 * Pure and deterministic: same terrain, same angle, same power, same
 * landing. Nothing here knows what a socket is.
 */
/** The playfield, in pixels. 40 cells across, 20 rows down. */
export declare const FIELD_WIDTH = 80;
export declare const FIELD_HEIGHT = 60;
/** Downward acceleration per step. Tuned so a full-power shot crosses ~60px. */
export declare const GRAVITY = 0.035;
/**
 * How hard the wind pushes, per unit of wind, per step.
 *
 * Measured rather than guessed: at 0.004 a full five of wind moved a shot
 * 44 pixels on a field 80 wide, which is more than the difference between
 * power 6 and power 10. Wind is supposed to be the thing you correct for,
 * not the thing that decides the match.
 */
export declare const WIND_FORCE = 0.0018;
export interface Terrain {
    width: number;
    height: number;
    /** One byte per pixel, 1 where the ground is. */
    solid: Uint8Array;
}
export interface Point {
    x: number;
    y: number;
}
export interface Worm {
    id: string;
    team: number;
    x: number;
    y: number;
    hp: number;
}
export type Rng = () => number;
/**
 * A seeded generator, so a match can be replayed and a test can be written.
 * Mulberry32 - small, fast, good enough for a landscape.
 */
export declare function makeRng(seed: number): Rng;
export declare function emptyTerrain(width?: number, height?: number): Terrain;
export declare function isSolid(terrain: Terrain, x: number, y: number): boolean;
/**
 * A landscape, by midpoint displacement.
 *
 * Rough enough to hide behind, smooth enough that a worm is not stranded on
 * a one-pixel spike.
 */
export declare function generateTerrain(rng: Rng, width?: number, height?: number): Terrain;
/** The topmost solid pixel in a column, or the floor if the column is empty. */
export declare function surfaceAt(terrain: Terrain, x: number): number;
/** Blow a hole in the ground. */
export declare function carve(terrain: Terrain, at: Point, radius: number): void;
export interface ShotOptions {
    /** Degrees above horizontal, 0 to 90. */
    angle: number;
    /** 1 to 10. */
    power: number;
    /** -1 aims left, 1 aims right. */
    facing: -1 | 1;
    /** Signed: positive blows the shell to the right. */
    wind?: number;
}
export type ShotEnding = 'terrain' | 'worm' | 'offfield';
export interface ShotResult {
    /** Every point the shell passed through, for drawing the arc. */
    path: Point[];
    /** Where it stopped, or null when it left the field. */
    impact: Point | null;
    ending: ShotEnding;
    /** The worm it hit directly, if it hit one. */
    hit: string | null;
}
/**
 * Fire, and follow the shell until something stops it.
 *
 * Stepping by half a pixel rather than by a time slice is what keeps a
 * fast shot from tunnelling through a one-pixel ridge - at this resolution
 * a single missed sample is the difference between a hit and a miss.
 */
export declare function fire(terrain: Terrain, from: Point, worms: readonly Worm[], options: ShotOptions): ShotResult;
export interface Damage {
    id: string;
    amount: number;
}
/**
 * The blast, and what it costs whoever was standing near it.
 *
 * Damage falls off linearly with distance, which is crude and is exactly
 * what the game it imitates does.
 */
export declare function explode(terrain: Terrain, worms: Worm[], at: Point, radius: number, maxDamage: number): Damage[];
/**
 * Let gravity finish the job.
 *
 * A worm standing on ground that has just been blown out from under it
 * falls, and a long fall hurts. Returns what the fall cost.
 */
export declare function settle(terrain: Terrain, worms: Worm[]): Damage[];
/** Stand a worm on the surface of its column. */
export declare function place(terrain: Terrain, x: number): Point;
