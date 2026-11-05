/**
 * TetriNET 1.x piece definitions (gtetrinet reference).
 *
 * Shapes are 4x4 matrices with 1 = filled, 0 = empty.
 */
import type { PieceType } from '../types';
export declare const TETRINET_PIECE_ORDER: PieceType[];
export declare function getTetriNetShape(type: PieceType, rotation: number): number[][];
export declare function getRotationCount(type: PieceType): number;
//# sourceMappingURL=tetrinet-pieces.d.ts.map