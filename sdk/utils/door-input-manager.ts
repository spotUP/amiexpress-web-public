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
 * Usage:
 * ```typescript
 * // In door constructor
 * this.inputManager = new DoorInputManager(session, screen, {
 *   enableGameMode: true,
 *   enableGrabKeys: true,
 *   enableMouse: true,
 *   debug: false
 * });
 *
 * // When door starts
 * this.inputManager.enable();
 *
 * // When door exits (automatic cleanup)
 * this.inputManager.disable();
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

  constructor(session: any, screen: Screen, options: DoorInputOptions = {}) {
    this.session = session;
    this.screen = screen;
    this.options = {
      enableGameMode: options.enableGameMode ?? true,
      enableGrabKeys: options.enableGrabKeys ?? true,
      enableMouse: options.enableMouse ?? true,
      debug: options.debug ?? false,
      debugName: options.debugName ?? 'DoorInputManager'
    };
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
    if (this.options.enableMouse && this.screen?.program) {
      this.screen.program.enableMouse();
      this.log('✓ Mouse events enabled');
    }

    // 5. Setup input handler (BBS → blessed bridge)
    if (this.session.bbsSession) {
      setupInputHandler(this.session, this.screen, {
        debug: this.options.debug,
        debugName: this.options.debugName
      });
      this.log('✓ Input handler connected');
    }

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

    // 4. Disable blessed mouse events
    if (this.options.enableMouse && this.screen?.program) {
      this.screen.program.disableMouse();
      this.log('✓ Mouse events disabled');
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
    this.log('Door input disabled');
  }

  /**
   * Check if input is currently enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Temporarily disable input (e.g., for modal dialogs)
   * Use enable() to re-enable
   */
  suspend(): void {
    if (!this.enabled) return;

    this.log('Suspending input...');

    // Only suspend keyboard capture, keep game mode active
    if (this.options.enableGrabKeys && this.screen?.program) {
      (this.screen.program as any).grabKeys = false;
      this.log('✓ grabKeys suspended');
    }
  }

  /**
   * Resume input after suspend()
   */
  resume(): void {
    if (!this.enabled) return;

    this.log('Resuming input...');

    if (this.options.enableGrabKeys && this.screen?.program) {
      (this.screen.program as any).grabKeys = true;
      this.log('✓ grabKeys resumed');
    }
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
