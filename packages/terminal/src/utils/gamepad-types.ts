/**
 * Gamepad types for browser (inline to avoid SDK import issues)
 */

export enum GamepadButton {
  A = 0, B = 1, X = 2, Y = 3,
  L1 = 4, R1 = 5, L2 = 6, R2 = 7,
  SELECT = 8, START = 9,
  L3 = 10, R3 = 11,
  DPAD_UP = 12, DPAD_DOWN = 13, DPAD_LEFT = 14, DPAD_RIGHT = 15,
  HOME = 16,
}

export enum GamepadAxis {
  LEFT_STICK_X = 0,
  LEFT_STICK_Y = 1,
  RIGHT_STICK_X = 2,
  RIGHT_STICK_Y = 3,
}

export type GamepadEventType = 'connected' | 'disconnected' | 'button' | 'axis' | 'dpad';
export type DPadDirection = 'up' | 'down' | 'left' | 'right' | 'neutral';

export interface GamepadEvent {
  type: GamepadEventType;
  controllerId: number;
  timestamp: number;
}

export interface GamepadConnectedEvent extends GamepadEvent {
  type: 'connected';
  controllerName: string;
  buttonCount: number;
  axisCount: number;
}

export interface GamepadDisconnectedEvent extends GamepadEvent {
  type: 'disconnected';
}

export interface GamepadButtonEvent extends GamepadEvent {
  type: 'button';
  button: GamepadButton;
  pressed: boolean;
  value: number;
}

export interface GamepadAxisEvent extends GamepadEvent {
  type: 'axis';
  axis: GamepadAxis;
  value: number;
}

export interface GamepadDPadEvent extends GamepadEvent {
  type: 'dpad';
  direction: DPadDirection;
  horizontal: DPadDirection;
  vertical: DPadDirection;
}

export type AnyGamepadEvent =
  | GamepadConnectedEvent
  | GamepadDisconnectedEvent
  | GamepadButtonEvent
  | GamepadAxisEvent
  | GamepadDPadEvent;

export interface GamepadState {
  connected: boolean;
  controllerId: number;
  controllerName: string;
  buttons: boolean[];
  buttonValues: number[];
  axes: number[];
  timestamp: number;
}

export interface GamepadConfig {
  deadzone?: number;
  pollRate?: number;
  enableDPad?: boolean;
  enableAnalogSticks?: boolean;
  enableTriggers?: boolean;
  buttonMapping?: Partial<Record<GamepadButton, string>>;
  axisMapping?: Partial<Record<GamepadAxis, string>>;
}

export const DEFAULT_GAMEPAD_CONFIG: GamepadConfig = {
  deadzone: 0.15,
  pollRate: 16,
  enableDPad: true,
  enableAnalogSticks: true,
  enableTriggers: true,
  buttonMapping: {},
  axisMapping: {},
};
