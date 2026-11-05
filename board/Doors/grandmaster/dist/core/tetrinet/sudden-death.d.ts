/**
 * TetriNET Sudden Death Manager
 *
 * Implements the sudden death mechanic where lines are added to all players
 * after a configurable delay. This forces games to end eventually.
 *
 * Configuration:
 * - delayMinutes: 0-15 (0 = disabled, default 2)
 * - tickSeconds: 1-30 (how often lines are added, default 5)
 */
/**
 * Sudden death state
 */
export interface SuddenDeathState {
    enabled: boolean;
    delayMs: number;
    tickIntervalMs: number;
    startTime: number | null;
    lastTickTime: number;
    linesAdded: number;
    active: boolean;
}
/**
 * Sudden Death Manager
 */
export declare class SuddenDeathManager {
    private enabled;
    private delayMs;
    private tickIntervalMs;
    private startTime;
    private lastTickTime;
    private linesAdded;
    private active;
    private onLineAddedCallbacks;
    private onActivatedCallbacks;
    /**
     * Create sudden death manager
     * @param delayMinutes Delay before sudden death activates (0-15, 0 = disabled)
     * @param tickSeconds Interval between line additions (1-30)
     */
    constructor(delayMinutes?: number, tickSeconds?: number);
    /**
     * Start the sudden death timer
     */
    start(): void;
    /**
     * Stop the sudden death timer
     */
    stop(): void;
    /**
     * Reset the timer
     */
    reset(): void;
    /**
     * Update sudden death (call every frame)
     * Returns number of lines to add (0 if none)
     */
    update(): number;
    /**
     * Check if sudden death is enabled
     */
    isEnabled(): boolean;
    /**
     * Check if sudden death is currently active (past delay)
     */
    isActive(): boolean;
    /**
     * Check if timer has started
     */
    hasStarted(): boolean;
    /**
     * Get time until sudden death activates (ms)
     */
    getTimeUntilActive(): number;
    /**
     * Get time until next line is added (ms)
     */
    getTimeUntilNextLine(): number;
    /**
     * Get total lines added so far
     */
    getLinesAdded(): number;
    /**
     * Get delay in minutes
     */
    getDelayMinutes(): number;
    /**
     * Get tick interval in seconds
     */
    getTickSeconds(): number;
    /**
     * Set configuration
     */
    configure(delayMinutes: number, tickSeconds: number): void;
    /**
     * Register callback for when a line is added
     */
    onLineAdded(callback: (totalLines: number) => void): () => void;
    /**
     * Register callback for when sudden death activates
     */
    onActivated(callback: () => void): () => void;
    /**
     * Get display string for UI
     */
    getDisplay(): string;
    /**
     * Serialize state
     */
    getState(): SuddenDeathState;
    /**
     * Load state
     */
    loadState(state: SuddenDeathState): void;
}
//# sourceMappingURL=sudden-death.d.ts.map