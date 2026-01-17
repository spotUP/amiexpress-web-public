"use strict";
/**
 * IRS/IHS System
 *
 * Initial Rotation System (IRS): Rotate piece during spawn
 * Initial Hold System (IHS): Hold piece during spawn
 *
 * Allows buffering inputs during ARE (Appearance Delay)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputBuffer = exports.IRSIHSManager = void 0;
/**
 * IRS/IHS Manager
 *
 * Handles input buffering during ARE
 */
class IRSIHSManager {
    constructor() {
        this.bufferedInputs = [];
        this.maxBufferSize = 3; // Maximum buffered inputs
        this.inARE = false;
    }
    /**
     * Start ARE period (piece spawning)
     */
    startARE() {
        this.inARE = true;
        this.bufferedInputs = [];
    }
    /**
     * End ARE period
     */
    endARE() {
        this.inARE = false;
    }
    /**
     * Buffer an input during ARE
     */
    bufferInput(input) {
        if (!this.inARE) {
            return false;
        }
        // Limit buffer size
        if (this.bufferedInputs.length >= this.maxBufferSize) {
            return false;
        }
        // Don't buffer duplicate rotations or holds
        if (input.type === 'hold') {
            // Only one hold per spawn
            if (this.bufferedInputs.some(i => i.type === 'hold')) {
                return false;
            }
        }
        this.bufferedInputs.push(input);
        return true;
    }
    /**
     * Get buffered rotation (for IRS)
     * Returns total rotation amount
     */
    getBufferedRotation() {
        let rotation = 0;
        for (const input of this.bufferedInputs) {
            if (input.type === 'rotate_cw') {
                rotation += 1;
            }
            else if (input.type === 'rotate_ccw') {
                rotation -= 1;
            }
            else if (input.type === 'rotate_180') {
                rotation += 2;
            }
        }
        // Normalize to 0-3
        return ((rotation % 4) + 4) % 4;
    }
    /**
     * Check if hold was buffered (for IHS)
     */
    hasBufferedHold() {
        return this.bufferedInputs.some(i => i.type === 'hold');
    }
    /**
     * Clear buffered inputs
     */
    clear() {
        this.bufferedInputs = [];
    }
    /**
     * Check if currently in ARE
     */
    isInARE() {
        return this.inARE;
    }
    /**
     * Get buffered inputs (for debugging)
     */
    getBufferedInputs() {
        return [...this.bufferedInputs];
    }
}
exports.IRSIHSManager = IRSIHSManager;
/**
 * Input buffer for smooth gameplay
 *
 * Allows buffering inputs during lock delay and ARE
 */
class InputBuffer {
    constructor() {
        this.buffer = [];
        this.bufferWindow = 100; // ms
        this.maxBufferSize = 5;
    }
    /**
     * Add action to buffer
     */
    add(action) {
        const now = Date.now();
        // Remove old buffered inputs
        this.buffer = this.buffer.filter(item => now - item.timestamp < this.bufferWindow);
        // Add new input if room in buffer
        if (this.buffer.length < this.maxBufferSize) {
            this.buffer.push({ action, timestamp: now });
        }
    }
    /**
     * Consume buffered action
     */
    consume(action) {
        const index = this.buffer.findIndex(item => item.action === action);
        if (index !== -1) {
            this.buffer.splice(index, 1);
            return true;
        }
        return false;
    }
    /**
     * Check if action is buffered
     */
    has(action) {
        return this.buffer.some(item => item.action === action);
    }
    /**
     * Clear buffer
     */
    clear() {
        this.buffer = [];
    }
    /**
     * Get all buffered actions
     */
    getAll() {
        return this.buffer.map(item => item.action);
    }
}
exports.InputBuffer = InputBuffer;
//# sourceMappingURL=irs-ihs.js.map