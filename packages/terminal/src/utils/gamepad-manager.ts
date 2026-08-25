/**
 * Frontend Gamepad Manager
 *
 * Handles gamepad detection, polling, and event generation using the Gamepad API.
 * Sends gamepad events to backend via WebSocket.
 */

import type {
  GamepadButton,
  GamepadAxis,
  DPadDirection,
  GamepadConfig,
  GamepadState,
  AnyGamepadEvent,
} from './gamepad-types';

import { DEFAULT_GAMEPAD_CONFIG } from './gamepad-types';

interface GamepadManagerOptions {
  onEvent: (event: AnyGamepadEvent) => void;
  config?: Partial<GamepadConfig>;
}

/**
 * Manages gamepad input and generates events
 */
/**
 * Decode a hat-switch axis into D-pad directions.
 *
 * A pad the browser cannot fit to the standard layout reports its D-pad as a
 * single axis holding one of eight positions, spaced 2/7 apart from -1 (up)
 * going clockwise, with anything outside that range meaning "centred". This
 * is the convention Chrome exposes for non-standard HID pads.
 *
 * Returns null when no axis looks like a hat, so a pad with only sticks is
 * left alone.
 */
export function readHatAxis(axes: number[]): { up: boolean; down: boolean; left: boolean; right: boolean } | null {
  // Hats sit at the END of the axis list - axis 9 on the 8BitDo NES30 Pro,
  // whose dump shows `AXIS 9: 3.28571` (centred). Scanning from axis 4
  // instead was wrong on that very pad: its AXIS 4 rests at -1.00000, which
  // decodes as the hat position for UP and would have pinned the D-pad up
  // forever. Only the last two axes are considered.
  for (let i = Math.max(4, axes.length - 2); i < axes.length; i++) {
    const value = axes[i];
    if (typeof value !== 'number') continue;
    // Centred hats sit outside [-1, 1] (commonly 1.28 or 3.28).
    if (value < -1.1 || value > 1.1) continue;

    const direction = hatDirection(value);
    if (direction) return direction;
  }
  return null;
}

/** The eight hat positions, as a fraction of the way round from "up". */
function hatDirection(value: number): { up: boolean; down: boolean; left: boolean; right: boolean } | null {
  // -1 is up; each further step of 2/7 turns 45 degrees clockwise.
  const step = 2 / 7;
  const exact = (value + 1) / step;
  const position = Math.round(exact);
  if (position < 0 || position > 7) return null;

  // The value has to land ON one of the eight positions. Unused axes rest at
  // exactly 0, which is half a step from any real hat position - without this
  // check a pad with a spare axis read as a permanent D-pad DOWN and a menu
  // scrolled forever.
  if (Math.abs(exact - position) > 0.2) return null;

  const up = position === 0 || position === 1 || position === 7;
  const right = position === 1 || position === 2 || position === 3;
  const down = position === 3 || position === 4 || position === 5;
  const left = position === 5 || position === 6 || position === 7;

  return { up, down, left, right };
}

export class GamepadManager {
  private options: GamepadManagerOptions;
  private config: GamepadConfig;
  private pollInterval: number | null = null;
  private previousStates: Map<number, GamepadState> = new Map();
  private dpadStates: Map<number, { horizontal: DPadDirection; vertical: DPadDirection }> = new Map();

  constructor(options: GamepadManagerOptions) {
    this.options = options;
    this.config = { ...DEFAULT_GAMEPAD_CONFIG, ...options.config };
  }

  /**
   * Start gamepad polling
   */
  start(): void {
    console.log('[GamepadManager] Starting gamepad polling...');

    // Listen for gamepad connection events
    window.addEventListener('gamepadconnected', this.handleConnect.bind(this));
    window.addEventListener('gamepaddisconnected', this.handleDisconnect.bind(this));

    // Start polling loop
    this.pollInterval = window.setInterval(() => {
      this.poll();
    }, this.config.pollRate);

    // Initial poll to detect already-connected gamepads
    this.poll();
  }

  /**
   * Stop gamepad polling
   */
  stop(): void {
    console.log('[GamepadManager] Stopping gamepad polling...');

    window.removeEventListener('gamepadconnected', this.handleConnect.bind(this));
    window.removeEventListener('gamepaddisconnected', this.handleDisconnect.bind(this));

    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.previousStates.clear();
    this.dpadStates.clear();
  }

  /**
   * Poll all connected gamepads
   */
  private poll(): void {
    const gamepads = navigator.getGamepads();

    for (let i = 0; i < gamepads.length; i++) {
      const gamepad = gamepads[i];
      if (!gamepad) continue;

      this.pollGamepad(gamepad);
    }
  }

  /**
   * Poll a single gamepad and generate events
   */
  private pollGamepad(gamepad: Gamepad): void {
    const controllerId = gamepad.index;
    const previousState = this.previousStates.get(controllerId);

    // Build current state
    const currentState: GamepadState = {
      connected: gamepad.connected,
      controllerId,
      controllerName: gamepad.id,
      buttons: gamepad.buttons.map(b => b.pressed),
      buttonValues: gamepad.buttons.map(b => b.value),
      axes: [...gamepad.axes],
      timestamp: gamepad.timestamp,
    };

    // If no previous state, initialize and skip event generation
    if (!previousState) {
      this.previousStates.set(controllerId, currentState);
      return;
    }

    // Generate button events
    for (let i = 0; i < gamepad.buttons.length; i++) {
      const pressed = currentState.buttons[i];
      const wasPressed = previousState.buttons[i];
      const value = currentState.buttonValues[i];

      if (pressed !== wasPressed) {
        this.options.onEvent({
          type: 'button',
          controllerId,
          timestamp: Date.now(),
          button: i as GamepadButton,
          pressed,
          value,
        });
      }
    }

    // Generate D-pad events (if enabled)
    if (this.config.enableDPad) {
      this.checkDPad(controllerId, currentState);
    }

    // Generate axis events (if enabled)
    if (this.config.enableAnalogSticks) {
      for (let i = 0; i < gamepad.axes.length; i++) {
        const value = currentState.axes[i];
        const previousValue = previousState.axes[i];

        // Apply deadzone
        const deadzone = this.config.deadzone ?? 0.15;
        const adjustedValue = Math.abs(value) < deadzone ? 0 : value;
        const adjustedPrevious = Math.abs(previousValue) < deadzone ? 0 : previousValue;

        if (adjustedValue !== adjustedPrevious) {
          this.options.onEvent({
            type: 'axis',
            controllerId,
            timestamp: Date.now(),
            axis: i as GamepadAxis,
            value: adjustedValue,
          });
        }
      }
    }

    // Update previous state
    this.previousStates.set(controllerId, currentState);
  }

  /**
   * Check D-pad state and generate events
   */
  private checkDPad(controllerId: number, state: GamepadState): void {
    // D-pad buttons are indices 12-15 in standard mapping
    let up = state.buttons[12] || false;
    let down = state.buttons[13] || false;
    let left = state.buttons[14] || false;
    let right = state.buttons[15] || false;

    // Pads the browser cannot map to the standard layout report their D-pad
    // as a HAT AXIS instead, and then buttons 12-15 do not exist at all - so
    // the D-pad produced no events, could not be bound, and could not drive a
    // menu. Reported with an 8BitDo NES30 Pro over USB (2026-08-25), which
    // works in a pad tester precisely because a tester shows raw axes.
    if (state.buttons.length < 16) {
      const hat = readHatAxis(state.axes);
      if (hat) {
        up = up || hat.up;
        down = down || hat.down;
        left = left || hat.left;
        right = right || hat.right;
      }
    }

    // Determine directions
    const horizontal: DPadDirection = left ? 'left' : right ? 'right' : 'neutral';
    const vertical: DPadDirection = up ? 'up' : down ? 'down' : 'neutral';

    // Get previous D-pad state
    const previousDPad = this.dpadStates.get(controllerId) || {
      horizontal: 'neutral' as DPadDirection,
      vertical: 'neutral' as DPadDirection,
    };

    // Check if D-pad state changed
    if (horizontal !== previousDPad.horizontal || vertical !== previousDPad.vertical) {
      // Determine overall direction
      let direction: DPadDirection = 'neutral';
      if (vertical === 'up' && horizontal === 'neutral') direction = 'up';
      else if (vertical === 'down' && horizontal === 'neutral') direction = 'down';
      else if (horizontal === 'left' && vertical === 'neutral') direction = 'left';
      else if (horizontal === 'right' && vertical === 'neutral') direction = 'right';

      this.options.onEvent({
        type: 'dpad',
        controllerId,
        timestamp: Date.now(),
        direction,
        horizontal,
        vertical,
      });

      this.dpadStates.set(controllerId, { horizontal, vertical });
    }
  }

  /**
   * Handle gamepad connection
   */
  private handleConnect(event: GamepadEvent): void {
    const gamepad = event.gamepad;
    console.log(`[GamepadManager] Gamepad connected: ${gamepad.id} (index: ${gamepad.index})`);

    this.options.onEvent({
      type: 'connected',
      controllerId: gamepad.index,
      timestamp: Date.now(),
      controllerName: gamepad.id,
      buttonCount: gamepad.buttons.length,
      axisCount: gamepad.axes.length,
    });

    // Initialize state
    this.previousStates.set(gamepad.index, {
      connected: true,
      controllerId: gamepad.index,
      controllerName: gamepad.id,
      buttons: gamepad.buttons.map(b => b.pressed),
      buttonValues: gamepad.buttons.map(b => b.value),
      axes: [...gamepad.axes],
      timestamp: gamepad.timestamp,
    });

    this.dpadStates.set(gamepad.index, { horizontal: 'neutral', vertical: 'neutral' });
  }

  /**
   * Handle gamepad disconnection
   */
  private handleDisconnect(event: GamepadEvent): void {
    const gamepad = event.gamepad;
    console.log(`[GamepadManager] Gamepad disconnected: ${gamepad.id} (index: ${gamepad.index})`);

    this.options.onEvent({
      type: 'disconnected',
      controllerId: gamepad.index,
      timestamp: Date.now(),
    });

    this.previousStates.delete(gamepad.index);
    this.dpadStates.delete(gamepad.index);
  }

  /**
   * Get current state of all connected gamepads
   */
  getConnectedGamepads(): GamepadState[] {
    return Array.from(this.previousStates.values());
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GamepadConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
