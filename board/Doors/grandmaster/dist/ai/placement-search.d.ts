/**
 * Placement search
 *
 * One board evaluator for every bot in the door. It was written for the TGM
 * bot (El-Tetris weights, one scratch grid reused across candidates) while
 * the TetriNET bot shipped with `findBestMove()` returning a RANDOM move and
 * a comment reading "In a real implementation, this would evaluate multiple
 * positions" - so TetriNET's opponents never actually played.
 *
 * It needs nothing but a grid of filled flags and the piece shapes, so the
 * 10x24 TGM board and the 12x22 TetriNET field both feed it unchanged.
 */
/** Anything with filled cells: a TGM Board or a TetriNET field. */
export interface PlacementGrid {
    width: number;
    height: number;
    grid: Array<Array<{
        filled: boolean;
    }>>;
}
export interface PlacementEvaluation {
    x: number;
    rotation: number;
    score: number;
}
/** Shape lookup for one piece type, or null when that rotation is invalid. */
export type ShapeLookup = (rotation: number) => number[][] | null;
export declare class PlacementSearch {
    private difficulty;
    private scratch;
    private colHeights;
    private scratchW;
    private scratchH;
    /**
     * @param difficulty 1-10; below 10 the score is jittered so weaker bots
     *   make visibly worse choices instead of playing perfectly but slowly.
     */
    constructor(difficulty?: number);
    setDifficulty(difficulty: number): void;
    /** Best (column, rotation) for this piece, by score. */
    findBest(board: PlacementGrid, shapeFor: ShapeLookup, rotations?: number): PlacementEvaluation;
    /** Score one placement by dropping it into a scratch copy of the board. */
    evaluate(board: PlacementGrid, x: number, shape: number[][]): number;
}
//# sourceMappingURL=placement-search.d.ts.map