/**
 * TetriNET Board Extensions
 *
 * Extended board and cell types that support special blocks.
 * TetriNET cells can contain special blocks that are collected when lines clear.
 */
import type { Board, Cell } from '../types';
import type { SpecialType } from './specials';
/**
 * Extended cell type that can contain a special block
 */
export interface TetriNetCell extends Cell {
    special?: SpecialType;
}
/**
 * Extended board type with TetriNet cells
 */
export interface TetriNetBoard extends Board {
    grid: TetriNetCell[][];
}
/**
 * Create an empty TetriNET board
 */
export declare function createTetriNetBoard(width?: number, height?: number): TetriNetBoard;
/**
 * Place a special block at a specific cell
 */
export declare function placeSpecialBlock(board: TetriNetBoard, x: number, y: number, special: SpecialType): boolean;
/**
 * Remove special from a cell
 */
export declare function removeSpecialBlock(board: TetriNetBoard, x: number, y: number): SpecialType | null;
/**
 * Get special at a cell
 */
export declare function getSpecialAt(board: TetriNetBoard, x: number, y: number): SpecialType | null;
/**
 * Find all special blocks on the board
 */
export declare function findSpecialBlocks(board: TetriNetBoard): Array<{
    x: number;
    y: number;
    special: SpecialType;
}>;
/**
 * Count special blocks on the board
 */
export declare function countSpecialBlocks(board: TetriNetBoard): number;
/**
 * Remove all special blocks from the board
 */
export declare function clearAllSpecialBlocks(board: TetriNetBoard): number;
/**
 * Clear lines and collect specials from cleared cells
 * Returns the collected specials
 */
export declare function clearLinesWithSpecials(board: TetriNetBoard, lines: number[]): SpecialType[];
/**
 * Add random specials to the board based on lines cleared
 * This is called after placing a piece to distribute special blocks
 */
export declare function addRandomSpecials(board: TetriNetBoard, count: number, rule?: 'classic' | 'standard' | 'extended'): SpecialType[];
/**
 * Add garbage lines to the bottom of the board
 */
export declare function addGarbageLines(board: TetriNetBoard, lineCount: number, lineType?: 'addline' | 'classic'): boolean;
/**
 * Encode board for network transmission (TetriNET format)
 * 0 = empty, 1-7 = piece colors, 8+ = specials
 */
export declare function encodeBoard(board: TetriNetBoard): string;
/**
 * Decode board from network transmission
 */
export declare function decodeBoard(encoded: string, width?: number, height?: number): TetriNetBoard;
export declare function addSpecialsToField(board: TetriNetBoard, count: number, availableSpecials: SpecialType[], pickSpecial?: () => SpecialType): SpecialType[];
/**
 * Clone a TetriNET board
 */
export declare function cloneTetriNetBoard(board: TetriNetBoard): TetriNetBoard;
/**
 * Get display character for a cell (for rendering)
 */
export declare function getCellDisplay(cell: TetriNetCell): string;
//# sourceMappingURL=tetrinet-board.d.ts.map