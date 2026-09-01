/**
 * Loads one of the sixteen original Pengo mazes onto the door's own grid.
 *
 * The raw transcription (`original-levels.ts`) is just characters; this is
 * where it becomes the same `CellType[][]` + egg-spawn shape
 * `PengoGame.initLevel()` already builds procedurally, so the caller does
 * not need to know or care which source a level came from.
 */
import { CellType, Position } from '../game/types';
export interface ParsedLevel {
    /** GRID_HEIGHT x GRID_WIDTH, border wall already filled in. */
    grid: CellType[][];
    /** Where an Egg entity should be created at level start. */
    eggSpawns: Position[];
}
/** How many original levels are transcribed - 1..originalLevelCount() are valid `loadOriginalLevel` arguments. */
export declare function originalLevelCount(): number;
/**
 * Parses level `levelNumber` (1-based) onto a fresh grid, or returns null
 * if there is no transcription for it - the caller's cue to fall back to
 * the procedural generator.
 *
 * The border ring (row 0, row GRID_HEIGHT-1, column 0, column
 * GRID_WIDTH-1) is always wall, regardless of what character the source
 * transcription has there - see the provenance note atop
 * `original-levels.ts` for why a handful of source cells land there and
 * what happens to them.
 */
export declare function loadOriginalLevel(levelNumber: number): ParsedLevel | null;
//# sourceMappingURL=index.d.ts.map