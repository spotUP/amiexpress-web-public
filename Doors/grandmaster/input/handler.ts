/**
 * Input Handler
 *
 * Manages keyboard input with DAS/ARR timing
 */

import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GameAction, InputState } from '../core/types';
import { keyToAction, DEFAULT_KEYS, TIMING, type KeyConfig } from './config';

/**
 * Door session interface
 */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params?: string[];
  args?: string[];
}

/**
 * Input handler with DAS/ARR support
 */
export class InputHandler {
  private state: InputState;
  private config: KeyConfig;
  private lastUpdate: number = 0;
  private enabled: boolean = true;

  // Directional state (for DAS/ARR)
  private leftPressed: boolean = false;
  private rightPressed: boolean = false;
  private downPressed: boolean = false;
  private dasTimer: number = 0;
  private arrTimer: number = 0;

  // Key release simulation (blessed doesn't emit keyrelease)
  private lastLeftPress: number = 0;
  private lastRightPress: number = 0;
  private lastDownPress: number = 0;
  private readonly KEY_RELEASE_TIMEOUT = 100; // Increased from 50ms to 100ms to better simulate key release

  // Action callbacks
  private actionHandlers: Map<GameAction, () => void> = new Map();

  // Debounce for non-directional keys (rotation, hold, hard drop)
  private lastActionTime: Map<GameAction, number> = new Map();
  // 33 ms: just enough to absorb duplicate delivery of one physical press,
  // without eating deliberate fast double-taps the way 100 ms did.
  private readonly ACTION_DEBOUNCE = 33; // ms

  // Store handler reference for proper cleanup
  private keypressHandler: ((ch: string | undefined, key: any) => void) | null = null;

  /**
   * True key-state mode: driven by real browser key-down/key-up events via
   * BBSApi.onKeyDown/onKeyUp (game mode). This is the designed-for input
   * model - blessed emits no key releases, so the old path had to SIMULATE
   * "held" with a 100 ms timeout that expired before the first auto-repeat
   * ever arrived (~400-500 ms), and every repeat keypress reset dasTimer.
   * Net effect: the configured DAS 133 ms / ARR 10 ms never ran and
   * movement was whatever the client repeat produced (~400/30). With real
   * press/release edges, DAS/ARR runs exactly as configured.
   */
  private keyStateMode: boolean = false;

  constructor(
    private screen: Screen,
    private session: DoorSession,
    config: KeyConfig = DEFAULT_KEYS
  ) {
    this.config = config;
    this.state = {
      heldKeys: new Set<string>(),
      dasTimer: 0,
      arrTimer: 0,
      lastAction: null,
    };

    this.setupEventHandlers();
    this.setupKeyStateHandlers();
  }

  /** Map browser KeyboardEvent.key names onto blessed-style config names. */
  private static browserKeyName(key: string): string {
    switch (key) {
      case 'ArrowLeft': return 'left';
      case 'ArrowRight': return 'right';
      case 'ArrowDown': return 'down';
      case 'ArrowUp': return 'up';
      case ' ': case 'Spacebar': return 'space';
      case 'Enter': return 'enter';
      case 'Escape': return 'escape';
      case 'Shift': return 'lshift';
      case 'Control': return 'lcontrol';
      case 'PageUp': return 'pageup';
      case 'PageDown': return 'pagedown';
      default: return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
    }
  }

  private setupKeyStateHandlers(): void {
    const bbs = this.session?.bbs;
    if (!bbs?.onKeyDown || !bbs?.onKeyUp) return;

    this.keyStateMode = true;

    // Register down FIRST, then up - BBSApi.onKeyUp wraps the existing
    // handler, producing one combined doorKeyStateHandler.
    bbs.onKeyDown((key: string) => {
      if (!this.enabled) return;
      const name = InputHandler.browserKeyName(key);
      // The client emits repeats as extra key-down events; only a genuine
      // edge (not already held) starts DAS or fires a tap action.
      if (this.state.heldKeys.has(name)) return;
      this.state.heldKeys.add(name);
      this.handleKeyEdge(name);
    });

    bbs.onKeyUp((key: string) => {
      const name = InputHandler.browserKeyName(key);
      this.state.heldKeys.delete(name);
      if (this.config.left.includes(name)) {
        this.leftPressed = false;
        this.dasTimer = 0;
        this.arrTimer = 0;
      } else if (this.config.right.includes(name)) {
        this.rightPressed = false;
        this.dasTimer = 0;
        this.arrTimer = 0;
      } else if (this.config.softDrop.includes(name)) {
        this.downPressed = false;
      }
    });
  }

  /** Shared press-edge logic for both input paths. */
  private handleKeyEdge(keyName: string): void {
    const now = Date.now();
    if (this.config.left.includes(keyName)) {
      this.rightPressed = false;
      this.leftPressed = true;
      this.lastLeftPress = now;
      this.dasTimer = 0;
      this.arrTimer = 0;
      this.triggerAction('left');
    } else if (this.config.right.includes(keyName)) {
      this.leftPressed = false;
      this.rightPressed = true;
      this.lastRightPress = now;
      this.dasTimer = 0;
      this.arrTimer = 0;
      this.triggerAction('right');
    } else if (this.config.softDrop.includes(keyName)) {
      this.downPressed = true;
      this.lastDownPress = now;
      this.triggerAction('soft_drop');
    } else {
      const action = keyToAction(keyName, this.config);
      if (action && action !== 'left' && action !== 'right' && action !== 'soft_drop') {
        const lastTime = this.lastActionTime.get(action) || 0;
        if (now - lastTime >= this.ACTION_DEBOUNCE) {
          this.lastActionTime.set(action, now);
          this.triggerAction(action);
        }
      }
    }
  }

  /**
   * Setup keyboard event handlers
   */
  private setupEventHandlers(): void {
    this.keypressHandler = (ch: string | undefined, key: any) => {
      if (!this.enabled) return;
      // Real key-state mode owns gameplay input: every client repeat also
      // arrives here as a char, so acting on keypresses too would
      // double-trigger every move.
      if (this.keyStateMode) return;
      if (!key) return;

      const keyName = key.full || key.name;
      if (!keyName) return;

      this.state.heldKeys.add(keyName);

      // FALLBACK path (no game-mode key events available): repeats arrive
      // as fresh keypresses. Only treat a direction as a new edge if it is
      // not already held - the old code reset dasTimer on EVERY repeat,
      // which is one of the two reasons DAS never fired.
      if (this.config.left.includes(keyName)) {
        if (!this.leftPressed) {
          this.handleKeyEdge(keyName);
        } else {
          this.lastLeftPress = Date.now(); // keep-alive for release timeout
        }
      } else if (this.config.right.includes(keyName)) {
        if (!this.rightPressed) {
          this.handleKeyEdge(keyName);
        } else {
          this.lastRightPress = Date.now();
        }
      } else if (this.config.softDrop.includes(keyName)) {
        if (!this.downPressed) {
          this.handleKeyEdge(keyName);
        } else {
          this.lastDownPress = Date.now();
        }
      } else {
        this.handleKeyEdge(keyName);
      }
    };

    this.screen.on('keypress', this.keypressHandler);

    // Note: blessed doesn't emit keyrelease, so we need to track this differently
    // For now, we'll assume keys are released after a short time
  }

  /**
   * Enable or disable input handling.
   * When disabled, the keypress handler is removed to prevent interference with widgets.
   */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;  // No change

    this.enabled = enabled;

    // Remove or re-add the keypress handler based on enabled state
    if (enabled && this.keypressHandler) {
      // Re-add handler
      console.log('[InputHandler] Re-enabling keypress handler');
      this.screen.on('keypress', this.keypressHandler);
    } else if (!enabled && this.keypressHandler) {
      // Remove handler to prevent interference with blessed widgets
      console.log('[InputHandler] Removing keypress handler');
      this.screen.removeListener('keypress', this.keypressHandler);
    }
  }

  /**
   * Update input state (call every frame)
   */
  update(deltaTime: number): void {
    const now = Date.now();
    if (this.lastUpdate === 0) {
      this.lastUpdate = now;
      return;
    }

    const dt = now - this.lastUpdate;
    this.lastUpdate = now;

    // Simulate key release after timeout - FALLBACK path only; in key-state
    // mode real key-up events clear the flags.
    if (!this.keyStateMode && this.leftPressed && now - this.lastLeftPress > this.KEY_RELEASE_TIMEOUT) {
      this.leftPressed = false;
      this.dasTimer = 0;
      this.arrTimer = 0;
    }
    if (!this.keyStateMode && this.rightPressed && now - this.lastRightPress > this.KEY_RELEASE_TIMEOUT) {
      this.rightPressed = false;
      this.dasTimer = 0;
      this.arrTimer = 0;
    }
    if (!this.keyStateMode && this.downPressed && now - this.lastDownPress > this.KEY_RELEASE_TIMEOUT) {
      this.downPressed = false;
    }

    // Update DAS/ARR for held directional keys
    if (this.leftPressed || this.rightPressed) {
      this.dasTimer += dt;

      if (this.dasTimer >= TIMING.DAS_DELAY) {
        // DAS has expired, start ARR
        this.arrTimer += dt;

        if (this.arrTimer >= TIMING.ARR_RATE) {
          this.arrTimer = 0;

          // Trigger repeat
          if (this.leftPressed) {
            this.triggerAction('left');
          } else if (this.rightPressed) {
            this.triggerAction('right');
          }
        }
      }
    }

    // Soft drop repeat
    if (this.downPressed) {
      this.arrTimer += dt;
      if (this.arrTimer >= TIMING.SOFT_DROP_RATE) {
        this.arrTimer = 0;
        this.triggerAction('soft_drop');
      }
    }

    // Note: Keys remain held for DAS/ARR to work properly
    // They are only cleared when a different directional key is pressed
    // This compensates for blessed not providing keyrelease events
  }

  /**
   * Clear held keys (simulate key release)
   */
  private clearHeldKeys(): void {
    this.state.heldKeys.clear();
    this.leftPressed = false;
    this.rightPressed = false;
    this.downPressed = false;
  }

  /**
   * Trigger game action
   */
  private triggerAction(action: GameAction): void {
    this.state.lastAction = action;
    const handler = this.actionHandlers.get(action);
    if (handler) {
      handler();
    }
  }

  /**
   * Register action handler
   */
  on(action: GameAction, handler: () => void): void {
    this.actionHandlers.set(action, handler);
  }

  /**
   * Remove action handler
   */
  off(action: GameAction): void {
    this.actionHandlers.delete(action);
  }

  /**
   * Check if key is held
   */
  isKeyHeld(key: string): boolean {
    return this.state.heldKeys.has(key);
  }

  /**
   * Get current input state
   */
  getState(): InputState {
    return { ...this.state };
  }

  /**
   * Reset input state
   */
  reset(): void {
    this.state.heldKeys.clear();
    this.state.dasTimer = 0;
    this.state.arrTimer = 0;
    this.state.lastAction = null;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.leftPressed = false;
    this.rightPressed = false;
    this.downPressed = false;
    this.lastLeftPress = 0;
    this.lastRightPress = 0;
    this.lastDownPress = 0;
  }

  /**
   * Update key configuration
   */
  updateConfig(config: KeyConfig): void {
    this.config = config;
  }

  /**
   * Get current key configuration
   */
  getConfig(): KeyConfig {
    return this.config;
  }

  /**
   * Destroy input handler
   */
  destroy(): void {
    // Only remove our specific handler, not ALL keypress handlers
    if (this.keypressHandler) {
      this.screen.removeListener('keypress', this.keypressHandler);
      this.keypressHandler = null;
    }
    this.actionHandlers.clear();
    this.reset();
  }
}
