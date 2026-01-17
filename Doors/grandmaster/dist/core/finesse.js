"use strict";
/**
 * Finesse Detection System
 *
 * Tracks optimal movement and rotation for each piece placement
 * Detects when player uses suboptimal inputs (finesse errors)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinesseEvaluator = void 0;
/**
 * Finesse evaluator
 */
class FinesseEvaluator {
    constructor() {
        this.lastPiecePlacement = null;
        this.stats = {
            totalPlacements: 0,
            finesseErrors: 0,
            errorRate: 0,
            errorsByPiece: {
                I: 0,
                O: 0,
                T: 0,
                S: 0,
                Z: 0,
                J: 0,
                L: 0,
            },
        };
    }
    /**
     * Track a piece movement
     */
    trackMovement(piece, isRotation) {
        if (!this.lastPiecePlacement) {
            this.lastPiecePlacement = {
                piece: piece.type,
                rotation: piece.rotation,
                x: piece.x,
                moveCount: 0,
                rotationCount: 0,
            };
        }
        if (isRotation) {
            this.lastPiecePlacement.rotationCount++;
        }
        else {
            this.lastPiecePlacement.moveCount++;
        }
    }
    /**
     * Evaluate finesse when piece is locked
     */
    evaluatePlacement(piece) {
        if (!this.lastPiecePlacement)
            return true;
        const optimal = this.getOptimalInputs(piece.type, piece.rotation, piece.x);
        const isFinesse = this.lastPiecePlacement.moveCount <= optimal.moves &&
            this.lastPiecePlacement.rotationCount <= optimal.rotations;
        this.stats.totalPlacements++;
        if (!isFinesse) {
            this.stats.finesseErrors++;
            this.stats.errorsByPiece[piece.type]++;
        }
        this.stats.errorRate = this.stats.finesseErrors / this.stats.totalPlacements;
        // Reset tracking
        this.lastPiecePlacement = null;
        return isFinesse;
    }
    /**
     * Get optimal input count for a piece placement
     *
     * Based on standard SRS finesse rules:
     * - Spawn position is x=3 (except I piece at x=2)
     * - Rotation is counted
     * - Horizontal movement is counted
     */
    getOptimalInputs(type, rotation, finalX) {
        const spawnX = type === 'I' ? 2 : 3;
        const distance = Math.abs(finalX - spawnX);
        // Simple heuristic: optimal moves = distance + rotations
        // This is a simplified model; real finesse is more complex
        const moves = distance;
        const rotations = this.getOptimalRotations(type, rotation);
        return { moves, rotations };
    }
    /**
     * Get optimal rotation count
     *
     * Some rotations can be achieved faster with 180-spin or reverse rotation
     */
    getOptimalRotations(type, targetRotation) {
        // O piece doesn't rotate
        if (type === 'O')
            return 0;
        // For other pieces, optimal is minimum of:
        // - Clockwise rotations (targetRotation)
        // - Counter-clockwise rotations (4 - targetRotation)
        const cw = targetRotation;
        const ccw = (4 - targetRotation) % 4;
        return Math.min(cw, ccw);
    }
    /**
     * Get current finesse statistics
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Reset finesse tracking
     */
    reset() {
        this.stats = {
            totalPlacements: 0,
            finesseErrors: 0,
            errorRate: 0,
            errorsByPiece: {
                I: 0,
                O: 0,
                T: 0,
                S: 0,
                Z: 0,
                J: 0,
                L: 0,
            },
        };
        this.lastPiecePlacement = null;
    }
}
exports.FinesseEvaluator = FinesseEvaluator;
//# sourceMappingURL=finesse.js.map