"use strict";
/**
 * Rollback Netcode
 *
 * Implements rollback netcode for handling server corrections:
 * - Misprediction detection
 * - State restoration from snapshots
 * - Input replay after rollback
 * - Server state reconciliation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DesyncDetector = exports.RollbackManager = void 0;
const prediction_1 = require("./prediction");
/**
 * Rollback netcode manager
 */
class RollbackManager {
    constructor(engine, predictionManager, config) {
        this.rollbackHistory = [];
        this.lastRollbackTime = 0;
        this.totalRollbacks = 0;
        this.totalMismatches = 0;
        this.engine = engine;
        this.predictionManager = predictionManager;
        this.config = {
            mismatchThreshold: config?.mismatchThreshold ?? 0,
            maxRollbackFrames: config?.maxRollbackFrames || 60,
            enableValidation: config?.enableValidation ?? true,
            logMismatches: config?.logMismatches ?? true,
            autoCorrect: config?.autoCorrect ?? true,
        };
    }
    /**
     * Handle server state update
     */
    handleServerUpdate(packet, currentFrame) {
        if (packet.type === 'input_ack') {
            // Input was confirmed, no rollback needed
            return false;
        }
        const serverState = this.extractState(packet);
        const clientState = this.engine.getState();
        // Detect mismatches
        const mismatches = this.detectMismatches(serverState, clientState);
        if (mismatches.length > 0) {
            this.totalMismatches++;
            if (this.config.logMismatches) {
                console.warn('[Rollback] State mismatch detected:', {
                    frame: packet.frame,
                    mismatches: mismatches.map(m => m.field),
                });
            }
            if (this.config.autoCorrect) {
                return this.performRollback(serverState, packet.frame, currentFrame, 'state_mismatch');
            }
        }
        return false;
    }
    /**
     * Perform rollback to server state
     */
    performRollback(serverState, serverFrame, clientFrame, reason) {
        // Find snapshot to roll back to
        const snapshot = this.predictionManager.getSnapshot(serverFrame);
        if (!snapshot) {
            console.error('[Rollback] No snapshot found for frame', serverFrame);
            // Force accept server state
            this.forceServerState(serverState);
            return true;
        }
        // Calculate rollback distance
        const deltaFrames = clientFrame - serverFrame;
        if (deltaFrames > this.config.maxRollbackFrames) {
            console.warn('[Rollback] Rollback too large, forcing server state');
            this.forceServerState(serverState);
            return true;
        }
        // Get unconfirmed inputs to replay
        const unconfirmedInputs = this.predictionManager.getUnconfirmedInputs();
        // Restore server state
        this.restoreState(serverState);
        // Replay unconfirmed inputs
        if (unconfirmedInputs.length > 0) {
            prediction_1.InputReplayer.replay(this.engine, unconfirmedInputs);
        }
        // Record rollback event
        const event = {
            reason,
            serverFrame,
            clientFrame,
            inputId: snapshot.inputId,
            timestamp: Date.now(),
            deltaSize: deltaFrames,
            replayCount: unconfirmedInputs.length,
        };
        this.rollbackHistory.push(event);
        this.totalRollbacks++;
        this.lastRollbackTime = Date.now();
        // Trim history (keep last 100)
        if (this.rollbackHistory.length > 100) {
            this.rollbackHistory.shift();
        }
        return true;
    }
    /**
     * Detect state mismatches
     */
    detectMismatches(serverState, clientState) {
        const mismatches = [];
        if (!this.config.enableValidation) {
            return mismatches;
        }
        // Compare primitive fields
        this.comparePrimitive(mismatches, 'score', serverState.score, clientState.score);
        this.comparePrimitive(mismatches, 'level', serverState.level, clientState.level);
        this.comparePrimitive(mismatches, 'lines', serverState.lines, clientState.lines);
        this.comparePrimitive(mismatches, 'grade', serverState.grade, clientState.grade);
        this.comparePrimitive(mismatches, 'combo', serverState.combo, clientState.combo);
        this.comparePrimitive(mismatches, 'backToBack', serverState.backToBack, clientState.backToBack);
        this.comparePrimitive(mismatches, 'gravity', serverState.gravity, clientState.gravity);
        // Compare current piece
        if (!this.piecesEqual(serverState.currentPiece, clientState.currentPiece)) {
            mismatches.push({
                field: 'currentPiece',
                serverValue: serverState.currentPiece,
                clientValue: clientState.currentPiece,
            });
        }
        // Compare hold piece
        if (serverState.holdPiece !== clientState.holdPiece) {
            mismatches.push({
                field: 'holdPiece',
                serverValue: serverState.holdPiece,
                clientValue: clientState.holdPiece,
            });
        }
        // Compare next queue
        if (!this.arraysEqual(serverState.nextQueue, clientState.nextQueue)) {
            mismatches.push({
                field: 'nextQueue',
                serverValue: serverState.nextQueue,
                clientValue: clientState.nextQueue,
            });
        }
        // Compare board (expensive, only if other mismatches found)
        if (mismatches.length > 0) {
            if (!this.boardsEqual(serverState.board, clientState.board)) {
                mismatches.push({
                    field: 'board',
                    serverValue: 'DIFFERENT',
                    clientValue: 'DIFFERENT',
                });
            }
        }
        return mismatches;
    }
    /**
     * Compare primitive field
     */
    comparePrimitive(mismatches, field, serverValue, clientValue) {
        if (serverValue !== clientValue) {
            const diff = Math.abs((typeof serverValue === 'number' ? serverValue : 0) -
                (typeof clientValue === 'number' ? clientValue : 0));
            if (diff > this.config.mismatchThreshold) {
                mismatches.push({ field, serverValue, clientValue });
            }
        }
    }
    /**
     * Compare two pieces
     */
    piecesEqual(a, b) {
        if (!a && !b)
            return true;
        if (!a || !b)
            return false;
        return (a.type === b.type &&
            a.x === b.x &&
            a.y === b.y &&
            a.rotation === b.rotation);
    }
    /**
     * Compare two arrays
     */
    arraysEqual(a, b) {
        if (a.length !== b.length)
            return false;
        return a.every((val, idx) => val === b[idx]);
    }
    /**
     * Compare two boards
     */
    boardsEqual(a, b) {
        if (a.width !== b.width || a.height !== b.height)
            return false;
        for (let y = 0; y < a.height; y++) {
            for (let x = 0; x < a.width; x++) {
                const cellA = a.grid[y][x];
                const cellB = b.grid[y][x];
                if (cellA.filled !== cellB.filled || cellA.color !== cellB.color) {
                    return false;
                }
            }
        }
        return true;
    }
    /**
     * Extract state from sync packet
     */
    extractState(packet) {
        if (packet.type === 'full_state') {
            return packet.state;
        }
        if (packet.type === 'delta_state') {
            const delta = packet.delta;
            const currentState = this.engine.getState();
            return {
                ...currentState,
                ...delta,
            };
        }
        return this.engine.getState();
    }
    /**
     * Restore game state
     */
    restoreState(state) {
        // This is a simplified version
        // In reality, GameEngine would need a setState() method
        // For now, we assume the engine can accept state updates
        // This will be implemented in the integration phase
        Object.assign(this.engine.getState(), state);
    }
    /**
     * Force accept server state (no rollback)
     */
    forceServerState(state) {
        this.restoreState(state);
        this.predictionManager.reset();
    }
    /**
     * Get recent rollback events
     */
    getRecentRollbacks(count = 10) {
        return this.rollbackHistory.slice(-count);
    }
    /**
     * Get rollback stats
     */
    getStats() {
        const recent = this.rollbackHistory.slice(-10);
        const avgDelta = recent.length > 0
            ? recent.reduce((sum, e) => sum + e.deltaSize, 0) / recent.length
            : 0;
        const avgReplay = recent.length > 0
            ? recent.reduce((sum, e) => sum + e.replayCount, 0) / recent.length
            : 0;
        return {
            totalRollbacks: this.totalRollbacks,
            totalMismatches: this.totalMismatches,
            recentRollbacks: recent.length,
            averageDelta: avgDelta,
            averageReplay: avgReplay,
            lastRollback: this.lastRollbackTime || null,
        };
    }
    /**
     * Get mismatch rate
     */
    getMismatchRate() {
        if (this.rollbackHistory.length === 0)
            return 0;
        return this.totalMismatches / this.rollbackHistory.length;
    }
    /**
     * Reset rollback state
     */
    reset() {
        this.rollbackHistory = [];
        this.lastRollbackTime = 0;
        this.totalRollbacks = 0;
        this.totalMismatches = 0;
    }
    /**
     * Check if recently rolled back
     */
    hasRecentRollback(withinMs = 1000) {
        if (!this.lastRollbackTime)
            return false;
        return Date.now() - this.lastRollbackTime < withinMs;
    }
}
exports.RollbackManager = RollbackManager;
/**
 * Desync detector
 */
class DesyncDetector {
    constructor() {
        this.checksumHistory = [];
        this.maxHistory = 100;
    }
    /**
     * Calculate state checksum
     */
    calculateChecksum(state) {
        // Simple checksum: sum of all numeric values
        let sum = 0;
        sum += state.score;
        sum += state.level * 1000;
        sum += state.lines * 100;
        sum += state.combo * 10;
        sum += state.backToBack ? 1 : 0;
        // Add piece positions
        if (state.currentPiece) {
            sum += state.currentPiece.x * 7;
            sum += state.currentPiece.y * 13;
            sum += state.currentPiece.rotation * 17;
        }
        // Add board checksum (sample)
        for (let y = 0; y < Math.min(5, state.board.height); y++) {
            for (let x = 0; x < state.board.width; x++) {
                if (state.board.grid[y][x].filled) {
                    sum += (y * state.board.width + x) * 23;
                }
            }
        }
        return sum % 1000000;
    }
    /**
     * Record checksum
     */
    record(frame, state) {
        const checksum = this.calculateChecksum(state);
        this.checksumHistory.push({ frame, checksum });
        if (this.checksumHistory.length > this.maxHistory) {
            this.checksumHistory.shift();
        }
    }
    /**
     * Verify checksum against server
     */
    verify(frame, serverChecksum) {
        const record = this.checksumHistory.find(r => r.frame === frame);
        if (!record)
            return true; // No record, assume OK
        return record.checksum === serverChecksum;
    }
    /**
     * Get checksum for frame
     */
    getChecksum(frame) {
        const record = this.checksumHistory.find(r => r.frame === frame);
        return record ? record.checksum : null;
    }
    /**
     * Clear history
     */
    clear() {
        this.checksumHistory = [];
    }
}
exports.DesyncDetector = DesyncDetector;
//# sourceMappingURL=rollback.js.map