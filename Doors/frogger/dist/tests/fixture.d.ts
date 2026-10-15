/**
 * A game in a known state, shared by the test files.
 */
import { FroggerData } from '../game/types';
import { Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { FroggerGame } from '../game/frogger-game';
export declare function createData(): FroggerData;
export declare function sheet(): Record<string, Sprite>;
/** A started level with no display attached. */
export declare function startedLevel(level?: number): {
    game: FroggerGame;
    data: FroggerData;
};
/** The lane carrying the FAQ's road or water lane `n`. */
export declare function laneOf(data: FroggerData, type: 'road' | 'water', n: number): import("../game/types").Lane;
//# sourceMappingURL=fixture.d.ts.map