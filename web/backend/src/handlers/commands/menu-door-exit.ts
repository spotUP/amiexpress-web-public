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
