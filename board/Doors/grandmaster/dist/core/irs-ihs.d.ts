/**
 * IRS/IHS System
 *
 * Initial Rotation System (IRS): Rotate piece during spawn
 * Initial Hold System (IHS): Hold piece during spawn
 *
 * Allows buffering inputs during ARE (Appearance Delay)
 */
/**
 * Buffered input types
 */
export type BufferedInput = {
    type: 'rotate_cw';
} | {
    type: 'rotate_ccw';
} | {
    type: 'rotate_180';
} | {
    type: 'hold';
};
/**
 * IRS/IHS Manager
 *
 * Handles input buffering during ARE
 */
export declare class IRSIHSManager {
    private bufferedInputs;
    private maxBufferSize;
    private inARE;
    /**
     * Start ARE period (piece spawning)
     */
    startARE(): void;
    /**
     * End ARE period
     */
    endARE(): void;
    /**
     * Buffer an input during ARE
     */
    bufferInput(input: BufferedInput): boolean;
    /**
     * Get buffered rotation (for IRS)
     * Returns total rotation amount
     */
    getBufferedRotation(): number;
    /**
     * Check if hold was buffered (for IHS)
     */
    hasBufferedHold(): boolean;
    /**
     * Clear buffered inputs
     */
    clear(): void;
    /**
     * Check if currently in ARE
     */
    isInARE(): boolean;
    /**
     * Get buffered inputs (for debugging)
     */
    getBufferedInputs(): BufferedInput[];
}
/**
 * Input buffer for smooth gameplay
 *
 * Allows buffering inputs during lock delay and ARE
 */
export declare class InputBuffer {
    private buffer;
    private bufferWindow;
    private maxBufferSize;
    /**
     * Add action to buffer
     */
    add(action: string): void;
    /**
     * Consume buffered action
     */
    consume(action: string): boolean;
    /**
     * Check if action is buffered
     */
    has(action: string): boolean;
    /**
     * Clear buffer
     */
    clear(): void;
    /**
     * Get all buffered actions
     */
    getAll(): string[];
}
//# sourceMappingURL=irs-ihs.d.ts.map