/**
 * KeyRepeatManager - Backend-side key repeat for 68K doors
 *
 * Handles key repeat timing on the server side to bypass browser OS key repeat delay.
 * When a key is held down, this manager generates repeated key events at a configurable rate.
 *
 * This is specifically for 68K Amiga doors that receive input via XIM protocol,
 * since they can't benefit from frontend game mode directly.
 */

export interface KeyRepeatConfig {
  /** Initial delay before repeat starts (ms) - default 250ms (allows single char typing) */
  initialDelay: number;
  /** Repeat interval (ms) - default 50ms (~20 keys/sec) */
  repeatInterval: number;
}

export type KeyInputCallback = (char: string) => void;

// Keys that should NOT auto-repeat (games track state for these)
const NO_REPEAT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'W', 'a', 'A', 's', 'S', 'd', 'D',
  ' ', 'Control', 'Shift', 'Alt', 'Meta',
  'Escape', 'Enter', 'Tab'
]);

export class KeyRepeatManager {
  private pressedKeys: Map<string, NodeJS.Timeout> = new Map();
  private keyTimers: Map<string, NodeJS.Timeout> = new Map();
  private config: KeyRepeatConfig;
  private inputCallback: KeyInputCallback;
  private active: boolean = false;

  constructor(inputCallback: KeyInputCallback, config?: Partial<KeyRepeatConfig>) {
    this.inputCallback = inputCallback;
    this.config = {
      initialDelay: config?.initialDelay ?? 250,  // 250ms delay allows single char typing
      repeatInterval: config?.repeatInterval ?? 100,  // 10 keys/sec
    };
  }

  /**
   * Start the key repeat manager
   */
  start(): void {
    this.active = true;
console.log('[KeyRepeatManager] Started');
  }

  /**
   * Stop the key repeat manager and clear all timers
   */
  stop(): void {
    this.active = false;
    this.clearAllKeys();
console.log('[KeyRepeatManager] Stopped');
  }

  /**
   * Handle key down event - start repeat timer
   */
  keyDown(key: string, char: string): void {
    if (!this.active) return;

    // If key already pressed, ignore (prevent duplicate timers)
    if (this.pressedKeys.has(key)) return;

    // Mark key as pressed
    this.pressedKeys.set(key, undefined as any);

    // Send initial keypress immediately
    this.inputCallback(char);

    // Don't auto-repeat movement/action keys - games should poll key state instead
    if (NO_REPEAT_KEYS.has(key)) {
      return;
    }

    // Start repeat timer after initial delay
    if (this.config.initialDelay > 0) {
      const initialTimer = setTimeout(() => {
        this.startRepeat(key, char);
      }, this.config.initialDelay);
      this.keyTimers.set(key + '_initial', initialTimer);
    } else {
      // No initial delay - start repeat immediately
      this.startRepeat(key, char);
    }
  }

  /**
   * Handle key up event - stop repeat timer
   */
  keyUp(key: string): void {
    if (!this.active) return;

    // Clear initial delay timer if exists
    const initialTimer = this.keyTimers.get(key + '_initial');
    if (initialTimer) {
      clearTimeout(initialTimer);
      this.keyTimers.delete(key + '_initial');
    }

    // Clear repeat timer
    const repeatTimer = this.keyTimers.get(key);
    if (repeatTimer) {
      clearInterval(repeatTimer);
      this.keyTimers.delete(key);
    }

    // Mark key as released
    this.pressedKeys.delete(key);
  }

  /**
   * Clear all pressed keys and timers
   */
  clearAllKeys(): void {
    // Clear all timers
    for (const timer of this.keyTimers.values()) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    this.keyTimers.clear();
    this.pressedKeys.clear();
  }

  /**
   * Check if a key is currently pressed
   */
  isKeyPressed(key: string): boolean {
    return this.pressedKeys.has(key);
  }

  /**
   * Get all currently pressed keys
   */
  getPressedKeys(): string[] {
    return Array.from(this.pressedKeys.keys());
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<KeyRepeatConfig>): void {
    if (config.initialDelay !== undefined) {
      this.config.initialDelay = config.initialDelay;
    }
    if (config.repeatInterval !== undefined) {
      this.config.repeatInterval = config.repeatInterval;
    }
  }

  /**
   * Start the repeat interval for a key
   */
  private startRepeat(key: string, char: string): void {
    // Don't start if key was released during initial delay
    if (!this.pressedKeys.has(key)) return;

    const timer = setInterval(() => {
      if (this.pressedKeys.has(key)) {
        this.inputCallback(char);
      } else {
        // Key was released, stop timer
        clearInterval(timer);
        this.keyTimers.delete(key);
      }
    }, this.config.repeatInterval);

    this.keyTimers.set(key, timer);
  }
}

/**
 * Convert key name to character for input
 * Same mapping as frontend but on backend
 */
export function keyToChar(key: string): string | null {
  // Single character keys
  if (key.length === 1) {
    return key;
  }

  // Special keys
  const keyMap: Record<string, string> = {
    // Arrow keys (ANSI escape sequences)
    'ArrowUp': '\x1b[A',
    'ArrowDown': '\x1b[B',
    'ArrowRight': '\x1b[C',
    'ArrowLeft': '\x1b[D',
    // Common control keys
    'Enter': '\r',
    'enter': '\r',
    'Escape': '\x1b',
    'escape': '\x1b',
    'Backspace': '\x7f',
    'backspace': '\x7f',
    'Tab': '\t',
    'tab': '\t',
    'space': ' ',
    ' ': ' ',
    // Function keys
    'F1': '\x1bOP',
    'F2': '\x1bOQ',
    'F3': '\x1bOR',
    'F4': '\x1bOS',
    'F5': '\x1b[15~',
    'F6': '\x1b[17~',
    'F7': '\x1b[18~',
    'F8': '\x1b[19~',
    'F9': '\x1b[20~',
    'F10': '\x1b[21~',
    'F11': '\x1b[23~',
    'F12': '\x1b[24~',
    // Navigation
    'Home': '\x1b[H',
    'End': '\x1b[F',
    'PageUp': '\x1b[5~',
    'PageDown': '\x1b[6~',
    'Insert': '\x1b[2~',
    'Delete': '\x1b[3~',
  };

  return keyMap[key] || null;
}
