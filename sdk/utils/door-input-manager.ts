/**
 * Door Input Manager
 *
 * Centralized management of door input state to prevent common cleanup bugs.
 * Handles BBS game mode, blessed keyboard capture, mouse events, and input handlers.
 *
 * Why this exists:
 * - Input handling has 7+ layers with unclear ownership
 * - Easy to forget cleanup steps (grabKeys, mouse, gameMode, etc.)
 * - Order matters - must disable in reverse of enable
 * - Missing cleanup breaks BBS input after door exit
 *
 * Auto-Suspend Feature (NEW):
 * - Automatically detects when blessed widgets (List, Textbox, etc.) gain focus
 * - Suspends game mode so widgets can receive keyboard input
 * - Resumes game mode when widgets lose focus
 * - Prevents the common bug where blessed widgets can't be navigated
 * - Enabled by default (enableAutoSuspend: true)
 *
 * Usage:
 * ```typescript
 * // In door constructor
 * this.inputManager = new DoorInputManager(session, screen, {
 *   enableGameMode: true,
 *   enableGrabKeys: true,
 *   enableMouse: true,
 *   enableAutoSuspend: true,  // Auto-suspend when blessed widgets gain focus (default: true)
 *   debug: false
 * });
 *
 * // When door starts
 * this.inputManager.enable();
 *
 * // When door exits (automatic cleanup)
 * this.inputManager.disable();
 *
 * // Manual suspend/resume still available if needed
 * this.inputManager.suspend();  // Before showing blessed widgets
 * this.inputManager.resume();   // After blessed widgets lose focus
 * ```
 */

import type { Screen } from '../engines/ui/blessed';
import { setupInputHandler, removeInputHandler } from './blessed-helpers';

export interface DoorInputOptions {
  /**
   * Enable BBS game mode (raw keyboard events, bypass line buffering)
   * Required for real-time input like games
   */
  enableGameMode?: boolean;

  /**
   * Enable blessed grabKeys (global keyboard capture)
   * Required for doors that need to capture all keys (arrows, function keys, etc.)
   * CRITICAL: Must be disabled on exit or BBS input breaks
   */
  enableGrabKeys?: boolean;

  /**
   * Enable blessed mouse events
   * Required for doors with mouse interaction
   */
  enableMouse?: boolean;

  /**
   * Enable automatic input suspension when blessed widgets gain focus
   * When true, game mode is automatically suspended when List/Textbox widgets receive focus
   * and resumed when they lose focus. This prevents the common bug where blessed widgets
   * can't receive keyboard input because game mode is still active.
   * Default: true (recommended for all doors with blessed widgets)
   */
  enableAutoSuspend?: boolean;

  /**
   * Track which keys are currently held, from real key-down/key-up edges.
   *
   * Off by default: only real-time games want it, and it is meaningless to
   * the doors that drive blessed widgets.
   *
   * Why it exists: blessed delivers CHARACTERS, not key presses and
   * releases. Holding a key therefore arrives as the client's auto-repeat -
   * one character, a ~400-500ms pause, then a fast stream - so a door that
   * moves on each character inherits that stutter and cannot do anything
   * about it. Both doors in this repo whose movement feels right avoid the
   * character stream entirely: GrandMaster takes real edges from
   * bbs.onKeyDown/onKeyUp, and Arkanoid keeps a held-key set and moves once
   * per frame while a key is down. This option provides that same held-key
   * state to any door.
   *
   * Requires game mode, which is what makes the client send key events at
   * all; enabling this turns enableGameMode on implicitly.
   */
  trackHeldKeys?: boolean;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Debug name for log messages
   */
  debugName?: string;
}

/** Options for a single {@link DoorInputManager.consumeRepeat} call. */
export interface RepeatOptions {
  /**
   * Milliseconds to wait after the first step before repeating.
   *
   * Defaults to 0 - Arkanoid's feel, where holding a key moves every frame
   * with no hesitation. Set it (GrandMaster uses 267) for a game that wants
   * a deliberate pause before auto-repeat, such as a discrete grid stepper.
   */
  initialDelay?: number;

  /** Milliseconds between repeats once repeating has begun. */
  repeatRate?: number;
}

export class DoorInputManager {
  private session: any;
  private screen: Screen;
  private options: Required<DoorInputOptions>;
  private enabled: boolean = false;
  private suspended: boolean = false;
  private autoSuspended: boolean = false;  // Track auto-suspend separately from manual suspend
  private autoSuspendEnabled: boolean = false;

  /** Keys currently held down, normalised (see normaliseKeyName). */
  private held: Set<string> = new Set();
  /** True once key-down/key-up handlers are actually attached. */
  private keyStateActive: boolean = false;
  /** When each held key last produced a step, for consumeRepeat. */
  private lastStepAt: Map<string, number> = new Map();
  /** When each held key was first pressed, for the initial delay. */
  private pressedAt: Map<string, number> = new Map();

  constructor(session: any, screen: Screen, options: DoorInputOptions = {}) {
    this.session = session;
    this.screen = screen;
    this.options = {
      // Held-key tracking is fed by the client's key events, which only
      // arrive in game mode - so asking for one implies the other.
      enableGameMode: options.enableGameMode ?? options.trackHeldKeys ?? false,  // Default OFF - only enable for raw game input (ncurses)
      trackHeldKeys: options.trackHeldKeys ?? false,
      enableGrabKeys: options.enableGrabKeys ?? false,  // Default OFF - only enable for games needing all keys
      enableMouse: options.enableMouse ?? true,
      enableAutoSuspend: options.enableAutoSuspend ?? true,  // Default ON - auto-suspend when blessed widgets gain focus
      debug: options.debug ?? false,
      debugName: options.debugName ?? 'DoorInputManager'
    };
    this.autoSuspendEnabled = this.options.enableAutoSuspend;
  }

  /**
   * Enable door input (BBS game mode, keyboard capture, mouse)
   * Call this when door starts
   */
  enable(): void {
    if (this.enabled) {
      this.log('Already enabled, skipping');
      return;
    }

    this.log('Enabling door input...');

    // 1. Enable BBS game mode (raw keyboard events)
    if (this.options.enableGameMode && this.session.bbs?.enableGameMode) {
      this.session.bbs.enableGameMode();
      this.log('✓ Game mode enabled');
    }

    // 2. Mark BBS session as in door
    if (this.session.bbsSession) {
      this.session.bbsSession.inDoorManager = true;
      this.log('✓ inDoorManager = true');
    }

    // 3. Enable blessed keyboard capture
    if (this.options.enableGrabKeys && this.screen?.program) {
      (this.screen.program as any).grabKeys = true;
      this.log('✓ grabKeys enabled');
    }

    // 4. Enable blessed mouse events
    console.log('[DoorInputManager] Checking blessed mouse: enableMouse=', this.options.enableMouse, 'hasScreen=', !!this.screen, 'hasProgram=', !!this.screen?.program);
    if (this.options.enableMouse && this.screen?.program) {
      console.log('[DoorInputManager] Calling screen.program.enableMouse()');
      this.screen.program.enableMouse();
      console.log('[DoorInputManager] screen.program._mouseEnabled=', (this.screen.program as any)._mouseEnabled);
      this.log('✓ Blessed mouse events enabled');
    } else {
      console.log('[DoorInputManager] Skipped blessed mouse enablement');
    }

    // 4b. Enable BBS session mouse events (required for socket-handlers to forward mouse to door)
    // Set DIRECTLY on bbsSession - this is what socket-handlers checks
    console.log('[DoorInputManager] Checking BBS mouse: enableMouse=', this.options.enableMouse, 'hasSession=', !!this.session.bbsSession);
    if (this.options.enableMouse && this.session.bbsSession) {
      this.session.bbsSession.mouseEventsEnabled = true;
      console.log('[DoorInputManager] Set bbsSession.mouseEventsEnabled = true');
      this.log('✓ BBS mouse events enabled');
    }

    // 5. Setup input handler (BBS → blessed bridge)
    if (this.session.bbsSession) {
      setupInputHandler(this.session, this.screen, {
        debug: this.options.debug,
        debugName: this.options.debugName
      });
      this.log('✓ Input handler connected');
    }

    // 5b. Track held keys from real key-down/key-up edges
    this.setupHeldKeyTracking();

    // 6. Setup automatic input suspension for blessed widgets
    this.setupAutoSuspend();

    this.enabled = true;
    this.log('Door input enabled');
  }

  /**
   * Normalise a client key name to the short lowercase form doors use.
   *
   * The client sends browser KeyboardEvent.key values ("ArrowLeft", " ");
   * doors think in terms of "left" and "space". Same mapping GrandMaster
   * uses, so the two agree on names.
   */
  private static normaliseKeyName(key: string): string {
    switch (key) {
      case 'ArrowLeft': return 'left';
      case 'ArrowRight': return 'right';
      case 'ArrowUp': return 'up';
      case 'ArrowDown': return 'down';
      case ' ':
      case 'Spacebar': return 'space';
      case 'Enter': return 'enter';
      case 'Escape': return 'escape';
      default: return key.toLowerCase();
    }
  }

  /**
   * Attach key-down/key-up handlers, if the session can deliver them.
   *
   * Silently does nothing when the transport has no key events - telnet and
   * SSH sessions, for instance. isKeyStateActive() then stays false and the
   * door keeps whatever character-driven path it had.
   */
  private setupHeldKeyTracking(): void {
    if (!this.options.trackHeldKeys) return;

    const bbs = this.session?.bbs;
    if (!bbs?.onKeyDown || !bbs?.onKeyUp) {
      this.log('Held-key tracking requested but this session sends no key events');
      return;
    }

    // Register down BEFORE up: onKeyUp wraps the existing handler to build a
    // single combined callback, so the order is not interchangeable.
    bbs.onKeyDown((key: string) => {
      const name = DoorInputManager.normaliseKeyName(key);
      // The client re-sends key-down while a key auto-repeats. Only a real
      // edge counts, or the press time resets and the repeat never settles.
      if (this.held.has(name)) return;
      this.held.add(name);
      this.pressedAt.set(name, Date.now());
      this.lastStepAt.delete(name);
    });

    bbs.onKeyUp((key: string) => {
      const name = DoorInputManager.normaliseKeyName(key);
      this.held.delete(name);
      this.pressedAt.delete(name);
      this.lastStepAt.delete(name);
    });

    this.keyStateActive = true;
    this.log('✓ Held-key tracking enabled');
  }

  /**
   * Are real key-down/key-up edges being delivered?
   *
   * Doors use this to decide whether to drive movement from held keys or
   * fall back to their character handler. A door that acts on BOTH moves
   * twice per press, so the character path must check this and return.
   */
  isKeyStateActive(): boolean {
    return this.keyStateActive && !this.suspended && !this.autoSuspended;
  }

  /** Is this key currently held? Name in short form, e.g. "left". */
  isHeld(key: string): boolean {
    if (!this.isKeyStateActive()) return false;
    return this.held.has(key);
  }

  /** Every currently held key. */
  heldKeys(): string[] {
    if (!this.isKeyStateActive()) return [];
    return [...this.held];
  }

  /**
   * Should the game loop take one movement step for this key right now?
   *
   * Call once per key per tick. Returns true immediately on the press, then
   * again once per repeatRate for as long as the key stays down (after
   * initialDelay, when one is given). Returns false when the key is not
   * held, so a loop can simply ask each direction every frame.
   *
   * With the defaults - no initial delay, repeat governed only by how often
   * the loop asks - this reproduces Arkanoid's feel: movement starts the
   * instant the key goes down and continues smoothly while it is held,
   * without the client's auto-repeat gap.
   */
  consumeRepeat(key: string, options: RepeatOptions = {}): boolean {
    if (!this.isHeld(key)) return false;

    const { initialDelay = 0, repeatRate = 0 } = options;
    const now = Date.now();
    const last = this.lastStepAt.get(key);

    // First step of this press: always immediate.
    if (last === undefined) {
      this.lastStepAt.set(key, now);
      return true;
    }

    const pressed = this.pressedAt.get(key) ?? now;
    if (initialDelay > 0 && now - pressed < initialDelay) return false;
    if (now - last < repeatRate) return false;

    this.lastStepAt.set(key, now);
    return true;
  }

  /** Forget all held-key state. Used on disable and on suspend. */
  private clearHeldKeys(): void {
    this.held.clear();
    this.pressedAt.clear();
    this.lastStepAt.clear();
  }

  /**
   * Disable door input (restore BBS state)
   * Call this when door exits
   * CRITICAL: Must be called or BBS input breaks
   */
  disable(): void {
    if (!this.enabled) {
      this.log('Already disabled, skipping');
      return;
    }

    this.log('Disabling door input...');

    // Disable in REVERSE order of enable

    // 5. Remove input handler
    if (this.session.bbsSession && this.session.bbsSession.doorInputHandler) {
      removeInputHandler(this.session);
      this.log('✓ Input handler removed');
    }

    // 4b. Disable BBS session mouse events
    // Set DIRECTLY on bbsSession - this is what socket-handlers checks
    if (this.options.enableMouse && this.session.bbsSession) {
      this.session.bbsSession.mouseEventsEnabled = false;
      this.log('✓ BBS mouse events disabled');
    }

    // 4. Disable blessed mouse events
    if (this.options.enableMouse && this.screen?.program) {
      this.screen.program.disableMouse();
      this.log('✓ Blessed mouse events disabled');
    }

    // 3. Disable blessed keyboard capture
    if (this.options.enableGrabKeys && this.screen?.program) {
      (this.screen.program as any).grabKeys = false;
      this.log('✓ grabKeys disabled');
    }

    // 2. Mark BBS session as not in door
    if (this.session.bbsSession) {
      this.session.bbsSession.inDoorManager = false;
      this.log('✓ inDoorManager = false');
    }

    // 1. Disable BBS game mode
    if (this.options.enableGameMode && this.session.bbs?.disableGameMode) {
      this.session.bbs.disableGameMode();
      this.log('✓ Game mode disabled');
    }

    this.enabled = false;
    this.suspended = false;
    this.keyStateActive = false;
    this.clearHeldKeys();
    this.log('Door input disabled');
  }

  /**
   * Check if input is currently enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Temporarily suspend input (for blessed widgets like List, Textbox)
   * Use resume() to re-enable
   * CRITICAL: Must suspend game mode or blessed widgets can't receive keyboard input
   */
  suspend(): void {
    if (!this.enabled) return;
    if (this.suspended) return;  // Already suspended

    this.log('Suspending input...');

    // Clear auto-suspend flag when manually suspending
    this.autoSuspended = false;

    // Game mode goes away here, so no key-up will arrive for anything held
    // right now. Forget it, or that key looks stuck down on resume.
    this.clearHeldKeys();

    // Suspend game mode so blessed widgets can receive keyboard input
    if (this.options.enableGameMode && this.session.bbs?.disableGameMode) {
      this.session.bbs.disableGameMode();
      this.log('✓ Game mode suspended');
    }

    // Suspend keyboard capture
    if (this.options.enableGrabKeys && this.screen?.program) {
      (this.screen.program as any).grabKeys = false;
      this.log('✓ grabKeys suspended');
    }

    this.suspended = true;
  }

  /**
   * Resume input after suspend()
   */
  resume(): void {
    if (!this.enabled) return;

    this.log('Resuming input...');

    // Clear auto-suspend flag when manually resuming
    this.autoSuspended = false;

    // Resume game mode
    if (this.options.enableGameMode && this.session.bbs?.enableGameMode) {
      this.session.bbs.enableGameMode();
      this.log('✓ Game mode resumed');
    }

    // Resume keyboard capture
    if (this.options.enableGrabKeys && this.screen?.program) {
      (this.screen.program as any).grabKeys = true;
      this.log('✓ grabKeys resumed');
    }

    this.suspended = false;
  }

  /**
   * Setup automatic input suspension when blessed widgets gain focus
   * This prevents the common bug where blessed widgets can't receive keyboard input
   * because game mode is still active
   */
  private setupAutoSuspend(): void {
    if (!this.autoSuspendEnabled) return;
    if (!this.options.enableGameMode && !this.options.enableGrabKeys) {
      // No need for auto-suspend if neither game mode nor grabKeys is enabled
      return;
    }

    this.log('Setting up auto-suspend for blessed widgets...');

    // Hook into screen's element focus events
    // When a blessed widget (List, Textbox, Button, etc.) gains focus, suspend game mode
    this.screen.on('element focus', (el: any) => {
      // Check if the focused element is a blessed widget that needs keyboard input
      const needsKeyboard = el && (
        el.type === 'list' ||
        el.type === 'listbar' ||
        el.type === 'textbox' ||
        el.type === 'textarea' ||
        el.type === 'input' ||
        el.type === 'button' ||
        el.type === 'checkbox' ||
        el.type === 'radioset' ||
        el.type === 'form'
      );

      if (needsKeyboard && !this.autoSuspended && !this.suspended) {
        this.log(`Auto-suspend triggered by ${el.type} widget`);
        this.autoSuspended = true;
        // No key-up will reach us while suspended (see suspend()).
        this.clearHeldKeys();

        // Only suspend if not already manually suspended
        if (!this.suspended) {
          // Suspend game mode so blessed widgets can receive keyboard input
          if (this.options.enableGameMode && this.session.bbs?.disableGameMode) {
            this.session.bbs.disableGameMode();
            this.log('✓ Game mode auto-suspended');
          }

          // Suspend keyboard capture
          if (this.options.enableGrabKeys && this.screen?.program) {
            (this.screen.program as any).grabKeys = false;
            this.log('✓ grabKeys auto-suspended');
          }
        }
      }
    });

    // When focus is lost or moves to non-widget elements, resume game mode
    this.screen.on('element blur', (el: any) => {
      const wasWidget = el && (
        el.type === 'list' ||
        el.type === 'listbar' ||
        el.type === 'textbox' ||
        el.type === 'textarea' ||
        el.type === 'input' ||
        el.type === 'button' ||
        el.type === 'checkbox' ||
        el.type === 'radioset' ||
        el.type === 'form'
      );

      // Resume if we were auto-suspended and the element losing focus was a widget
      if (wasWidget && this.autoSuspended) {
        // Small delay to allow new focus to be set before deciding to resume
        setTimeout(() => {
          // Only resume if no other widget has focus
          const focused = this.screen.focused;
          const newFocusIsWidget = focused && typeof focused === 'object' && (
            (focused as any).type === 'list' ||
            (focused as any).type === 'listbar' ||
            (focused as any).type === 'textbox' ||
            (focused as any).type === 'textarea' ||
            (focused as any).type === 'input' ||
            (focused as any).type === 'button' ||
            (focused as any).type === 'checkbox' ||
            (focused as any).type === 'radioset' ||
            (focused as any).type === 'form'
          );

          if (!newFocusIsWidget) {
            this.log('Auto-resume triggered (no widget has focus)');
            this.autoSuspended = false;

            // Only resume if not manually suspended
            if (!this.suspended) {
              // Resume game mode
              if (this.options.enableGameMode && this.session.bbs?.enableGameMode) {
                this.session.bbs.enableGameMode();
                this.log('✓ Game mode auto-resumed');
              }

              // Resume keyboard capture
              if (this.options.enableGrabKeys && this.screen?.program) {
                (this.screen.program as any).grabKeys = true;
                this.log('✓ grabKeys auto-resumed');
              }
            }
          }
        }, 10);
      }
    });

    this.log('✓ Auto-suspend hooks installed');
  }

  /**
   * Log debug message
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[${this.options.debugName}] ${message}`);
    }
  }

  /**
   * Cleanup (called automatically by destroy)
   * Ensures input is properly disabled even if door crashes
   */
  destroy(): void {
    if (this.enabled) {
      this.log('Auto-cleanup on destroy');
      this.disable();
    }
  }
}
