"use strict";
/**
 * Client-Side Prediction
 *
 * Implements client-side prediction for responsive multiplayer:
 * - Input buffering with sequence numbers
 * - Speculative game state execution
 * - Server reconciliation preparation
 * - Input acknowledgment handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputReplayer = exports.InputEncoder = exports.PredictionManager = void 0;
/**
 * Client-side prediction manager
 */
class PredictionManager {
    constructor(engine, config) {
        this.inputBuffer = [];
        this.snapshots = [];
        this.nextInputId = 0;
        this.lastSnapshotFrame = 0;
        this.frameCounter = 0;
        this.engine = engine;
        this.config = {
            maxBufferSize: config?.maxBufferSize || 60,
            snapshotInterval: config?.snapshotInterval || 10,
            maxPredictionTime: config?.maxPredictionTime || 500,
            inputDelay: config?.inputDelay || 0,
        };
    }
    /**
     * Add input to buffer
     */
    addInput(type, timestamp) {
        const input = {
            id: this.nextInputId++,
            type,
            timestamp,
            applied: false,
            confirmed: false,
        };
        this.inputBuffer.push(input);
        // Trim buffer if too large
        if (this.inputBuffer.length > this.config.maxBufferSize) {
            // Remove oldest confirmed input
            const confirmedIndex = this.inputBuffer.findIndex(i => i.confirmed);
            if (confirmedIndex >= 0) {
                this.inputBuffer.splice(confirmedIndex, 1);
            }
        }
        return input.id;
    }
    /**
     * Process pending inputs (apply to local state)
     */
    processPendingInputs(currentTime) {
        for (const input of this.inputBuffer) {
            if (input.applied || input.confirmed)
                continue;
            // Check if input delay has passed
            if (currentTime - input.timestamp < this.config.inputDelay) {
                continue;
            }
            // Apply input to local state
            this.applyInput(input);
            input.applied = true;
        }
    }
    /**
     * Apply input to game state
     */
    applyInput(input) {
        switch (input.type) {
            case 'move_left':
                this.engine.move(-1);
                break;
            case 'move_right':
                this.engine.move(1);
                break;
            case 'rotate_cw':
                this.engine.rotate(1);
                break;
            case 'rotate_ccw':
                this.engine.rotate(-1);
                break;
            case 'soft_drop':
                this.engine.softDrop();
                break;
            case 'hard_drop':
                this.engine.hardDrop();
                break;
            case 'hold':
                this.engine.hold();
                break;
        }
    }
    /**
     * Handle input acknowledgment from server
     */
    onInputAck(inputId, serverFrame) {
        const input = this.inputBuffer.find(i => i.id === inputId);
        if (input) {
            input.confirmed = true;
        }
        // Remove all confirmed inputs older than this one
        this.inputBuffer = this.inputBuffer.filter(i => {
            if (i.confirmed && i.id <= inputId) {
                return false; // Remove
            }
            return true; // Keep
        });
    }
    /**
     * Create state snapshot
     */
    createSnapshot() {
        this.frameCounter++;
        // Check if snapshot interval reached
        if (this.frameCounter - this.lastSnapshotFrame >= this.config.snapshotInterval) {
            const state = this.cloneState(this.engine.getState());
            const lastInput = this.getLastAppliedInput();
            this.snapshots.push({
                inputId: lastInput?.id || 0,
                state,
                timestamp: Date.now(),
            });
            this.lastSnapshotFrame = this.frameCounter;
            // Trim snapshots (keep last 30 = 3 seconds at 10 snapshots/sec)
            if (this.snapshots.length > 30) {
                this.snapshots.shift();
            }
        }
    }
    /**
     * Get snapshot for rollback
     */
    getSnapshot(inputId) {
        // Find snapshot at or before this input
        for (let i = this.snapshots.length - 1; i >= 0; i--) {
            if (this.snapshots[i].inputId <= inputId) {
                return this.snapshots[i];
            }
        }
        return null;
    }
    /**
     * Get last applied input
     */
    getLastAppliedInput() {
        for (let i = this.inputBuffer.length - 1; i >= 0; i--) {
            if (this.inputBuffer[i].applied) {
                return this.inputBuffer[i];
            }
        }
        return null;
    }
    /**
     * Get unconfirmed inputs (for rollback)
     */
    getUnconfirmedInputs() {
        return this.inputBuffer.filter(i => i.applied && !i.confirmed);
    }
    /**
     * Get pending inputs (not yet applied)
     */
    getPendingInputs() {
        return this.inputBuffer.filter(i => !i.applied);
    }
    /**
     * Get input by ID
     */
    getInput(inputId) {
        return this.inputBuffer.find(i => i.id === inputId) || null;
    }
    /**
     * Clear old snapshots
     */
    cleanupSnapshots(olderThan) {
        this.snapshots = this.snapshots.filter(s => s.timestamp >= olderThan);
    }
    /**
     * Clone game state (deep copy)
     */
    cloneState(state) {
        return JSON.parse(JSON.stringify(state));
    }
    /**
     * Get prediction stats
     */
    getStats() {
        const confirmed = this.inputBuffer.filter(i => i.confirmed).length;
        const pending = this.inputBuffer.filter(i => !i.applied).length;
        const oldest = this.snapshots.length > 0 ? this.snapshots[0].timestamp : null;
        return {
            bufferedInputs: this.inputBuffer.length,
            confirmedInputs: confirmed,
            pendingInputs: pending,
            snapshotCount: this.snapshots.length,
            oldestSnapshot: oldest,
        };
    }
    /**
     * Reset prediction state
     */
    reset() {
        this.inputBuffer = [];
        this.snapshots = [];
        this.nextInputId = 0;
        this.lastSnapshotFrame = 0;
        this.frameCounter = 0;
    }
    /**
     * Get current input ID
     */
    getCurrentInputId() {
        return this.nextInputId - 1;
    }
}
exports.PredictionManager = PredictionManager;
/**
 * Input encoder for network transmission
 */
class InputEncoder {
    /**
     * Encode input for network
     */
    static encode(input) {
        const typeMap = {
            move_left: 'L',
            move_right: 'R',
            rotate_cw: 'C',
            rotate_ccw: 'A',
            soft_drop: 'S',
            hard_drop: 'H',
            hold: 'O',
        };
        return `${input.id}:${typeMap[input.type]}:${input.timestamp}`;
    }
    /**
     * Decode input from network
     */
    static decode(encoded) {
        const parts = encoded.split(':');
        if (parts.length !== 3)
            return null;
        const [idStr, typeCode, timestampStr] = parts;
        const id = parseInt(idStr, 10);
        const timestamp = parseInt(timestampStr, 10);
        if (isNaN(id) || isNaN(timestamp))
            return null;
        const typeMap = {
            L: 'move_left',
            R: 'move_right',
            C: 'rotate_cw',
            A: 'rotate_ccw',
            S: 'soft_drop',
            H: 'hard_drop',
            O: 'hold',
        };
        const type = typeMap[typeCode];
        if (!type)
            return null;
        return {
            id,
            type,
            timestamp,
            applied: false,
            confirmed: false,
        };
    }
    /**
     * Encode multiple inputs
     */
    static encodeMultiple(inputs) {
        return inputs.map(i => this.encode(i)).join('|');
    }
    /**
     * Decode multiple inputs
     */
    static decodeMultiple(encoded) {
        return encoded
            .split('|')
            .map(s => this.decode(s))
            .filter(i => i !== null);
    }
}
exports.InputEncoder = InputEncoder;
/**
 * Input replay for rollback
 */
class InputReplayer {
    /**
     * Replay inputs on engine
     */
    static replay(engine, inputs) {
        for (const input of inputs) {
            this.applyInput(engine, input);
        }
    }
    /**
     * Apply single input to engine
     */
    static applyInput(engine, input) {
        switch (input.type) {
            case 'move_left':
                engine.move(-1);
                break;
            case 'move_right':
                engine.move(1);
                break;
            case 'rotate_cw':
                engine.rotate(1);
                break;
            case 'rotate_ccw':
                engine.rotate(-1);
                break;
            case 'soft_drop':
                engine.softDrop();
                break;
            case 'hard_drop':
                engine.hardDrop();
                break;
            case 'hold':
                engine.hold();
                break;
        }
    }
    /**
     * Replay inputs starting from a state
     */
    static replayFromState(engine, state, inputs) {
        // Restore state (implementation depends on engine)
        // For now, assume engine has a setState method
        // This will be used by rollback system
        this.replay(engine, inputs);
    }
}
exports.InputReplayer = InputReplayer;
//# sourceMappingURL=prediction.js.map