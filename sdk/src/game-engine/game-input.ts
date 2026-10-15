/**
 * Game input handling system for real-time key state tracking
 */
export class GameInput {
  private socket: any;
  private keyStates: Map<string, boolean>;
  private keyPressCallbacks: Map<string, (() => void)[]>;
  private keyReleaseCallbacks: Map<string, (() => void)[]>;
  private functionKeyCallbacks: Map<string, (() => void)[]>;

  constructor(socket: any) {
    this.socket = socket;
    this.keyStates = new Map();
    this.keyPressCallbacks = new Map();
    this.keyReleaseCallbacks = new Map();
    this.functionKeyCallbacks = new Map();
  }

  /**
   * Set up input handling (call this in your door)
   */
  setupInputHandling(bbsSession: any): void {
    bbsSession.doorInputHandler = (data: string) => {
      this.handleKeyInput(data);
    };
  }

  /**
   * Handle key input
   */
  private handleKeyInput(data: string): void {
    const key = data.toLowerCase();

    // Handle escape sequences
    if (data.startsWith('\x1b[')) {
      // Function keys
      if (data === '\x1b[11~' || data === '\x1bOP') this.triggerFunctionKey('f1');
      else if (data === '\x1b[12~' || data === '\x1bOQ') this.triggerFunctionKey('f2');
      else if (data === '\x1b[13~' || data === '\x1bOR') this.triggerFunctionKey('f3');
      else if (data === '\x1b[14~' || data === '\x1bOS') this.triggerFunctionKey('f4');
      else if (data === '\x1b[15~') this.triggerFunctionKey('f5');
      else if (data === '\x1b[17~') this.triggerFunctionKey('f6');
      else if (data === '\x1b[18~') this.triggerFunctionKey('f7');
      else if (data === '\x1b[19~') this.triggerFunctionKey('f8');
      else if (data === '\x1b[20~') this.triggerFunctionKey('f9');
      else if (data === '\x1b[21~') this.triggerFunctionKey('f10');
      else if (data === '\x1b[23~') this.triggerFunctionKey('f11');
      else if (data === '\x1b[24~') this.triggerFunctionKey('f12');
      // Arrow keys
      else if (data === '\x1b[A') this.pressKey('arrow_up');
      else if (data === '\x1b[B') this.pressKey('arrow_down');
      else if (data === '\x1b[C') this.pressKey('arrow_right');
      else if (data === '\x1b[D') this.pressKey('arrow_left');
    } else if (data === ' ') {
      this.pressKey('space');
    } else if (data === '\r' || data === '\n') {
      this.pressKey('enter');
    } else if (data === '\x1b') {
      this.pressKey('escape');
    } else if (key >= 'a' && key <= 'z') {
      this.pressKey(key);
    } else if (key >= '0' && key <= '9') {
      this.pressKey(key);
    }
  }

  /**
   * Press a key
   */
  private pressKey(key: string): void {
    const wasPressed = this.keyStates.get(key) || false;
    this.keyStates.set(key, true);

    if (!wasPressed) {
      this.triggerCallbacks(key, this.keyPressCallbacks);
    }
  }

  /**
   * Release a key
   */
  releaseKey(key: string): void {
    const wasPressed = this.keyStates.get(key) || false;
    this.keyStates.set(key, false);

    if (wasPressed) {
      this.triggerCallbacks(key, this.keyReleaseCallbacks);
    }
  }

  /**
   * Release all keys
   */
  releaseAll(): void {
    this.keyStates.forEach((_, key) => {
      this.releaseKey(key);
    });
  }

  /**
   * Check if key is currently pressed
   */
  isKeyPressed(key: string): boolean {
    return this.keyStates.get(key.toLowerCase()) || false;
  }

  /**
   * Add callback for key press
   */
  onKeyPress(key: string, callback: () => void): void {
    const callbacks = this.keyPressCallbacks.get(key) || [];
    callbacks.push(callback);
    this.keyPressCallbacks.set(key, callbacks);
  }

  /**
   * Add callback for key release
   */
  onKeyRelease(key: string, callback: () => void): void {
    const callbacks = this.keyReleaseCallbacks.get(key) || [];
    callbacks.push(callback);
    this.keyReleaseCallbacks.set(key, callbacks);
  }

  /**
   * Add callback for function key press (F1-F12)
   */
  onFunctionKey(functionKey: string, callback: () => void): void {
    const key = functionKey.toLowerCase();
    const callbacks = this.functionKeyCallbacks.get(key) || [];
    callbacks.push(callback);
    this.functionKeyCallbacks.set(key, callbacks);
  }

  /**
   * Trigger function key callback
   */
  private triggerFunctionKey(functionKey: string): void {
    const key = functionKey.toLowerCase();
    const callbacks = this.functionKeyCallbacks.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback());
    }
  }

  /**
   * Trigger callbacks
   */
  private triggerCallbacks(key: string, callbackMap: Map<string, (() => void)[]>): void {
    const callbacks = callbackMap.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback());
    }
  }

  /**
   * Clear all callbacks
   */
  clearCallbacks(): void {
    this.keyPressCallbacks.clear();
    this.keyReleaseCallbacks.clear();
    this.functionKeyCallbacks.clear();
  }

  /**
   * Clear key states
   */
  clearStates(): void {
    this.keyStates.clear();
  }
}
