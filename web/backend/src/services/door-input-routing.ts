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
  /**
   * The adapter's WINDOW should move, and nobody else sees this key.
   *
   * Only a door that declared `C64_VIEWPORT` reaches this: its frame is a
   * positioned UI the 40-column fold cannot save, so the caller is shown a
   * window on it and the cursor keys move the window. Everywhere else a
   * cursor key belongs to the door and is left alone.
   */
  pan: PanDirection | null;
}

/** Which way the window moves. */
export type PanDirection = 'left' | 'right' | 'home';

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
  /**
   * This door's frames are shown through the adapter's WINDOW (C64_VIEWPORT),
   * so the cursor keys pan it instead of reaching the door.
   */
  viewportPan?: boolean;
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

/**
 * The C64's own cursor keys, and HOME.
 *
 * PETSCII, not ANSI: these arrive as single bytes from a C64 terminal
 * ($1D right, $9D left, $13 HOME). The ANSI arrow sequences are accepted too,
 * because a 40-column session can be an ANSI terminal that simply asked for
 * forty columns.
 */
export function panKeyOf(input: string): PanDirection | null {
  if (!input) return null;
  if (input === '\x1b[C' || input === '\x1bOC') return 'right';
  if (input === '\x1b[D' || input === '\x1bOD') return 'left';
  if (input === '\x1b[H' || input === '\x1bOH') return 'home';
  const code = input.charCodeAt(0);
  if (input.length !== 1) return null;
  if (code === 0x1d) return 'right';
  if (code === 0x9d) return 'left';
  if (code === 0x13) return 'home';
  return null;
}

/** Decide where a keystroke goes. Pure, so both transports can be tested. */
export function routeDoorInput(input: string, state: DoorInputState): DoorInputRoute {
  const route: DoorInputRoute = {
    toCommandListeners: false,
    toDoorHandler: false,
    toBbs: false,
    toDoorInputEvent: false,
    pan: null,
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

  /*
   * A WINDOWED door's cursor keys move the window, and reach nothing else.
   *
   * This is the only place a key is taken from a running door, and it is
   * earned: the door declared C64_VIEWPORT, which says its screen cannot be
   * folded to forty columns, so half of what it draws is off the caller's
   * screen until they pan. A door that can be folded never gets here.
   */
  if (state.viewportPan) {
    const pan = panKeyOf(input);
    if (pan) {
      route.pan = pan;
      return route;
    }
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
