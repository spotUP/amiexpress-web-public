/**
 * What a menu door asked the board to do when it exits (Decisions 34, 39).
 * Armed by AEW_MENU RUN / SHOW (xim/menu.ts), taken once by the door-exit tail
 * (door.handler.ts, M7). One record per session; a second RUN replaces the first.
 */
import type { MenuKind } from '../../screens/menu-config/menu-config';

export interface MenuRun { text: string; runAs: 'typed' | 'syscmd' }
export interface MenuShow { kind: MenuKind; key: string; command: string }

const exits = new WeakMap<object, { run?: MenuRun; show?: MenuShow }>();
const rows = new WeakMap<object, Map<string, number>>();

export function armMenuRun(session: object, run: MenuRun): void { exits.set(session, { run }); }
export function armMenuShow(session: object, show: MenuShow): void { exits.set(session, { show }); }
export function takeMenuExit(session: object): { run?: MenuRun; show?: MenuShow } {
  const e = exits.get(session) ?? {};
  exits.delete(session);
  return e;
}
export function rememberMenuRow(session: object, kind: string, row: number): void {
  if (!rows.has(session)) rows.set(session, new Map());
  rows.get(session)!.set(kind, row);
}
export function menuRowOf(session: object, kind: string): number { return rows.get(session)?.get(kind) ?? 0; }

// ---- M7: the exit-tail work loop (plan M7) ----------------------------------
import type { BBSSession } from '../../index';
import { readMenuConfig } from '../../services/menu-config.service';
import { boardRoot } from '../../utils/board-root.util';

const depth = new WeakMap<object, number>();
const parked = new WeakMap<object, string[]>();
const draining = new WeakSet<object>();
const dismissed = new WeakSet<object>();
const tailsEntered = new WeakMap<object, number>();
const launching = new WeakSet<object>();
const failed = new WeakSet<object>();
const reentered = new WeakSet<object>();
const launchStart = new WeakMap<object, number>();
const inputs = new WeakMap<object, number>();
const lastSelfExit = new WeakMap<object, number>();

/**
 * A MENU door that reaches its exit tail by itself (the caller sent it nothing) inside this window is a
 * door that starts and quits: two in a row latch the session onto the art menu (plan M19 review).
 * A caller who presses Esc, picks or types is never affected - they sent input - and a slow caller is
 * past the window anyway.
 */
export const MENU_SELF_EXIT_WINDOW_MS = 2000;
/** The caller sent the running door a key (door.handler's door input handler). */
export function noteCallerInput(session: object): void { inputs.set(session, (inputs.get(session) ?? 0) + 1); }
/** Forget a parked door by name (a latched MENU must not be relaunched by an entry its own tail parked). */
export function unparkDoor(session: object, command: string): void {
  const q = parked.get(session); if (q) parked.set(session, q.filter((c) => c !== command));
}

export function enterExitTail(session: object): void {
  depth.set(session, (depth.get(session) ?? 0) + 1);
  tailsEntered.set(session, (tailsEntered.get(session) ?? 0) + 1);
}
/** How many exit tails this session has ever entered: a door that ran reaches its tail, one that failed to start does not (M19). */
export function exitTailsEntered(session: object): number { return tailsEntered.get(session) ?? 0; }
/** A MENU launch is in flight: a second launch from inside it (a crash handler's menu redraw) must not re-enter the door. */
export function menuLaunchInFlight(session: object): boolean { return launching.has(session); }
export function setMenuLaunchInFlight(session: object, on: boolean): void {
  if (on) { launching.add(session); launchStart.set(session, exitTailsEntered(session)); } else launching.delete(session);
}
/** A MENU launch is in flight and its door has not reached its exit tail yet: whatever draws the menu now is a failure handler. */
export function menuLaunchUnstarted(session: object): boolean { return launching.has(session) && exitTailsEntered(session) === launchStart.get(session); }
/** The MENU door failed to run for this session; the board's art menu serves the rest of it. */
export function markMenuDoorFailed(session: object): void { failed.add(session); }
/** A launch was refused while one was in flight (the failure handler drew the art menu itself). Read once. */
export function markMenuReentered(session: object): void { reentered.add(session); }
export function takeMenuReentered(session: object): boolean { const had = reentered.has(session); reentered.delete(session); return had; }
export function menuDoorFailed(session: object): boolean { return failed.has(session); }
export function leaveExitTail(session: object): void { depth.set(session, Math.max(0, (depth.get(session) ?? 0) - 1)); }
export function inExitTail(session: object): boolean { return (depth.get(session) ?? 0) > 0 || draining.has(session); }
export function parkDoor(session: object, command: string): void {
  const q = parked.get(session) ?? [];
  if (!q.includes(command)) q.push(command);
  parked.set(session, q);
}
/** Forget every parked door: a failed tail or relaunch must not leave one for an unrelated door's exit to run. */
export function clearParkedDoors(session: object): void { parked.delete(session); }
export function hasParkedDoor(session: object): boolean { return (parked.get(session)?.length ?? 0) > 0; }
export function markMenuDoorDismissed(session: object): void { dismissed.add(session); }
export function takeMenuDoorDismissed(session: object): boolean { const had = dismissed.has(session); dismissed.delete(session); return had; }

/** The door's executable is on the board's volume, resolved case-insensitively the way executeAmigaDoor does. */
export function doorBinaryExists(location: string): boolean {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const amigafs = require('../../utils/amigafs');
  const nodePath = require('path') as typeof import('path');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const rel = String(location || '').replace(/:/g, '/').replace(/\\/g, '/').split('/').filter((c: string) => c.length > 0);
  if (rel.length === 0) return false;
  const root: string = boardRoot();
  const tries = [nodePath.join(root, ...rel), nodePath.join(root, 'Doors', ...rel)];
  return tries.some((p) => { try { return amigafs.existsSync(p); } catch { return false; } });
}

/**
 * The ONE guarded MENU launch, used by launchMenuDoor and by the parked-relaunch loop below.
 * 'ran'     - the door reached its exit tail.
 * 'handled' - it failed and the failure handler (executeAmigaDoor's catch) already drew the menu and prompt.
 * 'failed'  - it could not run (binary missing) or ran without reaching a tail / threw: the caller draws
 *             the art menu. A launch that did not reach its tail also latches the session (Decision 12).
 */
export async function runMenuDoor(socket: unknown, session: BBSSession): Promise<'ran' | 'handled' | 'failed'> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { commandCache } = require('../command-execution.handler');
  if (menuDoorFailed(session)) return 'failed';
  const def = commandCache.bbscmd.get('MENU');
  if (!def || !doorBinaryExists(def.location)) return 'failed';
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { processCommand } = require('../command.handler') as typeof import('../command.handler');
  const tailsBefore = exitTailsEntered(session);
  const inputsBefore = inputs.get(session) ?? 0;
  const startedAt = Date.now();
  setMenuLaunchInFlight(session, true);
  try {
    await processCommand(socket as never, session, 'MENU', '');
  } catch (err) {
    console.error('[menu] MENU door threw:', err);
  } finally {
    setMenuLaunchInFlight(session, false);
  }
  const wasReentered = takeMenuReentered(session);
  if (exitTailsEntered(session) === tailsBefore) {
    markMenuDoorFailed(session);
    return wasReentered ? 'handled' : 'failed';
  }
  // The door reached its tail. One that did so by itself, fast, twice running, is a door that starts and
  // quits: latch it, and drop the relaunch its own tail just parked.
  const endedAt = Date.now();
  const selfExit = endedAt - startedAt < MENU_SELF_EXIT_WINDOW_MS && (inputs.get(session) ?? 0) === inputsBefore;
  if (selfExit) {
    const previous = lastSelfExit.get(session);
    lastSelfExit.set(session, endedAt);
    if (previous !== undefined && startedAt - previous < MENU_SELF_EXIT_WINDOW_MS) {
      markMenuDoorFailed(session);
      unparkDoor(session, 'MENU');
      return 'failed';
    }
  } else {
    lastSelfExit.delete(session);
  }
  return 'ran';
}

/**
 * Launch every parked door, one after another, from the OUTERMOST exit tail.
 * A door launched here exits through a tail that parks its successor and
 * returns, so the loop - not the stack - carries the next one.
 */
export async function drainParkedDoors(socket: unknown, session: BBSSession): Promise<void> {
  if ((depth.get(session) ?? 0) > 0 || draining.has(session)) return;
  draining.add(session);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { theCallerIsLeaving } = require('../door.handler') as typeof import('../door.handler');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { processCommand } = require('../command.handler') as typeof import('../command.handler');
    for (;;) {
      const next = parked.get(session)?.shift();
      if (!next) break;
      if (theCallerIsLeaving(session)) { parked.delete(session); break; }
      if (next === 'MENU') {
        // One guarded path for every MENU launch: a crashing relaunch is tried once, then the art menu serves.
        if ((await runMenuDoor(socket, session)) === 'failed') {
          // The caller may have hung up while the door threw: a dead session gets no menu.
          if (theCallerIsLeaving(session)) { parked.delete(session); break; }
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { displayMainMenu } = require('../command-handler/menu') as typeof import('../command-handler/menu');
          await displayMainMenu(socket as never, session, false, true);
        }
        continue;
      }
      await processCommand(socket as never, session, next, '');
    }
  } catch (err) {
    clearParkedDoors(session);
    throw err;
  } finally {
    draining.delete(session);
  }
}

/**
 * Decision 39: the bulletin is the board's screen - level-aware, its own ~W or
 * the menu's leave wipe, every ~SP pause - and B comes back after it.
 */
export async function showBulletinThenReopen(socket: unknown, session: BBSSession, show: MenuShow): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { showBulletin } = require('./display-file-commands.handler') as typeof import('./display-file-commands.handler');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { continueAfterScreen } = require('../screen.handler') as typeof import('../screen.handler');
  const wipe = readMenuConfig(boardRoot(), show.kind).config.wipes.leave;
  try {
    await showBulletin(socket as never, session, Number(show.key), wipe);
  } catch (err) {
    // The caller must not be left without a screen: B reopens even when the bulletin could not be shown.
    console.warn('[menu-door-exit] bulletin could not be shown:', err);
  }
  await continueAfterScreen(socket as never, session, async () => {
    parkDoor(session, show.command);
    await drainParkedDoors(socket, session);
  }, 'bulletins-door');
}

// ---- Redaction: the picked line can hold a password (a conference or command password typed as a parameter) ----
const redacting = new WeakMap<object, number>();

/** Run `fn` with the session's command line withheld from every log that would print it. */
export async function runRedacted<T>(session: object, on: boolean, fn: () => Promise<T>): Promise<T> {
  if (!on) return fn();
  redacting.set(session, (redacting.get(session) ?? 0) + 1);
  try { return await fn(); } finally {
    const n = (redacting.get(session) ?? 1) - 1;
    if (n <= 0) redacting.delete(session); else redacting.set(session, n);
  }
}
/** What a log may say of a command line's parameters: nothing while a menu pick is running. */
export function loggableCommandParams(session: object, params: string): string {
  return redacting.has(session) ? '[withheld]' : params;
}
