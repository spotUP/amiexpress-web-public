/**
 * DOOR CURSOR GATE - hide the cursor while a 68K door draws, show it while
 * the door waits for the caller.
 *
 * A door that repaints on a timer (rTW's WHO table, once a second) parks the
 * cursor wherever its last relative move left it - rTW leaves it on row 3
 * with ESC[7A between redraws. The bytes are right and a real Amiga console
 * shows the same thing; the sysop's decision (2026-10-19) is that the board
 * hides it while the door draws.
 *
 * One gate per door run, installed on the session socket's `emit` by
 * AmigaDoorSession, so every protocol's output (XIM, TIM, FIM, DreamDoor,
 * the board's own MCI / file display during a door) passes through it:
 *
 *   - `ansi-output` while the cursor is shown and the door is NOT parked on
 *     the caller gets ESC[?25l in front of it, once - not per byte.
 *   - A blocking read (line input, hotkey, extended hotkey, pause) calls
 *     `doorInputWait(socket)`, which sends ESC[?25h once. Echo of typed
 *     characters arrives while the read is still parked, so it does not hide
 *     the cursor again; the next output after the read returns does.
 *   - Non-blocking key polls (JH_CK, JH_FetchKey, QUICK_KEY) are not waits:
 *     a door that polls between timed redraws keeps its cursor hidden.
 *   - A door that manages the cursor itself (CON_CURSOR, or ?25l / ?25h in
 *     its own output) takes over: the gate stops toggling for the rest of
 *     the run and only records the state it left.
 *   - Uninstall (door exit) shows the cursor if it is hidden, so the board's
 *     prompt always comes back with one.
 */
import type { Socket } from 'socket.io';

export const HIDE_CURSOR = '\x1b[?25l';
export const SHOW_CURSOR = '\x1b[?25h';

const CURSOR_TOGGLE = /\x1b\[\?25([hl])/g;

type Emit = (event: string, ...args: unknown[]) => boolean;

const gates = new WeakMap<object, DoorCursorGate>();

export class DoorCursorGate {
  private hidden = false;
  private doorManaged = false;
  private readonly innerEmit: Emit;
  private readonly gatedEmit: Emit;

  constructor(
    private readonly socket: Socket,
    /** True while the door is parked on the caller (a blocking read). */
    private readonly isWaitingForCaller: () => boolean
  ) {
    const target = socket as unknown as { emit: Emit };
    this.innerEmit = target.emit;
    this.gatedEmit = (event: string, ...args: unknown[]): boolean => {
      if (event === 'ansi-output' && typeof args[0] === 'string' && args[0].length > 0) {
        args[0] = this.filter(args[0]);
      }
      return this.innerEmit.call(socket, event, ...args);
    };
  }

  install(): void {
    (this.socket as unknown as { emit: Emit }).emit = this.gatedEmit;
    gates.set(this.socket, this);
  }

  /** Door exit: give the board its cursor back and unwrap. */
  uninstall(): void {
    if (gates.get(this.socket) === this) gates.delete(this.socket);
    const target = this.socket as unknown as { emit: Emit };
    if (target.emit === this.gatedEmit) target.emit = this.innerEmit;
    if (this.hidden) {
      this.hidden = false;
      this.innerEmit.call(this.socket, 'ansi-output', SHOW_CURSOR);
    }
  }

  /** The door has started a blocking read: the caller needs the cursor. */
  inputWait(): void {
    if (this.doorManaged || !this.hidden) return;
    this.hidden = false;
    this.innerEmit.call(this.socket, 'ansi-output', SHOW_CURSOR);
  }

  /** CON_CURSOR: the door turns its console cursor on or off itself. */
  doorCursor(on: boolean): void {
    this.doorManaged = true;
    this.hidden = !on;
    this.innerEmit.call(this.socket, 'ansi-output', on ? SHOW_CURSOR : HIDE_CURSOR);
  }

  private filter(text: string): string {
    let last: string | null = null;
    CURSOR_TOGGLE.lastIndex = 0;
    for (let m = CURSOR_TOGGLE.exec(text); m; m = CURSOR_TOGGLE.exec(text)) last = m[1];
    if (last !== null) {
      this.doorManaged = true;
      this.hidden = last === 'l';
      return text;
    }
    if (this.doorManaged || this.hidden || this.isWaitingForCaller()) return text;
    this.hidden = true;
    return HIDE_CURSOR + text;
  }
}

/** Called from every blocking door read; a no-op when no gate is installed. */
export function doorInputWait(socket: unknown): void {
  if (socket && typeof socket === 'object') gates.get(socket)?.inputWait();
}

/**
 * CON_CURSOR from the door. Returns false when no gate is installed, so the
 * caller emits the toggle itself.
 */
export function doorCursorToggle(socket: unknown, on: boolean): boolean {
  const gate = socket && typeof socket === 'object' ? gates.get(socket) : undefined;
  if (!gate) return false;
  gate.doorCursor(on);
  return true;
}
