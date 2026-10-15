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

export function enterExitTail(session: object): void { depth.set(session, (depth.get(session) ?? 0) + 1); }
export function leaveExitTail(session: object): void { depth.set(session, Math.max(0, (depth.get(session) ?? 0) - 1)); }
export function inExitTail(session: object): boolean { return (depth.get(session) ?? 0) > 0 || draining.has(session); }
export function parkDoor(session: object, command: string): void {
  const q = parked.get(session) ?? [];
  if (!q.includes(command)) q.push(command);
  parked.set(session, q);
}
export function hasParkedDoor(session: object): boolean { return (parked.get(session)?.length ?? 0) > 0; }
export function markMenuDoorDismissed(session: object): void { dismissed.add(session); }
export function takeMenuDoorDismissed(session: object): boolean { const had = dismissed.has(session); dismissed.delete(session); return had; }

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
      await processCommand(socket as never, session, next, '');
    }
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
  await showBulletin(socket as never, session, Number(show.key), wipe);
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
