/**
 * Gamepad Input Manager for Doors
 *
 * Provides an easy-to-use API for doors to handle gamepad input.
 * Automatically handles button mapping, D-pad, and analog sticks.
 */

import { EventEmitter } from 'events';
import type {
  AnyGamepadEvent,
  GamepadButton,
  GamepadAxis,
  GamepadButtonEvent,
  GamepadAxisEvent,
  GamepadDPadEvent,
  GamepadConnectedEvent,
  GamepadDisconnectedEvent,
  DPadDirection,
  GamepadConfig,
} from '../types/gamepad';
import { DEFAULT_GAMEPAD_CONFIG } from '../types/gamepad';

/**
 * Gamepad Input Manager
 *
 * Usage:
 * ```typescript
 * const gamepad = new GamepadInputManager(session);
 *
 * gamepad.on('button', (button, pressed, controllerId) => {
 *   if (button === GamepadButton.A && pressed) {
 *     console.log('A button pressed!');
 *   }
 * });
 *
 * gamepad.on('dpad', (direction, controllerId) => {
 *   console.log(`D-pad: ${direction}`);
 * });
 * ```
 */
export class GamepadInputManager extends EventEmitter {
  private bbsSession: any;  // DoorSession
  private config: GamepadConfig;
  private connectedControllers: Set<number> = new Set();
  private buttonStates: Map<number, Map<GamepadButton, boolean>> = new Map();
  private axisValues: Map<number, Map<GamepadAxis, number>> = new Map();

  constructor(bbsSession: any, config?: Partial<GamepadConfig>) {
    super();
    this.bbsSession = bbsSession;
    this.config = { ...DEFAULT_GAMEPAD_CONFIG, ...config };

    // Register on bbsSession.gamepadHandler — the socket handler routes gamepad-event
    // events from the browser to this callback. Client-side browser doors pass
    // null/undefined for bbsSession and get events directly from the browser instead.
    if (this.bbsSession) {
      this.bbsSession.gamepadHandler = this.handleGamepadEvent.bind(this);
    }
  }

  /**
   * Handle incoming gamepad event from backend
   */
  private handleGamepadEvent(event: AnyGamepadEvent): void {
    switch (event.type) {
      case 'connected':
        this.handleConnected(event);
        break;
      case 'disconnected':
        this.handleDisconnected(event);
        break;
      case 'button':
        this.handleButton(event);
        break;
      case 'axis':
        this.handleAxis(event);
        break;
      case 'dpad':
        this.handleDPad(event);
        break;
    }
  }

  /**
   * Handle controller connection
   */
  private handleConnected(event: GamepadConnectedEvent): void {
    this.connectedControllers.add(event.controllerId);
    this.buttonStates.set(event.controllerId, new Map());
    this.axisValues.set(event.controllerId, new Map());

    /**
     * Emitted when a controller is connected
     * @event connected
     * @param {number} controllerId - Controller ID (0-3)
     * @param {string} controllerName - Controller name/model
     */
    this.emit('connected', event.controllerId, event.controllerName);
  }

  /**
   * Handle controller disconnection
   */
  private handleDisconnected(event: GamepadDisconnectedEvent): void {
    this.connectedControllers.delete(event.controllerId);
    this.buttonStates.delete(event.controllerId);
    this.axisValues.delete(event.controllerId);

    /**
     * Emitted when a controller is disconnected
     * @event disconnected
     * @param {number} controllerId - Controller ID (0-3)
     */
    this.emit('disconnected', event.controllerId);
  }

  /**
   * Handle button press/release
   */
  private handleButton(event: GamepadButtonEvent): void {
    let states = this.buttonStates.get(event.controllerId);
    if (!states) {
      // Controller was already connected before this GIM was created — auto-initialize
      console.log(`[GIM] auto-init controller ${event.controllerId} on first button event`);
      states = new Map();
      this.buttonStates.set(event.controllerId, states);
      this.connectedControllers.add(event.controllerId);
      if (!this.axisValues.has(event.controllerId)) {
        this.axisValues.set(event.controllerId, new Map());
      }
    }

    states.set(event.button, event.pressed);

    /**
     * Emitted when a button is pressed or released
     * @event button
     * @param {GamepadButton} button - Button index
     * @param {boolean} pressed - true if pressed, false if released
     * @param {number} value - Analog value (0-1) for triggers
     * @param {number} controllerId - Controller ID (0-3)
     */
    this.emit('button', event.button, event.pressed, event.value, event.controllerId);

    // Emit specific button events (e.g., 'button:a', 'button:start')
    const buttonName = this.getButtonName(event.button);
    console.log(`[GIM] handleButton btn=${event.button} name=${buttonName} pressed=${event.pressed}`);
    if (buttonName) {
      /**
       * Emitted for specific button (e.g., 'button:a', 'button:start')
       * @event button:*
       * @param {boolean} pressed - true if pressed, false if released
       * @param {number} value - Analog value (0-1)
       * @param {number} controllerId - Controller ID (0-3)
       */
      this.emit(`button:${buttonName}`, event.pressed, event.value, event.controllerId);
    }
  }

  /**
   * Handle analog stick movement
   */
  private handleAxis(event: GamepadAxisEvent): void {
    let axes = this.axisValues.get(event.controllerId);
    if (!axes) {
      // Controller was already connected before this GIM was created — auto-initialize
      axes = new Map();
      this.axisValues.set(event.controllerId, axes);
      this.connectedControllers.add(event.controllerId);
      if (!this.buttonStates.has(event.controllerId)) {
        this.buttonStates.set(event.controllerId, new Map());
      }
    }

    axes.set(event.axis, event.value);

    /**
     * Emitted when an analog stick moves
     * @event axis
     * @param {GamepadAxis} axis - Axis index
     * @param {number} value - Axis value (-1 to 1)
     * @param {number} controllerId - Controller ID (0-3)
     */
    this.emit('axis', event.axis, event.value, event.controllerId);

    // Emit specific axis events (e.g., 'axis:left-x', 'axis:right-y')
    const axisName = this.getAxisName(event.axis);
    if (axisName) {
      /**
       * Emitted for specific axis (e.g., 'axis:left-x')
       * @event axis:*
       * @param {number} value - Axis value (-1 to 1)
       * @param {number} controllerId - Controller ID (0-3)
       */
      this.emit(`axis:${axisName}`, event.value, event.controllerId);
    }
  }

  /**
   * Handle D-pad direction change
   */
  private handleDPad(event: GamepadDPadEvent): void {
    /**
     * Emitted when D-pad direction changes
     * @event dpad
     * @param {DPadDirection} direction - Overall direction
     * @param {DPadDirection} horizontal - Horizontal component
     * @param {DPadDirection} vertical - Vertical component
     * @param {number} controllerId - Controller ID (0-3)
     */
    this.emit('dpad', event.direction, event.horizontal, event.vertical, event.controllerId);

    // Emit specific direction events (e.g., 'dpad:up', 'dpad:left')
    if (event.direction !== 'neutral') {
      /**
       * Emitted for specific D-pad direction (e.g., 'dpad:up')
       * @event dpad:*
       * @param {number} controllerId - Controller ID (0-3)
       */
      this.emit(`dpad:${event.direction}`, event.controllerId);
    }
  }

  /**
   * Check if a button is currently pressed
   */
  isButtonPressed(button: GamepadButton, controllerId: number = 0): boolean {
    const states = this.buttonStates.get(controllerId);
    return states?.get(button) || false;
  }

  /**
   * Get current value of an axis
   */
  getAxisValue(axis: GamepadAxis, controllerId: number = 0): number {
    const axes = this.axisValues.get(controllerId);
    return axes?.get(axis) || 0;
  }

  /**
   * Check if a controller is connected
   */
  isConnected(controllerId: number = 0): boolean {
    return this.connectedControllers.has(controllerId);
  }

  /**
   * Get list of connected controller IDs
   */
  getConnectedControllers(): number[] {
    return Array.from(this.connectedControllers);
  }

  /**
   * Get human-readable button name
   */
  private getButtonName(button: GamepadButton): string | null {
    const names: Record<number, string> = {
      0: 'a', 1: 'b', 2: 'x', 3: 'y',
      4: 'l1', 5: 'r1', 6: 'l2', 7: 'r2',
      8: 'select', 9: 'start',
      10: 'l3', 11: 'r3',
      12: 'dpad-up', 13: 'dpad-down', 14: 'dpad-left', 15: 'dpad-right',
      16: 'home',
    };
    return names[button] || null;
  }

  /**
   * Get human-readable axis name
   */
  private getAxisName(axis: GamepadAxis): string | null {
    const names: Record<number, string> = {
      0: 'left-x', 1: 'left-y',
      2: 'right-x', 3: 'right-y',
    };
    return names[axis] || null;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GamepadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.bbsSession?.gamepadHandler) {
      this.bbsSession.gamepadHandler = undefined;
    }
    this.removeAllListeners();
    this.connectedControllers.clear();
    this.buttonStates.clear();
    this.axisValues.clear();
  }
}
