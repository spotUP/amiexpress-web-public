/**
 * Client-Side Prediction Module
 *
 * Responsive gameplay despite latency with:
 * - Input prediction (apply inputs immediately)
 * - Server reconciliation (correct prediction errors)
 * - Rollback and replay (for fighting games)
 * - Input buffer management
 * - Prediction smoothing
 */
import { EventEmitter } from 'events';
// Default prediction configuration
const DEFAULT_CONFIG = {
    enabled: true,
    maxPredictionFrames: 10,
    correctionSmoothing: 0.2,
    rollbackEnabled: false,
    maxRollbackFrames: 7,
    inputDelay: 0,
};
/**
 * Prediction Engine
 *
 * Handles client-side prediction, input buffering, and server reconciliation
 * for responsive gameplay even with network latency.
 */
export class PredictionEngine extends EventEmitter {
    constructor(connection, config = {}) {
        super();
        this.name = 'prediction';
        this.inputBuffer = [];
        this.rollbackBuffer = [];
        this.localState = null;
        this.connection = connection;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this._state = this.createInitialState();
        this.setupEventHandlers();
    }
    /**
     * Create initial prediction state
     */
    createInitialState() {
        return {
            predictedTick: 0,
            serverTick: 0,
            pendingInputs: [],
            mispredictions: 0,
            correctionAmount: 0,
            lastReconcile: 0,
        };
    }
    /**
     * Get current prediction state
     */
    get state() {
        return { ...this._state };
    }
    /**
     * Initialize prediction engine
     */
    async init() {
        // Nothing to initialize
    }
    /**
     * Configure prediction engine
     */
    configure(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Set the simulation callback for state prediction
     */
    setSimulationCallback(callback) {
        this.simulateCallback = callback;
    }
    /**
     * Set local game state
     */
    setLocalState(state) {
        this.localState = JSON.parse(JSON.stringify(state));
    }
    /**
     * Setup socket event handlers
     */
    setupEventHandlers() {
        const socket = this.connection.getSocket();
        if (!socket)
            return;
        socket.on('game:state', (data) => {
            this.reconcile(data.state, data.tick);
        });
        socket.on('input:ack', (tick) => {
            this.acknowledgeInput(tick);
        });
    }
    /**
     * Predict input locally and send to server
     */
    predictInput(input) {
        if (!this.config.enabled) {
            this.sendInput(input);
            return;
        }
        this._state.predictedTick++;
        // Create input frame
        const frame = {
            tick: this._state.predictedTick,
            timestamp: Date.now(),
            inputs: input,
            predicted: true,
            acknowledged: false,
        };
        // Add to pending inputs
        this._state.pendingInputs.push(frame);
        this.inputBuffer.push(frame);
        // Trim buffer if too large
        while (this.inputBuffer.length > 120) {
            this.inputBuffer.shift();
        }
        // Apply input locally (prediction)
        if (this.simulateCallback && this.localState) {
            // Store state for rollback if enabled
            if (this.config.rollbackEnabled) {
                this.storeRollbackState(this._state.predictedTick - 1);
            }
            this.localState = this.simulateCallback(this.localState, input);
            this.emit('state:predicted', this.localState, this._state.predictedTick);
        }
        // Send to server
        this.sendInput(input);
    }
    /**
     * Send input to server
     */
    sendInput(input) {
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('game:input', {
                tick: this._state.predictedTick,
                input,
            });
        }
    }
    /**
     * Acknowledge input received by server
     */
    acknowledgeInput(tick) {
        const frame = this._state.pendingInputs.find(f => f.tick === tick);
        if (frame) {
            frame.acknowledged = true;
        }
        // Remove old acknowledged inputs
        this._state.pendingInputs = this._state.pendingInputs.filter(f => !f.acknowledged || f.tick > tick - 30);
    }
    /**
     * Reconcile local state with server state
     */
    reconcile(serverState, serverTick) {
        if (!this.config.enabled || !this.simulateCallback) {
            this.localState = serverState;
            this._state.serverTick = serverTick;
            this.emit('state:reconciled', serverState, serverTick);
            return;
        }
        this._state.serverTick = serverTick;
        this._state.lastReconcile = Date.now();
        // Find the input frame for this server tick
        const serverFrame = this.inputBuffer.find(f => f.tick === serverTick);
        if (!serverFrame) {
            // No matching frame, just accept server state
            this.localState = serverState;
            this.emit('state:reconciled', serverState, serverTick);
            return;
        }
        // Store server state for comparison
        serverFrame.serverState = serverState;
        // Check if prediction was correct
        const predictedAtTick = this.getPredictedStateAtTick(serverTick);
        const correctionNeeded = this.calculateCorrectionAmount(predictedAtTick, serverState);
        if (correctionNeeded > 0.01) {
            this._state.mispredictions++;
            this._state.correctionAmount = correctionNeeded;
            if (this.config.rollbackEnabled) {
                // Full rollback and replay
                this.rollbackAndReplay(serverState, serverTick);
            }
            else {
                // Smooth correction
                this.smoothCorrection(serverState, serverTick);
            }
        }
        else {
            this._state.correctionAmount = 0;
        }
        // Mark inputs as reconciled
        for (const frame of this._state.pendingInputs) {
            if (frame.tick <= serverTick) {
                frame.acknowledged = true;
            }
        }
        this.emit('state:reconciled', this.localState, serverTick);
    }
    /**
     * Get predicted state at a specific tick
     */
    getPredictedStateAtTick(tick) {
        // In a real implementation, this would look up stored predicted states
        // For simplicity, we return current local state
        return this.localState;
    }
    /**
     * Calculate correction amount (distance between predicted and actual)
     */
    calculateCorrectionAmount(predicted, actual) {
        if (!predicted || !actual)
            return 0;
        // Simple comparison - in real implementation, compare relevant game state fields
        try {
            const predictedStr = JSON.stringify(predicted);
            const actualStr = JSON.stringify(actual);
            if (predictedStr === actualStr)
                return 0;
            // Calculate rough difference
            let diff = 0;
            const maxLen = Math.max(predictedStr.length, actualStr.length);
            for (let i = 0; i < maxLen; i++) {
                if (predictedStr[i] !== actualStr[i])
                    diff++;
            }
            return diff / maxLen;
        }
        catch {
            return 1;
        }
    }
    /**
     * Smooth correction towards server state
     */
    smoothCorrection(serverState, serverTick) {
        // Start from server state
        let state = JSON.parse(JSON.stringify(serverState));
        // Replay unacknowledged inputs
        const unackedInputs = this._state.pendingInputs.filter(f => f.tick > serverTick && !f.acknowledged);
        for (const frame of unackedInputs) {
            state = this.simulateCallback(state, frame.inputs);
        }
        // Smooth interpolation between current and corrected state
        if (this.config.correctionSmoothing < 1 && this.localState) {
            this.localState = this.interpolateStates(this.localState, state, this.config.correctionSmoothing);
        }
        else {
            this.localState = state;
        }
    }
    /**
     * Rollback to server state and replay inputs
     */
    rollback(toTick) {
        const rollbackState = this.rollbackBuffer.find(s => s.tick === toTick);
        if (!rollbackState) {
            console.warn(`PredictionEngine: No rollback state for tick ${toTick}`);
            return;
        }
        this.localState = JSON.parse(JSON.stringify(rollbackState.gameState));
        this._state.predictedTick = toTick;
        this.emit('rollback', toTick);
    }
    /**
     * Rollback to server state and replay all inputs since then
     */
    rollbackAndReplay(serverState, serverTick) {
        // Rollback to server state
        this.localState = JSON.parse(JSON.stringify(serverState));
        // Get all inputs after server tick
        const inputsToReplay = this.inputBuffer.filter(f => f.tick > serverTick);
        // Replay inputs
        for (const frame of inputsToReplay) {
            if (this.simulateCallback) {
                this.localState = this.simulateCallback(this.localState, frame.inputs);
            }
        }
        this.emit('rollback:complete', serverTick, inputsToReplay.length);
    }
    /**
     * Store state for rollback
     */
    storeRollbackState(tick) {
        if (!this.localState)
            return;
        // Get inputs at this tick
        const inputs = new Map();
        const frame = this.inputBuffer.find(f => f.tick === tick);
        if (frame) {
            inputs.set(0, frame.inputs); // 0 = local player
        }
        const rollbackState = {
            tick,
            gameState: JSON.parse(JSON.stringify(this.localState)),
            inputs,
        };
        this.rollbackBuffer.push(rollbackState);
        // Trim buffer
        while (this.rollbackBuffer.length > this.config.maxRollbackFrames) {
            this.rollbackBuffer.shift();
        }
    }
    /**
     * Interpolate between two states (for smooth correction)
     */
    interpolateStates(from, to, t) {
        if (typeof from !== 'object' || typeof to !== 'object') {
            return to;
        }
        if (from === null || to === null) {
            return to;
        }
        if (Array.isArray(from) && Array.isArray(to)) {
            return to; // Don't interpolate arrays
        }
        const result = {};
        for (const key of Object.keys(to)) {
            const fromVal = from[key];
            const toVal = to[key];
            if (typeof fromVal === 'number' && typeof toVal === 'number') {
                result[key] = fromVal + (toVal - fromVal) * t;
            }
            else if (typeof fromVal === 'object' && typeof toVal === 'object') {
                result[key] = this.interpolateStates(fromVal, toVal, t);
            }
            else {
                result[key] = toVal;
            }
        }
        return result;
    }
    /**
     * Get current local state
     */
    getLocalState() {
        return this.localState;
    }
    /**
     * Get pending input count
     */
    getPendingInputCount() {
        return this._state.pendingInputs.filter(f => !f.acknowledged).length;
    }
    /**
     * Get prediction error rate
     */
    getPredictionErrorRate() {
        const total = this.inputBuffer.length;
        if (total === 0)
            return 0;
        return this._state.mispredictions / total;
    }
    /**
     * Get input at specific tick
     */
    getInputAtTick(tick) {
        return this.inputBuffer.find(f => f.tick === tick)?.inputs;
    }
    /**
     * Get all inputs in range
     */
    getInputsInRange(fromTick, toTick) {
        return this.inputBuffer.filter(f => f.tick >= fromTick && f.tick <= toTick);
    }
    /**
     * Clear prediction state
     */
    reset() {
        this._state = this.createInitialState();
        this.inputBuffer = [];
        this.rollbackBuffer = [];
        this.localState = null;
    }
    /**
     * Dispose of prediction engine
     */
    dispose() {
        this.reset();
        this.removeAllListeners();
    }
}
export default PredictionEngine;
