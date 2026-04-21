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
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Debug name for log messages
   */
  debugName?: string;
}

export class DoorInputManager {
  private session: any;
  private screen: Screen;
  private options: Required<DoorInputOptions>;
  private enabled: boolean = false;
  private suspended: boolean = false;
  private autoSuspended: boolean = false;  // Track auto-suspend separately from manual suspend
  private autoSuspendEnabled: boolean = false;

  constructor(session: any, screen: Screen, options: DoorInputOptions = {}) {
    this.session = session;
    this.screen = screen;
    this.options = {
      enableGameMode: options.enableGameMode ?? false,  // Default OFF - only enable for raw game input (ncurses)
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

    // 6. Setup automatic input suspension for blessed widgets
    this.setupAutoSuspend();

    this.enabled = true;
    this.log('Door input enabled');
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
