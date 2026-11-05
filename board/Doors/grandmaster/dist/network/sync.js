"use strict";
/**
 * State Synchronization
 *
 * Server-authoritative state sync for multiplayer
 * - 10 FPS sync rate
 * - Delta compression
 * - Interpolation support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateInterpolator = exports.StateSyncManager = void 0;
/**
 * State synchronization manager
 */
class StateSyncManager {
    constructor(config) {
        this.lastSyncTime = 0;
        this.lastFullStateFrame = 0;
        this.previousState = null;
        this.frameCounter = 0;
        this.config = {
            syncRate: config?.syncRate || 10,
            fullStateInterval: config?.fullStateInterval || 60,
            interpolationDelay: config?.interpolationDelay || 100,
            maxDeltaSize: config?.maxDeltaSize || 1024,
        };
        this.syncInterval = 1000 / this.config.syncRate;
    }
    /**
     * Check if sync is needed
     */
    shouldSync(currentTime) {
        return currentTime - this.lastSyncTime >= this.syncInterval;
    }
    /**
     * Create sync packet
     */
    createSyncPacket(state, currentTime) {
        this.frameCounter++;
        this.lastSyncTime = currentTime;
        // Send full state periodically or if no previous state
        const shouldSendFullState = !this.previousState ||
            this.frameCounter - this.lastFullStateFrame >= this.config.fullStateInterval;
        if (shouldSendFullState) {
            this.lastFullStateFrame = this.frameCounter;
            this.previousState = this.cloneState(state);
            return {
                type: 'full_state',
                frame: this.frameCounter,
                timestamp: currentTime,
                state: this.cloneState(state),
            };
        }
        // Create delta packet
        const delta = this.createDelta(this.previousState, state);
        this.previousState = this.cloneState(state);
        return {
            type: 'delta_state',
            frame: this.frameCounter,
            timestamp: currentTime,
            delta,
        };
    }
    /**
     * Create input acknowledgment
     */
    createInputAck(inputId) {
        return {
            type: 'input_ack',
            inputId,
            serverFrame: this.frameCounter,
        };
    }
    /**
     * Apply sync packet to local state
     */
    applySyncPacket(packet, localState) {
        if (packet.type === 'full_state') {
            return this.cloneState(packet.state);
        }
        if (packet.type === 'delta_state') {
            return this.applyDelta(localState, packet.delta);
        }
        // Input ack doesn't modify state
        return localState;
    }
    /**
     * Create delta between two states
     */
    createDelta(oldState, newState) {
        const delta = {};
        // Compare primitive fields
        if (oldState.score !== newState.score)
            delta.score = newState.score;
        if (oldState.level !== newState.level)
            delta.level = newState.level;
        if (oldState.lines !== newState.lines)
            delta.lines = newState.lines;
        if (oldState.grade !== newState.grade)
            delta.grade = newState.grade;
        if (oldState.combo !== newState.combo)
            delta.combo = newState.combo;
        if (oldState.backToBack !== newState.backToBack)
            delta.backToBack = newState.backToBack;
        if (oldState.gravity !== newState.gravity)
            delta.gravity = newState.gravity;
        if (oldState.lockDelay !== newState.lockDelay)
            delta.lockDelay = newState.lockDelay;
        if (oldState.areRemaining !== newState.areRemaining)
            delta.areRemaining = newState.areRemaining;
        // Compare current piece (deep comparison needed)
        if (!this.piecesEqual(oldState.currentPiece, newState.currentPiece)) {
            delta.currentPiece = newState.currentPiece;
        }
        // Compare hold piece
        if (oldState.holdPiece !== newState.holdPiece) {
            delta.holdPiece = newState.holdPiece;
        }
        // Compare next queue (array comparison)
        if (!this.arraysEqual(oldState.nextQueue, newState.nextQueue)) {
            delta.nextQueue = newState.nextQueue;
        }
        // Board comparison (only if different)
        if (!this.boardsEqual(oldState.board, newState.board)) {
            delta.board = newState.board;
        }
        return delta;
    }
    /**
     * Apply delta to state
     */
    applyDelta(state, delta) {
        return {
            ...state,
            ...delta,
        };
    }
    /**
     * Compare two pieces
     */
    piecesEqual(a, b) {
        if (!a && !b)
            return true;
        if (!a || !b)
            return false;
        return a.type === b.type && a.x === b.x && a.y === b.y && a.rotation === b.rotation;
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
     * Clone game state
     */
    cloneState(state) {
        return JSON.parse(JSON.stringify(state));
    }
    /**
     * Get current frame
     */
    getFrame() {
        return this.frameCounter;
    }
    /**
     * Reset sync state
     */
    reset() {
        this.frameCounter = 0;
        this.lastSyncTime = 0;
        this.lastFullStateFrame = 0;
        this.previousState = null;
    }
}
exports.StateSyncManager = StateSyncManager;
/**
 * State interpolator for smooth rendering
 */
class StateInterpolator {
    constructor(interpolationDelay = 100) {
        this.stateBuffer = [];
        this.interpolationDelay = interpolationDelay;
    }
    /**
     * Add state to buffer
     */
    addState(state, timestamp) {
        this.stateBuffer.push({ timestamp, state });
        // Keep buffer size manageable (max 1 second of states)
        if (this.stateBuffer.length > 100) {
            this.stateBuffer.shift();
        }
    }
    /**
     * Get interpolated state
     */
    getInterpolatedState(currentTime) {
        if (this.stateBuffer.length < 2) {
            return this.stateBuffer[0]?.state || null;
        }
        // Render time is current time minus interpolation delay
        const renderTime = currentTime - this.interpolationDelay;
        // Find two states to interpolate between
        let beforeState = null;
        let afterState = null;
        for (let i = 0; i < this.stateBuffer.length - 1; i++) {
            if (this.stateBuffer[i].timestamp <= renderTime &&
                this.stateBuffer[i + 1].timestamp >= renderTime) {
                beforeState = this.stateBuffer[i];
                afterState = this.stateBuffer[i + 1];
                break;
            }
        }
        // If no interpolation range found, use most recent
        if (!beforeState || !afterState) {
            return this.stateBuffer[this.stateBuffer.length - 1].state;
        }
        // Interpolate between states
        const t = (renderTime - beforeState.timestamp) / (afterState.timestamp - beforeState.timestamp);
        return this.interpolate(beforeState.state, afterState.state, t);
    }
    /**
     * Interpolate between two states
     */
    interpolate(a, b, t) {
        // For most fields, just use the later state (no interpolation)
        // Only interpolate piece positions for smooth movement
        const result = { ...b };
        if (a.currentPiece && b.currentPiece && a.currentPiece.type === b.currentPiece.type) {
            result.currentPiece = {
                ...b.currentPiece,
                x: Math.round(a.currentPiece.x + (b.currentPiece.x - a.currentPiece.x) * t),
                y: Math.round(a.currentPiece.y + (b.currentPiece.y - a.currentPiece.y) * t),
            };
        }
        return result;
    }
    /**
     * Clear buffer
     */
    clear() {
        this.stateBuffer = [];
    }
}
exports.StateInterpolator = StateInterpolator;
//# sourceMappingURL=sync.js.map