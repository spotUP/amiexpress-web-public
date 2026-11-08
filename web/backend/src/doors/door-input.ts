/**
 * Game-mode key state, key callbacks and the hotkey prompt a door uses through BBSApi, and the modem-speed switch.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import type { Socket } from 'socket.io';

import type { BBSSession } from '../index';
import { bindToDoorContext } from './door-effects-context';

/**
 * Check if a key is currently pressed (game mode only)
 * @param key Key to check (e.g., 'ArrowLeft', 'a', 'space')
 */
export function doorIsKeyPressed(session: BBSSession, key: string): boolean {
  return session.keyState?.[key] === true;
}

/**
 * Get all currently pressed keys (game mode only)
 */
export function doorGetPressedKeys(session: BBSSession): string[] {
  if (!session.keyState) return [];
  return Object.keys(session.keyState).filter(k => session.keyState![k]);
}

/**
 * Register callback for keydown events (game mode only)
 * Callback receives key name and full keyState object
 */
export function doorOnKeyDown(session: BBSSession, 
  callback: (key: string, keyState: Record<string, boolean>, repeat: boolean) => void,
): void {
  const handler = (data: {
    key: string;
    pressed: boolean;
    keyState: Record<string, boolean>;
    repeat?: boolean;
  }) => {
    if (data.pressed) {
      // Third argument, so every existing two-argument callback is
      // untouched: a door that does not care about repeats never sees one.
      callback(data.key, data.keyState, data.repeat === true);
    }
  };
  session.doorKeyStateHandler = handler;
}

/**
 * Register callback for keyup events (game mode only)
 * Callback receives key name and full keyState object
 */
export function doorOnKeyUp(session: BBSSession, callback: (key: string, keyState: Record<string, boolean>) => void): void {
  const existingHandler = session.doorKeyStateHandler;
  const newHandler = (data: {
    key: string;
    pressed: boolean;
    keyState: Record<string, boolean>;
    repeat?: boolean;
  }) => {
    if (!data.pressed) {
      callback(data.key, data.keyState);
    }
    // Call existing handler if present (for onKeyDown)
    if (existingHandler && data.pressed) {
      existingHandler(data);
    }
  };
  session.doorKeyStateHandler = newHandler;
}

/**
 * Register callback for all key events (both down and up)
 * More efficient than separate onKeyDown/onKeyUp calls
 */
export function doorOnKeyEvent(session: BBSSession, 
  callback: (
    key: string,
    pressed: boolean,
    keyState: Record<string, boolean>,
    repeat: boolean,
  ) => void,
): void {
  session.doorKeyStateHandler = (data: {
    key: string;
    pressed: boolean;
    keyState: Record<string, boolean>;
    repeat?: boolean;
  }) => {
    callback(data.key, data.pressed, data.keyState, data.repeat === true);
  };
}

/**
 * Display menu and get hotkey choice
 * Returns the key pressed (uppercase)
 */
export async function doorHotkey(socket: Socket, session: BBSSession, options: string[], prompt?: string): Promise<string> {
  if (prompt) {
    socket.emit('ansi-output', prompt);
  }

  return new Promise<string>((resolve) => {
    const handler = (input: string) => {
      delete session.doorInputHandler;
      const key = input.charAt(0).toUpperCase();
      resolve(key);
    };

    // Input fires in socket.io's context; carry the door's (effect gate).
    session.doorInputHandler = bindToDoorContext(handler);
  });
}

/**
 * Set modem emulation speed
 * @param bps Baud rate (e.g., 2400, 9600, 14400). Use 0 to disable emulation (full speed)
 */
export function doorSetModemSpeed(socket: Socket, session: BBSSession, bps: number): void {
  (session as any).modemSpeed = bps;

  // Update backend modem emulator (the one that wraps socket.emit)
  const { getModemEmulator } = require('../utils/modem-emulator.util');
  const modemEmulator = getModemEmulator(socket);
  if (bps > 0) {
    modemEmulator.enable(bps);
  } else {
    modemEmulator.disable();
  }

  // Notify frontend modem emulator as well
  socket.emit('modem-speed', bps);
}
