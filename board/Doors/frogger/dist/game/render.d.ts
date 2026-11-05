/**
 * The board as cells: pure in (data, sheet, tick).
 *
 * The same shape Pengo's renderer takes, for the same reason. The old
 * painter decided colour by matching characters in a string it had just
 * built; here what a thing looks like is decided by which sprite was
 * blitted, so the class of bug where a log is coloured like a car because
 * its glyph happened to match cannot recur.
 *
 * Layer order is meaning, bottom to top:
 *
 *   1. the lanes themselves - road, water, banks, hedge
 *   2. the homes cut into the hedge
 *   3. whatever floats or drives in a lane: logs, turtles, crocodiles, cars
 *   4. riders - a snake or the lady frog sitting on a log
 *   5. the snakes patrolling the median
 *   6. the frog, last, so nothing can ever hide it
 *
 * A frog you cannot see is the worst thing this door can do, so it is drawn
 * over everything including the thing carrying it.
 */
import { CellBuffer, Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { FroggerData } from './types';
export declare function buildBoard(data: FroggerData, sheet: Record<string, Sprite>, tick: number): CellBuffer;
/**
 * The board as blessed tag rows, one string per terminal row.
 *
 * The engine's own converter, not a local one: a Cell carries colours as
 * palette INDICES, and blessed wants names, so a hand-rolled version emits
 * `{4-bg}` where blessed expects `{blue-bg}` - tags that are silently
 * ignored, leaving a board drawn in whatever colour happened to be current.
 *
 * The fallback is the water blue rather than black: a transparent cell on
 * this board is a hole in a lane, and a hole should look like the lane.
 */
export declare function boardToLines(board: CellBuffer): string[];
//# sourceMappingURL=render.d.ts.map