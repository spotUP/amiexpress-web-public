/**
 * Board Management
 *
 * Handles:
 * - Collision detection
 * - Line clearing
 * - Piece placement
 * - Ghost piece calculation
 */
import type { Board, PieceType } from './types';
/**
 * Create empty board
 */
export declare function createBoard(width?: number, height?: number): Board;
/**
 * Check if piece collides with board
 */
export declare function checkCollision(board: Board, shape: number[][], x: number, y: number): boolean;
/**
 * Place piece on board (lock it in)
 */
export declare function placePiece(board: Board, shape: number[][], x: number, y: number, pieceType: PieceType): void;
/**
 * Get ghost piece Y position (hard drop preview)
 */
export declare function getGhostY(board: Board, shape: number[][], x: number, startY: number): number;
/**
 * Check for complete lines and return their indices
 */
export declare function getCompleteLines(board: Board): number[];
/**
 * Clear completed lines from board
 */
export declare function clearLines(board: Board, lines: number[]): void;
/**
 * Check if board is topped out (game over)
 */
export declare function isTopOut(board: Board): boolean;
/**
 * Number of board rows the player can actually see.
 *
 * The board is taller than the rendered playfield: the extra rows at the top
 * are a spawn buffer that no screen draws (game-screen renders y=4..23 of a
 * 24-row board). They are scenery for spawning, NOT extra playing space.
 */
export declare const VISIBLE_ROWS = 20;
/** First board row the player can see; everything above it is spawn buffer. */
export declare function getVisibleTop(board: Board): number;
/**
 * Check if perfect clear (all cells empty)
 */
export declare function isPerfectClear(board: Board): boolean;
/**
 * Get board height (highest filled cell)
 */
export declare function getBoardHeight(board: Board): number;
/**
 * Get column height
 */
export declare function getColumnHeight(board: Board, x: number): number;
/**
 * Count holes in board (empty cell with filled cell above)
 */
export declare function countHoles(board: Board): number;
/**
 * Get bumpiness (sum of height differences between adjacent columns)
 */
export declare function getBumpiness(board: Board): number;
/**
 * Add garbage lines to bottom of board
 */
export declare function addGarbage(board: Board, lines: number, holePosition: number): void;
/**
 * Pre-fill the bottom N rows with garbage for Dig mode.
 * Each row has exactly one random hole position.
 */
export declare function addGarbageLines(board: Board, count: number): void;
/**
 * Clone board for simulation
 */
export declare function cloneBoard(board: Board): Board;
//# sourceMappingURL=board.d.ts.map