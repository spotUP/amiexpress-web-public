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
  delayMs: number;        // Delay before activation
  tickIntervalMs: number; // Time between line additions
  startTime: number | null;
  lastTickTime: number;
  linesAdded: number;     // Total lines added so far
  active: boolean;        // Whether we're past the delay
}

/**
 * Sudden Death Manager
 */
export class SuddenDeathManager {
  private enabled: boolean;
  private delayMs: number;
  private tickIntervalMs: number;
  private startTime: number | null = null;
  private lastTickTime: number = 0;
  private linesAdded: number = 0;
  private active: boolean = false;

  private onLineAddedCallbacks: Array<(totalLines: number) => void> = [];
  private onActivatedCallbacks: Array<() => void> = [];

  /**
   * Create sudden death manager
   * @param delayMinutes Delay before sudden death activates (0-15, 0 = disabled)
   * @param tickSeconds Interval between line additions (1-30)
   */
  constructor(delayMinutes: number = 2, tickSeconds: number = 5) {
    this.enabled = delayMinutes > 0;
    this.delayMs = Math.max(0, Math.min(15, delayMinutes)) * 60 * 1000;
    this.tickIntervalMs = Math.max(1, Math.min(30, tickSeconds)) * 1000;
  }

  /**
   * Start the sudden death timer
   */
  start(): void {
    if (!this.enabled) return;

    this.startTime = Date.now();
    this.lastTickTime = 0;
    this.linesAdded = 0;
    this.active = false;
  }

  /**
   * Stop the sudden death timer
   */
  stop(): void {
    this.startTime = null;
    this.active = false;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.stop();
    this.linesAdded = 0;
  }

  /**
   * Update sudden death (call every frame)
   * Returns number of lines to add (0 if none)
   */
  update(): number {
    if (!this.enabled || !this.startTime) {
      return 0;
    }

    const now = Date.now();
    const elapsed = now - this.startTime;

    // Check if we've passed the delay
    if (!this.active) {
      if (elapsed >= this.delayMs) {
        this.active = true;
        this.lastTickTime = now;

        // Notify activation
        for (const callback of this.onActivatedCallbacks) {
          callback();
        }
      }
      return 0;
    }

    // Check if it's time for another line
    const timeSinceLastTick = now - this.lastTickTime;
    if (timeSinceLastTick >= this.tickIntervalMs) {
      this.lastTickTime = now;
      this.linesAdded++;

      // Notify line added
      for (const callback of this.onLineAddedCallbacks) {
        callback(this.linesAdded);
      }

      return 1;  // Add 1 line
    }

    return 0;
  }

  /**
   * Check if sudden death is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if sudden death is currently active (past delay)
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Check if timer has started
   */
  hasStarted(): boolean {
    return this.startTime !== null;
  }

  /**
   * Get time until sudden death activates (ms)
   */
  getTimeUntilActive(): number {
    if (!this.enabled || !this.startTime) {
      return this.delayMs;
    }

    if (this.active) {
      return 0;
    }

    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.delayMs - elapsed);
  }

  /**
   * Get time until next line is added (ms)
   */
  getTimeUntilNextLine(): number {
    if (!this.active) {
      return this.getTimeUntilActive() + this.tickIntervalMs;
    }

    const timeSinceLastTick = Date.now() - this.lastTickTime;
    return Math.max(0, this.tickIntervalMs - timeSinceLastTick);
  }

  /**
   * Get total lines added so far
   */
  getLinesAdded(): number {
    return this.linesAdded;
  }

  /**
   * Get delay in minutes
   */
  getDelayMinutes(): number {
    return this.delayMs / 60000;
  }

  /**
   * Get tick interval in seconds
   */
  getTickSeconds(): number {
    return this.tickIntervalMs / 1000;
  }

  /**
   * Set configuration
   */
  configure(delayMinutes: number, tickSeconds: number): void {
    this.enabled = delayMinutes > 0;
    this.delayMs = Math.max(0, Math.min(15, delayMinutes)) * 60 * 1000;
    this.tickIntervalMs = Math.max(1, Math.min(30, tickSeconds)) * 1000;
  }

  /**
   * Register callback for when a line is added
   */
  onLineAdded(callback: (totalLines: number) => void): () => void {
    this.onLineAddedCallbacks.push(callback);
    return () => {
      const index = this.onLineAddedCallbacks.indexOf(callback);
      if (index >= 0) {
        this.onLineAddedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register callback for when sudden death activates
   */
  onActivated(callback: () => void): () => void {
    this.onActivatedCallbacks.push(callback);
    return () => {
      const index = this.onActivatedCallbacks.indexOf(callback);
      if (index >= 0) {
        this.onActivatedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get display string for UI
   */
  getDisplay(): string {
    if (!this.enabled) {
      return '{gray-fg}Sudden Death: OFF{/gray-fg}';
    }

    if (!this.startTime) {
      return `{yellow-fg}Sudden Death: ${this.getDelayMinutes()}min{/yellow-fg}`;
    }

    if (!this.active) {
      const remaining = Math.ceil(this.getTimeUntilActive() / 1000);
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      return `{yellow-fg}Sudden Death in: ${mins}:${secs.toString().padStart(2, '0')}{/yellow-fg}`;
    }

    const nextLine = Math.ceil(this.getTimeUntilNextLine() / 1000);
    return `{red-fg}SUDDEN DEATH! Lines: ${this.linesAdded} Next: ${nextLine}s{/red-fg}`;
  }

  /**
   * Serialize state
   */
  getState(): SuddenDeathState {
    return {
      enabled: this.enabled,
      delayMs: this.delayMs,
      tickIntervalMs: this.tickIntervalMs,
      startTime: this.startTime,
      lastTickTime: this.lastTickTime,
      linesAdded: this.linesAdded,
      active: this.active,
    };
  }

  /**
   * Load state
   */
  loadState(state: SuddenDeathState): void {
    this.enabled = state.enabled;
    this.delayMs = state.delayMs;
    this.tickIntervalMs = state.tickIntervalMs;
    this.startTime = state.startTime;
    this.lastTickTime = state.lastTickTime;
    this.linesAdded = state.linesAdded;
    this.active = state.active;
  }
}
