/**
 * Gamepad Support Types
 *
 * Provides comprehensive gamepad/controller support for BBS doors.
 * Uses the standard Gamepad API mapping for compatibility.
 */

/**
 * Standard gamepad button indices (matching Gamepad API standard mapping)
 */
export enum GamepadButton {
  // Face buttons (right cluster)
  A = 0,           // Bottom button (Xbox: A, PS: Cross)
  B = 1,           // Right button (Xbox: B, PS: Circle)
  X = 2,           // Left button (Xbox: X, PS: Square)
  Y = 3,           // Top button (Xbox: Y, PS: Triangle)

  // Shoulder buttons
  L1 = 4,          // Left shoulder
  R1 = 5,          // Right shoulder
  L2 = 6,          // Left trigger
  R2 = 7,          // Right trigger

  // Center buttons
  SELECT = 8,      // Select/Back/Share
  START = 9,       // Start/Options

  // Stick buttons
  L3 = 10,         // Left stick press
  R3 = 11,         // Right stick press

  // D-pad
  DPAD_UP = 12,
  DPAD_DOWN = 13,
  DPAD_LEFT = 14,
  DPAD_RIGHT = 15,

  // Special
  HOME = 16,       // Home/Guide/PS button
}

/**
 * Standard gamepad axis indices
 */
export enum GamepadAxis {
  LEFT_STICK_X = 0,   // Left stick horizontal (-1 left, +1 right)
  LEFT_STICK_Y = 1,   // Left stick vertical (-1 up, +1 down)
  RIGHT_STICK_X = 2,  // Right stick horizontal
  RIGHT_STICK_Y = 3,  // Right stick vertical
}

/**
 * Gamepad event types
 */
export type GamepadEventType =
  | 'connected'      // Controller connected
  | 'disconnected'   // Controller disconnected
  | 'button'         // Button press/release
  | 'axis'           // Analog stick movement
  | 'dpad';          // D-pad direction change

/**
 * Direction for D-pad events
 */
export type DPadDirection = 'up' | 'down' | 'left' | 'right' | 'neutral';

/**
 * Base gamepad event
 */
export interface GamepadEvent {
  type: GamepadEventType;
  controllerId: number;  // 0-3 for player 1-4
  timestamp: number;
}

/**
 * Controller connected event
 */
export interface GamepadConnectedEvent extends GamepadEvent {
  type: 'connected';
  controllerName: string;
  buttonCount: number;
  axisCount: number;
}

/**
 * Controller disconnected event
 */
export interface GamepadDisconnectedEvent extends GamepadEvent {
  type: 'disconnected';
}

/**
 * Button press/release event
 */
export interface GamepadButtonEvent extends GamepadEvent {
  type: 'button';
  button: GamepadButton;
  pressed: boolean;   // true = pressed, false = released
  value: number;      // 0.0 to 1.0 (analog triggers)
}

/**
 * Analog stick movement event
 */
export interface GamepadAxisEvent extends GamepadEvent {
  type: 'axis';
  axis: GamepadAxis;
  value: number;      // -1.0 to 1.0
}

/**
 * D-pad direction change event
 */
export interface GamepadDPadEvent extends GamepadEvent {
  type: 'dpad';
  direction: DPadDirection;
  horizontal: DPadDirection;  // left/right/neutral
  vertical: DPadDirection;    // up/down/neutral
}

/**
 * Union type for all gamepad events
 */
export type AnyGamepadEvent =
  | GamepadConnectedEvent
  | GamepadDisconnectedEvent
  | GamepadButtonEvent
  | GamepadAxisEvent
  | GamepadDPadEvent;

/**
 * Gamepad state snapshot
 */
export interface GamepadState {
  connected: boolean;
  controllerId: number;
  controllerName: string;
  buttons: boolean[];      // Button pressed states
  buttonValues: number[];  // Button analog values (0-1)
  axes: number[];          // Axis values (-1 to 1)
  timestamp: number;
}

/**
 * Gamepad configuration options
 */
export interface GamepadConfig {
  // Deadzone for analog sticks (0.0 to 1.0)
  deadzone?: number;

  // Poll rate in milliseconds
  pollRate?: number;

  // Enable specific features
  enableDPad?: boolean;
  enableAnalogSticks?: boolean;
  enableTriggers?: boolean;

  // Button mapping (custom button -> action)
  buttonMapping?: Partial<Record<GamepadButton, string>>;

  // Axis mapping (custom axis -> action)
  axisMapping?: Partial<Record<GamepadAxis, string>>;
}

/**
 * Default gamepad configuration
 */
export const DEFAULT_GAMEPAD_CONFIG: GamepadConfig = {
  deadzone: 0.15,
  pollRate: 16,  // ~60fps
  enableDPad: true,
  enableAnalogSticks: true,
  enableTriggers: true,
  buttonMapping: {},
  axisMapping: {},
};
