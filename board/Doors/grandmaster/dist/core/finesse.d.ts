/**
 * Finesse Detection System
 *
 * Tracks optimal movement and rotation for each piece placement
 * Detects when player uses suboptimal inputs (finesse errors)
 */
import type { PieceType, Piece } from './types';
/**
 * Finesse statistics for a game session
 */
export interface FinesseStats {
    totalPlacements: number;
    finesseErrors: number;
    errorRate: number;
    errorsByPiece: Record<PieceType, number>;
}
/**
 * Finesse evaluator
 */
export declare class FinesseEvaluator {
    private stats;
    private lastPiecePlacement;
    constructor();
    /**
     * Track a piece movement
     */
    trackMovement(piece: Piece, isRotation: boolean): void;
    /**
     * Evaluate finesse when piece is locked
     */
    evaluatePlacement(piece: Piece): boolean;
    /**
     * Get optimal input count for a piece placement
     *
     * Based on standard SRS finesse rules:
     * - Spawn position is x=3 (except I piece at x=2)
     * - Rotation is counted
     * - Horizontal movement is counted
     */
    private getOptimalInputs;
    /**
     * Get optimal rotation count
     *
     * Some rotations can be achieved faster with 180-spin or reverse rotation
     */
    private getOptimalRotations;
    /**
     * Get current finesse statistics
     */
    getStats(): FinesseStats;
    /**
     * Reset finesse tracking
     */
    reset(): void;
}
//# sourceMappingURL=finesse.d.ts.map