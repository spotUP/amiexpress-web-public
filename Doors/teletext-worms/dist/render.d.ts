/**
 * The match, drawn as a teletext page.
 *
 * Four rows of read-out and twenty rows of battlefield: 40 cells of block
 * graphics at 2x3 pixels each is 80 by 60, which is the whole resolution
 * this game has.
 *
 * Colour costs a cell. A mosaic colour is a spacing attribute, so every
 * change of colour along a row takes a character position with it - which
 * is why teletext pictures have those little gaps in them, and why this
 * draws each row as a few long runs rather than colouring cell by cell.
 * The gap falls on the cell where the run starts, so worms are drawn last
 * and the gap lands on terrain rather than on a worm.
 */
import { type ColorName } from '@amiexpress/bbs-door-sdk/teletext/compose';
import type { TeletextSubpage } from '@amiexpress/bbs-door-sdk/teletext';
import { type Terrain, type Worm, type Point } from './physics';
/** The page row the battlefield starts on. Everything above is read-out. */
export declare const FIELD_TOP_ROW = 4;
export declare const FIELD_CELL_ROWS: number;
export declare const FIELD_CELL_COLS: number;
export declare const TEAM_COLORS: ColorName[];
export interface FieldView {
    terrain: Terrain;
    worms: readonly Worm[];
    /** The shot's path, when one is being shown. */
    arc?: readonly Point[] | null;
    impact?: Point | null;
}
export interface HudView {
    teams: {
        name: string;
        hp: number;
        worms: number;
    }[];
    turn: number;
    wind: number;
    angle: number;
    power: number;
    facing: -1 | 1;
    /** A line of its own, when there is something to say. */
    message?: string;
}
export declare function matchPage(field: FieldView, hud: HudView): TeletextSubpage;
/** The page shown when a match ends. */
export declare function resultPage(winner: string | null, summary: string[]): TeletextSubpage;
/** A plain page, for menus and errors. */
export declare function messagePage(title: string, lines: string[], color?: ColorName): TeletextSubpage;
