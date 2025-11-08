/**
 * Input Engine - Advanced Input Handling
 *
 * Provides advanced input capabilities:
 * - Keyboard macros
 * - Input mapping/rebinding
 * - Mouse emulation
 * - Input recording/playback
 * - Combo detection
 *
 * @example
 * ```typescript
 * import { InputEngine } from '@amiexpress/sdk/engines/input';
 *
 * const input = new InputEngine();
 *
 * // Define keyboard macro
 * input.addMacro('super-jump', ['ArrowUp', 'ArrowUp', 'Space']);
 *
 * // Map keys
 * input.mapKey('w', 'ArrowUp');
 * input.mapKey('a', 'ArrowLeft');
 *
 * // Handle input
 * input.onInput((key) => {
 *   if (input.isMacroTriggered('super-jump')) {
 *     player.superJump();
 *   }
 * });
 * ```
 */

import { KeyEvent, Position } from '../../core/types';

/** Input mapping */
interface InputMapping {
  from: string;
  to: string;
}

/** Keyboard macro */
interface Macro {
  name: string;
  sequence: string[];
  timeout: number;
}

/** Input action binding */
interface ActionBinding {
  action: string;
  keys: string[];
  callback: () => void;
}

export class InputEngine {
  /** Key mappings */
  private mappings: Map<string, string> = new Map();

  /** Registered macros */
  private macros: Map<string, Macro> = new Map();

  /** Recent key history (for macro detection) */
  private keyHistory: Array<{ key: string; time: number }> = [];

  /** Action bindings */
  private actions: Map<string, ActionBinding> = new Map();

  /** Mouse position (emulated) */
  private mousePosition: Position = { x: 0, y: 0 };

  /** Mouse button states */
  private mouseButtons: Set<number> = new Set();

  /** Input recording */
  private recording: boolean = false;
  private recordedInputs: KeyEvent[] = [];

  /** Input playback */
  private playing: boolean = false;
  private playbackIndex: number = 0;

  /**
   * Map a key to another key
   *
   * @param from - Source key
   * @param to - Target key
   *
   * @example
   * ```typescript
   * // Map WASD to arrow keys
   * input.mapKey('w', 'ArrowUp');
   * input.mapKey('a', 'ArrowLeft');
   * input.mapKey('s', 'ArrowDown');
   * input.mapKey('d', 'ArrowRight');
   * ```
   */
  public mapKey(from: string, to: string): void {
    this.mappings.set(from.toLowerCase(), to);
  }

  /**
   * Remove key mapping
   *
   * @param from - Source key
   */
  public unmapKey(from: string): void {
    this.mappings.delete(from.toLowerCase());
  }

  /**
   * Get mapped key (or original if no mapping)
   *
   * @param key - Input key
   * @returns Mapped key
   */
  public getMappedKey(key: string): string {
    return this.mappings.get(key.toLowerCase()) || key;
  }

  /**
   * Add keyboard macro
   *
   * @param name - Macro name
   * @param sequence - Key sequence
   * @param timeout - Max time between keys (ms)
   *
   * @example
   * ```typescript
   * // Konami code
   * input.addMacro('konami', [
   *   'ArrowUp', 'ArrowUp',
   *   'ArrowDown', 'ArrowDown',
   *   'ArrowLeft', 'ArrowRight',
   *   'ArrowLeft', 'ArrowRight',
   *   'b', 'a'
   * ], 500);
   *
   * if (input.isMacroTriggered('konami')) {
   *   unlockSecretMode();
   * }
   * ```
   */
  public addMacro(name: string, sequence: string[], timeout: number = 1000): void {
    this.macros.set(name, { name, sequence, timeout });
  }

  /**
   * Remove macro
   *
   * @param name - Macro name
   */
  public removeMacro(name: string): void {
    this.macros.delete(name);
  }

  /**
   * Process input key
   *
   * @param key - Input key
   * @returns Processed key (after mapping)
   */
  public processKey(key: string): string {
    // Add to history
    this.keyHistory.push({
      key,
      time: Date.now()
    });

    // Limit history size
    if (this.keyHistory.length > 20) {
      this.keyHistory.shift();
    }

    // Check macros
    this.checkMacros();

    // Return mapped key
    return this.getMappedKey(key);
  }

  /**
   * Check if macro was triggered
   *
   * @param name - Macro name
   * @returns True if macro triggered
   */
  public isMacroTriggered(name: string): boolean {
    const macro = this.macros.get(name);
    if (!macro) return false;

    const now = Date.now();
    const recentKeys = this.keyHistory.filter(
      h => now - h.time <= macro.timeout
    );

    if (recentKeys.length < macro.sequence.length) return false;

    // Check if recent keys match macro sequence
    const startIndex = recentKeys.length - macro.sequence.length;
    for (let i = 0; i < macro.sequence.length; i++) {
      if (recentKeys[startIndex + i].key !== macro.sequence[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check all macros
   * @private
   */
  private checkMacros(): void {
    // Trigger action callbacks for matched macros
    this.macros.forEach((macro) => {
      if (this.isMacroTriggered(macro.name)) {
        const action = this.actions.get(macro.name);
        if (action) {
          action.callback();
        }
      }
    });
  }

  /**
   * Bind action to keys
   *
   * @param action - Action name
   * @param keys - Key(s) to trigger action
   * @param callback - Action callback
   *
   * @example
   * ```typescript
   * input.bindAction('jump', ['Space', 'w'], () => {
   *   player.jump();
   * });
   *
   * input.bindAction('shoot', ['Enter', 'z'], () => {
   *   player.shoot();
   * });
   * ```
   */
  public bindAction(
    action: string,
    keys: string | string[],
    callback: () => void
  ): void {
    const keyArray = Array.isArray(keys) ? keys : [keys];
    this.actions.set(action, { action, keys: keyArray, callback });
  }

  /**
   * Unbind action
   *
   * @param action - Action name
   */
  public unbindAction(action: string): void {
    this.actions.delete(action);
  }

  /**
   * Check if action is triggered
   *
   * @param action - Action name
   * @param key - Current key
   * @returns True if action triggered
   */
  public isActionTriggered(action: string, key: string): boolean {
    const binding = this.actions.get(action);
    if (!binding) return false;

    return binding.keys.includes(key);
  }

  /**
   * Set mouse position (emulated)
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  public setMousePosition(x: number, y: number): void {
    this.mousePosition = { x, y };
  }

  /**
   * Get mouse position
   *
   * @returns Mouse position
   */
  public getMousePosition(): Position {
    return { ...this.mousePosition };
  }

  /**
   * Set mouse button state
   *
   * @param button - Button number (1=left, 2=middle, 3=right)
   * @param pressed - Is pressed?
   */
  public setMouseButton(button: number, pressed: boolean): void {
    if (pressed) {
      this.mouseButtons.add(button);
    } else {
      this.mouseButtons.delete(button);
    }
  }

  /**
   * Check if mouse button is pressed
   *
   * @param button - Button number
   * @returns True if pressed
   */
  public isMouseButtonPressed(button: number): boolean {
    return this.mouseButtons.has(button);
  }

  /**
   * Start input recording
   *
   * @example
   * ```typescript
   * input.startRecording();
   * // ... player plays ...
   * input.stopRecording();
   *
   * const replay = input.getRecording();
   * input.playRecording(replay);
   * ```
   */
  public startRecording(): void {
    this.recording = true;
    this.recordedInputs = [];
  }

  /**
   * Stop input recording
   */
  public stopRecording(): void {
    this.recording = false;
  }

  /**
   * Record input
   *
   * @param key - Key event
   * @private
   */
  public recordInput(key: KeyEvent): void {
    if (this.recording) {
      this.recordedInputs.push({ ...key });
    }
  }

  /**
   * Get recorded inputs
   *
   * @returns Recorded inputs
   */
  public getRecording(): KeyEvent[] {
    return [...this.recordedInputs];
  }

  /**
   * Play recorded inputs
   *
   * @param inputs - Recorded inputs
   * @param callback - Callback for each input
   *
   * @example
   * ```typescript
   * const replay = input.getRecording();
   * input.playRecording(replay, (key) => {
   *   handleInput(key);
   * });
   * ```
   */
  public playRecording(
    inputs: KeyEvent[],
    callback: (key: KeyEvent) => void
  ): void {
    this.playing = true;
    this.playbackIndex = 0;

    const playNext = () => {
      if (!this.playing || this.playbackIndex >= inputs.length) {
        this.playing = false;
        return;
      }

      const key = inputs[this.playbackIndex++];
      callback(key);

      // Continue playback
      setTimeout(playNext, 16); // ~60 FPS
    };

    playNext();
  }

  /**
   * Stop playback
   */
  public stopPlayback(): void {
    this.playing = false;
  }

  /**
   * Clear key history
   */
  public clearHistory(): void {
    this.keyHistory = [];
  }

  /**
   * Clear all mappings and bindings
   */
  public reset(): void {
    this.mappings.clear();
    this.macros.clear();
    this.actions.clear();
    this.keyHistory = [];
    this.mouseButtons.clear();
    this.mousePosition = { x: 0, y: 0 };
  }
}

export default InputEngine;
