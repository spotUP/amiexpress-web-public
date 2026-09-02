/**
 * Tetris Piece Definitions and Rotation Systems
 *
 * Supports:
 * - SRS (Super Rotation System) - Modern standard
 * - ARS (Arika Rotation System) - TGM classic
 * - NRS (Nintendo Rotation System) - Retro NES
 * - BARS (Bombliss Arika) - Hybrid
 */
import type { PieceType, RotationSystem, KickTable } from './types';
export declare const PIECE_COLORS: Record<PieceType, string>;
export declare const ARS_COLORS: Record<PieceType, string>;
export declare class PieceManager {
    private rotationSystem;
    private pool;
    private history;
    private readonly POOL_SIZE;
    private readonly HISTORY_SIZE;
    constructor(rotationSystem?: RotationSystem);
    /**
  
     * Initialize TGM3 piece pool
  
     */
    private initPool;
    /**
  
     * Get piece shape at specified rotation
  
     */
    /**
     * BIG pieces: every cell becomes a 2x2 block (HeborisCE judgeBigBlock /
     * setBigBlock, gamestart.c:16241-16297, which double every block offset
     * and then fill `for(k=0;k<2;k++) for(l=0;l<2;l++)`). Scaling the SHAPE
     * gives collision, ghost, lock and rendering the same behaviour without a
     * second code path for any of them.
     */
    getShape(type: PieceType, rotation: 0 | 1 | 2 | 3, big?: boolean): number[][];
    private getBaseShape;
    /**



     * Get wall kick offsets for rotation



     */
    getKicks(type: PieceType, fromRotation: number, toRotation: number): KickTable;
    /**



     * Get spawn position for piece type



     */
    getSpawnPosition(type: PieceType, boardWidth: number): {
        x: number;
        y: number;
    };
    /**



     * Generate random piece using TGM3 Pool Randomizer



     * 1:1 with HeborisCE random.c



     */
    getRandomPiece(): PieceType;
    private bag;
    /**
     * Fill initial queue
     */
    fillQueue(count: number): PieceType[];
    /**
     * Shuffle array (Fisher-Yates)
     */
    private shuffle;
    /**
     * Get piece color for rendering
     */
    getPieceColor(type: PieceType): string;
}
/**
 * Get occupied cells for a piece
 */
export declare function getPieceCells(shape: number[][], x: number, y: number): Array<{
    x: number;
    y: number;
}>;
/**
 * Double a shape in both axes - one cell becomes a 2x2 block.
 * See PieceManager.getShape()'s BIG note (gamestart.c:16241-16297).
 */
export declare function doubleShape(shape: number[][]): number[][];
//# sourceMappingURL=pieces.d.ts.map