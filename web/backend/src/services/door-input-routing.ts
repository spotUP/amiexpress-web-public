/**
 * Where a keystroke goes while a door is running.
 *
 * Two transports answered this question in two places, and they did not agree.
 *
 * On WEB, socket.io hands a 'command' to every listener: DoorManager's
 * one-shot prompt (`socket.once('command', ...)`) AND socket-handlers, which
 * then calls the door's own `doorInputHandler`. Both get the keystroke, and
 * doors are written for that.
 *
 * On TELNET there is one dispatcher (index.ts), so it had to CHOOSE - and it
 * chose the 'command' bridge whenever any listener existed, returning before
 * the door's handler was reached. A door with a prompt listener still
 * registered went deaf: it drew perfectly and took no input, which is the
 * shape the sysop reported for game-mode doors over telnet.
 *
 * Telnet also had no BBS-pause intercept, so ENTER on a `doPause` during a
 * ~CC_ door went to the door instead of dismissing the pause, where a browser
 * caller dismissed it.
 *
 * This module is the one answer both transports ask for. It decides, and it
 * returns EVERY destination rather than the first, because "both" is the
 * behaviour web already had and the one doors expect.
 */

/** What should receive this keystroke. Order is delivery order. */
export interface DoorInputRoute {
  /** DoorManager's 'command' listeners - a prompt awaiting an answer. */
  toCommandListeners: boolean;
  /** The door's own input handler, i.e. the running game. */
  toDoorHandler: boolean;
  /** The board: no door is active, or a BBS pause is asking to be dismissed. */
  toBbs: boolean;
  /** Nothing is listening; the caller emits door:input so a client may. */
  toDoorInputEvent: boolean;
}

export interface DoorInputState {
  /** A door is running (inDoorManager, or the DOOR_RUNNING substate). */
  doorActive: boolean;
  /** The door registered an input handler. */
  hasDoorInputHandler: boolean;
  /**
   * A 'command' listener is waiting. On web this is asked of the socket; on
   * telnet, of the connection emitter. Web passes false: socket.io has
   * already delivered to those listeners by the time this is asked.
   */
  hasCommandListener: boolean;
  /** A BBS-owned pause (doPause) is on screen underneath the door. */
  bbsPauseActive: boolean;
}

/**
 * ENTER or SPACE - the keys a pause is dismissed with.
 *
 * A pause takes these and nothing else; every other key belongs to the door,
 * which is still running underneath it.
 */
export function isPauseKey(input: string): boolean {
  if (!input) return false;
  const code = input.charCodeAt(0);
  return input === ' ' || input === '\r' || input === '\n' || code === 13 || code === 10;
}

/** Decide where a keystroke goes. Pure, so both transports can be tested. */
export function routeDoorInput(input: string, state: DoorInputState): DoorInputRoute {
  const route: DoorInputRoute = {
    toCommandListeners: false,
    toDoorHandler: false,
    toBbs: false,
    toDoorInputEvent: false,
  };

  if (!state.doorActive) {
    route.toBbs = true;
    return route;
  }

  // A pause the BOARD put on screen owns its two keys, whatever the door
  // would have done with them.
  if (state.bbsPauseActive && isPauseKey(input)) {
    route.toBbs = true;
    return route;
  }

  // Both, when both are there. A prompt waiting on 'command' and a running
  // door are not alternatives - that is exactly the case telnet used to
  // resolve by dropping the door.
  if (state.hasCommandListener) route.toCommandListeners = true;
  if (state.hasDoorInputHandler) route.toDoorHandler = true;

  if (!route.toCommandListeners && !route.toDoorHandler) {
    route.toDoorInputEvent = true;
  }

  return route;
}
