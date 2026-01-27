/**
 * Gamepad Support Types
 *
 * Provides comprehensive gamepad/controller support for BBS doors.
 * Uses the standard Gamepad API mapping for compatibility.
 */
/**
 * Standard gamepad button indices (matching Gamepad API standard mapping)
 */
export declare enum GamepadButton {
    A = 0,// Bottom button (Xbox: A, PS: Cross)
    B = 1,// Right button (Xbox: B, PS: Circle)
    X = 2,// Left button (Xbox: X, PS: Square)
    Y = 3,// Top button (Xbox: Y, PS: Triangle)
    L1 = 4,// Left shoulder
    R1 = 5,// Right shoulder
    L2 = 6,// Left trigger
    R2 = 7,// Right trigger
    SELECT = 8,// Select/Back/Share
    START = 9,// Start/Options
    L3 = 10,// Left stick press
    R3 = 11,// Right stick press
    DPAD_UP = 12,
    DPAD_DOWN = 13,
    DPAD_LEFT = 14,
    DPAD_RIGHT = 15,
    HOME = 16
}
/**
 * Standard gamepad axis indices
 */
export declare enum GamepadAxis {
    LEFT_STICK_X = 0,// Left stick horizontal (-1 left, +1 right)
    LEFT_STICK_Y = 1,// Left stick vertical (-1 up, +1 down)
    RIGHT_STICK_X = 2,// Right stick horizontal
    RIGHT_STICK_Y = 3
}
/**
 * Gamepad event types
 */
export type GamepadEventType = 'connected' | 'disconnected' | 'button' | 'axis' | 'dpad';
/**
 * Direction for D-pad events
 */
export type DPadDirection = 'up' | 'down' | 'left' | 'right' | 'neutral';
/**
 * Base gamepad event
 */
export interface GamepadEvent {
    type: GamepadEventType;
    controllerId: number;
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
    pressed: boolean;
    value: number;
}
/**
 * Analog stick movement event
 */
export interface GamepadAxisEvent extends GamepadEvent {
    type: 'axis';
    axis: GamepadAxis;
    value: number;
}
/**
 * D-pad direction change event
 */
export interface GamepadDPadEvent extends GamepadEvent {
    type: 'dpad';
    direction: DPadDirection;
    horizontal: DPadDirection;
    vertical: DPadDirection;
}
/**
 * Union type for all gamepad events
 */
export type AnyGamepadEvent = GamepadConnectedEvent | GamepadDisconnectedEvent | GamepadButtonEvent | GamepadAxisEvent | GamepadDPadEvent;
/**
 * Gamepad state snapshot
 */
export interface GamepadState {
    connected: boolean;
    controllerId: number;
    controllerName: string;
    buttons: boolean[];
    buttonValues: number[];
    axes: number[];
    timestamp: number;
}
/**
 * Gamepad configuration options
 */
export interface GamepadConfig {
    deadzone?: number;
    pollRate?: number;
    enableDPad?: boolean;
    enableAnalogSticks?: boolean;
    enableTriggers?: boolean;
    buttonMapping?: Partial<Record<GamepadButton, string>>;
    axisMapping?: Partial<Record<GamepadAxis, string>>;
}
/**
 * Default gamepad configuration
 */
export declare const DEFAULT_GAMEPAD_CONFIG: GamepadConfig;
//# sourceMappingURL=gamepad.d.ts.map