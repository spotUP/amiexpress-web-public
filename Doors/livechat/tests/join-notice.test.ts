/**
 * "the status messages are not echoed in the log, they are offset to the
 * left" (the sysop, 2026-10-18).
 *
 * The sidebar is fit-to-content. It is built at the configured width (15),
 * the layout is solved against that, and then its first render grows it to
 * its widest line (22). Nothing re-solved the layout when it grew, so the
 * chat panel stayed at column 15 - underneath the sidebar - and every line
 * of the chat log started six columns behind it: "*** sysop joined the
 * room ***" read "sop joined the room ***".
 *
 * Driven, not read: the door is opened on a stub, a second user joins over
 * the socket, and the cells of the real screen buffer are measured.
 */

import assert from 'assert';
import { createApp } from '../server';

/** The door opened headless at 80x25 on a stub, with a way to fire socket events. */
async function openDoor(): Promise<{
  screen: any; fire: (event: string, ...args: unknown[]) => void; settle: () => Promise<unknown>;
}> {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), fn]);
    },
    emit: () => {}, off: () => {}, removeAllListeners: () => {},
  };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'spot', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'spot', accessLevel: 255 },
  };
  const fire = (event: string, ...args: unknown[]) => (handlers.get(event) ?? []).forEach(fn => fn(...args));
  // The sidebar fits itself to its content on a short timer after a render.
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));

  const app: any = await createApp(session);
  return { screen: app.screen, fire, settle };
}

export async function aJoinNoticeIsDrawnOnlyInTheChatLog(): Promise<void> {
  const { screen, fire, settle } = await openDoor();
  fire('room:joined', {
    roomId: 'r1', roomName: 'main', memberCount: 1,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }],
  });
  await settle();
  fire('room:user-joined', { userId: 'u2', username: 'sysop' });
  await settle();
  screen.render();

  const all: any[] = [];
  const walk = (el: any) => { for (const c of el.children ?? []) { all.push(c); walk(c); } };
  walk(screen);
  const sidebar = all.find(p => String(p.options?.label ?? '').trim() === 'Sidebar');
  const chat = all.find(p => p.options?.persistenceKey === 'chat-main');
  assert.ok(sidebar && chat, 'both panels must exist');
  const sidebarEnd = sidebar._getCoords().xl;

  assert.ok(chat._getCoords().xi >= sidebarEnd,
    `the chat panel must start where the sidebar ends (sidebar ends at ${sidebarEnd}, ` +
    `chat starts at ${chat._getCoords().xi})`);

  const rows: string[] = screen.buffer.map((row: Array<[number, string]>) => row.map(cell => cell[1]).join(''));
  const notice = '*** sysop joined the room ***';
  const row = rows.find(r => r.includes('sysop joined the room'));
  assert.ok(row, 'the join notice must be on the screen');
  assert.ok(row.includes(notice), `the whole notice must be readable, got "${row.trim()}"`);
  assert.ok(row.indexOf(notice) >= sidebarEnd, 'and it must be drawn in the chat log, right of the sidebar');

  fire('disconnect', 'transport close');
}

/**
 * "the first line of the chat log is hidden under the Chat heading" (the
 * sysop, 2026-10-18).
 *
 * A chat panel that can be dragged gets a one-row title bar as the first row
 * of its content. The log was placed at row 0 of that same content, so the
 * bar was drawn over the log's first line: "*** Joined #main (1 users) ***"
 * was in the log and never on the screen.
 */
export async function theChatHeadingHidesNoLogLine(): Promise<void> {
  const { screen, fire, settle } = await openDoor();
  fire('room:joined', {
    roomId: 'r1', roomName: 'main', memberCount: 1,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }],
  });
  await settle();
  screen.render();

  const rows: string[] = screen.buffer.map((row: Array<[number, string]>) => row.map(cell => cell[1]).join(''));
  const heading = rows.findIndex(r => r.includes(' Chat '));
  const notice = rows.findIndex(r => r.includes('*** Joined #main (1 users) ***'));
  assert.ok(notice >= 0, `the log's first line must be on the screen, got:\n${rows.slice(1, 5).join('\n')}`);
  assert.ok(heading < 0 || notice > heading, 'and it must be below the heading, not under it');

  fire('disconnect', 'transport close');
}
