/**
 * Key State Tracker - Eliminates Browser Key Repeat Delay
 *
 * Browser keyboards have a ~500ms delay before key repeat starts.
 * This tracker emulates instant key repeat for game controls by:
 * 1. Tracking keydown/keyup states
 * 2. Emitting continuous events while keys are held
 * 3. Providing instant response (no initial delay)
 *
 * Usage in ClientDoor (hybrid/client doors):
 * ```typescript
 * const keyTracker = new KeyStateTracker();
 * door.onConnect((user) => {
 *   keyTracker.start((key) => {
 *     // Handle continuous key events (no delay!)
 *     if (key === 'ArrowLeft') movePaddleLeft();
 *     if (key === 'ArrowRight') movePaddleRight();
 *   });
 * });
 * ```
 */

export interface KeyState {
  key: string;
  pressed: boolean;
  timestamp: number;
}

export type KeyPressHandler = (key: string) => void;

export class KeyStateTracker {
  /** Map of currently pressed keys */
  private keyStates: Map<string, KeyState> = new Map();

  /** Callback to invoke for key events */
  private handler: KeyPressHandler | null = null;

  /** Interval handle for emitting continuous events */
  private intervalHandle: number | null = null;

  /** Repeat rate in milliseconds (default: 16ms = ~60fps) */
  private repeatRate: number = 16;

  /** Whether tracker is active */
  private active: boolean = false;

  /**
   * Start tracking key states
   *
   * @param handler - Callback to invoke for each key event (called continuously while key held)
   * @param repeatRate - How often to emit events in ms (default: 16ms = ~60fps)
   */
  public start(handler: KeyPressHandler, repeatRate: number = 16): void {
    if (this.active) {
      console.warn('[KeyStateTracker] Already started');
      return;
    }

    this.handler = handler;
    this.repeatRate = repeatRate;
    this.active = true;

    // Listen for browser keyboard events
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
    }

    // Start emission loop
    this.startEmissionLoop();

    console.log(`[KeyStateTracker] Started (repeat rate: ${repeatRate}ms)`);
  }

  /**
   * Stop tracking and clean up
   */
  public stop(): void {
    if (!this.active) return;

    this.active = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }

    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.keyStates.clear();
    console.log('[KeyStateTracker] Stopped');
  }

  /**
   * Check if a key is currently pressed
   */
  public isKeyPressed(key: string): boolean {
    const state = this.keyStates.get(key);
    return state ? state.pressed : false;
  }

  /**
   * Get all currently pressed keys
   */
  public getPressedKeys(): string[] {
    return Array.from(this.keyStates.values())
      .filter(state => state.pressed)
      .map(state => state.key);
  }

  /**
   * Handle browser keydown event
   * @private
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    // Ignore repeat events from browser (we generate our own)
    if (event.repeat) {
      event.preventDefault();
      return;
    }

    const key = this.normalizeKey(event.key);

    // Update key state
    this.keyStates.set(key, {
      key,
      pressed: true,
      timestamp: Date.now(),
    });

    // Emit immediately (no delay!)
    if (this.handler) {
      this.handler(key);
    }

    event.preventDefault();
  };

  /**
   * Handle browser keyup event
   * @private
   */
  private handleKeyUp = (event: KeyboardEvent): void => {
    const key = this.normalizeKey(event.key);

    // Remove key state
    this.keyStates.delete(key);

    event.preventDefault();
  };

  /**
   * Normalize key names for consistency
   * @private
   */
  private normalizeKey(key: string): string {
    // Map various key names to consistent values
    const keyMap: Record<string, string> = {
      ' ': 'space',
      'Enter': 'enter',
      'Escape': 'escape',
      'Backspace': 'backspace',
      'Tab': 'tab',
      'Shift': 'shift',
      'Control': 'ctrl',
      'Alt': 'alt',
      'Meta': 'meta',
    };

    return keyMap[key] || key.toLowerCase();
  }

  /**
   * Start continuous emission loop
   * @private
   */
  private startEmissionLoop(): void {
    this.intervalHandle = setInterval(() => {
      if (!this.active || !this.handler) return;

      // Emit for all currently pressed keys
      for (const state of this.keyStates.values()) {
        if (state.pressed) {
          this.handler(state.key);
        }
      }
    }, this.repeatRate) as any;
  }
}
