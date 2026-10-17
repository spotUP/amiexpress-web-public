/**
 * The command palette over a running door (Ctrl+K anywhere on the board).
 *
 * At the board prompt Ctrl+K runs the menu door's PALETTE registration
 * (command.handler.ts). Inside a door the key used to reach the door, so a
 * caller in J (a 68K door) had no palette at all. Here the palette runs OVER
 * the door instead:
 *
 *  - the door is held still (session.doorHold: no CPU, no input, no time)
 *    and the caller's whole screen is held (screen-model holdWholeScreen);
 *  - the palette is the same PALETTE run the prompt makes (runBbsCommand),
 *    but as a SHADOW: a session and a socket layered over the real ones, so
 *    every listener the palette's door installs, and every field it writes,
 *    stays on the shadow and the paused door's are untouched;
 *  - when the palette's run ends (Esc, or a pick in phase 1) the held screen
 *    is repainted whole and the door resumes where it was.
 *
 * Every key the caller types while the palette is open goes to the palette
 * (door-input-routing.ts `toPalette`).
 *
 * Phase 1: a pick closes the palette as Esc does. What was picked is kept
 * (`lastPaletteExit`) for phase 2, which ends the door and runs it.
 */
import { EventEmitter } from 'events';
import { holdWholeScreen, takeHeldScreen } from './screen-model/screen-model';
import type { MenuExit } from '../handlers/commands/menu-door-exit';
import type { BBSSession } from '../index';

/** The socket surface the shadow needs from the real one. */
export interface PaletteSocket {
  id: string;
  emit: (event: string, ...args: unknown[]) => unknown;
  on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => unknown;
}

/** The palette layers its shadow over the caller's own session. */
type PaletteSession = BBSSession;

interface PaletteRun {
  shadowSession: PaletteSession;
  shadowSocket: PaletteSocket;
  exit: MenuExit | null;
}

const runs = new WeakMap<object, PaletteRun>();
const shadows = new WeakSet<object>();
const lastExits = new WeakMap<object, MenuExit>();
/** Shadow session -> the caller's real session it was layered over. */
const ownerOf = new WeakMap<object, object>();

/*
 * Events the shadow does not pass to the caller. The palette's door run ends
 * with door-active false and game mode off; the caller's door is still
 * running underneath, so the client must keep believing that.
 */
const HELD_FROM_CLIENT = new Set(['door-active', 'game-mode', 'key-repeat-mode']);

/** Listener methods the shadow keeps for itself (socket.io's would write the real socket's table). */
const LISTENER_METHODS = [
  'on', 'once', 'off', 'addListener', 'prependListener', 'prependOnceListener',
  'removeListener', 'removeAllListeners', 'listeners', 'listenerCount', 'rawListeners',
] as const;

/** Does the board have a palette to open? (the same check the prompt's Ctrl+K makes) */
export function paletteInstalled(): boolean {
  // Lazy: command-execution.handler imports the door runner, which imports this.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { commandCache } = require('../handlers/command-execution.handler');
  return Boolean(commandCache?.bbscmd?.get('PALETTE'));
}

/** Is the palette open over this (real) session's door? */
export function isPaletteOpen(session: object): boolean {
  return runs.has(session);
}

/** Is this session the palette's shadow (not a caller's own session)? */
export function isPaletteShadow(session: object): boolean {
  return shadows.has(session);
}

/** The palette's shadow run ended: keep what was picked (phase 2 runs it). */
export function notePaletteExit(shadowSession: object, exit: MenuExit): void {
  const owner = ownerOf.get(shadowSession);
  const run = owner ? runs.get(owner) : undefined;
  if (run) run.exit = exit;
}

/** What the last palette over this session's door was closed with (phase 2 runs it). */
export function lastPaletteExit(session: object): MenuExit | undefined {
  return lastExits.get(session);
}

function shadowSocketOver(real: PaletteSocket): PaletteSocket {
  const shadow = Object.create(real) as PaletteSocket & Record<string, unknown>;
  const events = new EventEmitter();
  events.setMaxListeners(0);
  for (const name of LISTENER_METHODS) {
    const method = (events as unknown as Record<string, (...args: unknown[]) => unknown>)[name];
    shadow[name] = (...args: unknown[]) => {
      const out = method.apply(events, args);
      return out === events ? shadow : out;
    };
  }
  shadow.emit = (event: string, ...args: unknown[]) => {
    if (HELD_FROM_CLIENT.has(event)) return true;
    return real.emit(event, ...args);
  };
  return shadow;
}

/**
 * Ctrl+K inside a door: hold the door and the screen, run the palette over
 * them. Idempotent - a second Ctrl+K while it is open is the palette's key.
 */
export function openPaletteOverDoor(socket: PaletteSocket, session: PaletteSession): void {
  if (runs.has(session)) return;

  holdWholeScreen(socket.id);
  const hold = session.doorHold;
  hold?.pause();

  // What the door owns on the real session, put back on close whatever the
  // palette's run did through a path that reached the real session.
  const saved = {
    inDoorManager: session.inDoorManager,
    doorInputHandler: session.doorInputHandler,
    doorHold: session.doorHold,
    subState: session.subState,
  };

  const shadowSession = Object.create(session) as PaletteSession;
  shadowSession.inDoorManager = false;
  shadowSession.doorInputHandler = undefined;
  shadowSession.doorHold = undefined;
  shadowSession.inputBuffer = '';
  const shadowSocket = shadowSocketOver(socket);

  // The caller hanging up ends the palette's door too.
  const onDisconnect = (...args: unknown[]) => { (shadowSocket as unknown as EventEmitter).emit('disconnect', ...args); };
  socket.on?.('disconnect', onDisconnect);

  const run: PaletteRun = { shadowSession, shadowSocket, exit: null };
  runs.set(session, run);
  shadows.add(shadowSession);
  ownerOf.set(shadowSession, session);

  const close = () => {
    socket.removeListener?.('disconnect', onDisconnect);
    runs.delete(session);
    if (run.exit) lastExits.set(session, run.exit);
    session.inDoorManager = saved.inDoorManager;
    session.doorInputHandler = saved.doorInputHandler;
    session.doorHold = saved.doorHold;
    session.subState = saved.subState;
    const repaint = takeHeldScreen(socket.id);
    if (repaint) socket.emit('ansi-output', repaint);
    hold?.resume();
  };

  // Lazy for the same import cycle as paletteInstalled().
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { runBbsCommand } = require('../handlers/command-execution.handler');
  Promise.resolve()
    .then(() => runBbsCommand(shadowSocket, shadowSession, 'PALETTE', ''))
    .catch((err: unknown) => console.error('[palette-over-door] palette run failed:', err))
    .finally(close);
}

/** A key the caller typed while the palette is open: it is the palette's. */
export function deliverToPalette(session: object, data: string): void {
  const run = runs.get(session);
  run?.shadowSession.doorInputHandler?.(data);
}
