/**
 * The context menu's Quote shows what is quoted.
 *
 * Quote used to put only `> ` in the input box, so the sent line read
 * "> my text" and nobody could tell what was quoted (sysop, 2026-11-06:
 * "i dont see what i quote when i do quotes i only see > my text"). It now
 * fills the input with the author and text of the line under the pointer,
 * from the same lookup /reply uses. Driven through createApp.
 */

import assert from 'assert';
import { createApp } from '../server';

type Emit = { event: string; payload: any };

async function openDoor() {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const emits: Emit[] = [];
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    emit: (event: string, payload: unknown) => { emits.push({ event, payload }); },
    off: () => {}, removeAllListeners: () => {},
  };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'spot', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'spot', accessLevel: 255, secLevel: 255 },
  };
  const fire = (event: string, ...args: unknown[]) => (handlers.get(event) ?? []).forEach(fn => fn(...args));
  const settle = () => new Promise(resolve => setTimeout(resolve, 100));
  const app: any = await createApp(session);
  fire('room:joined', {
    roomId: 'r1', roomName: 'main', memberCount: 1,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }],
  });
  await settle();
  return { app, emits, fire, settle };
}

function elements(screen: any): any[] {
  const out: any[] = [];
  const walk = (el: any) => { out.push(el); (el.children ?? []).forEach(walk); };
  walk(screen);
  return out;
}

function pickUnderPointer(app: any, label: string): void {
  const chatLog = elements(app.screen).find(e => e.listeners('rightclick').length > 0);
  chatLog.emit('rightclick', { x: 10, y: 3 });
  const menu = elements(app.screen).find(e => e.zIndex === 9999 && typeof e.select === 'function');
  const items: string[] = (menu.items ?? []).map((i: any) => String(i.content ?? i).replace(/\{[^}]*\}/g, ''));
  const idx = items.indexOf(label);
  assert.ok(idx >= 0, `menu must offer ${label}, has: ${items.join('|')}`);
  menu.emit('select', menu.items[idx], idx);
}

export async function quoteFillsTheInputWithTheQuotedLine(): Promise<void> {
  const { app, fire, settle } = await openDoor();
  const input = elements(app.screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
  input.emit('submit', 'hello world');
  await settle();

  pickUnderPointer(app, 'Quote');
  assert.match(input.getValue(), /^> \S+: hello world $/, 'Quote puts the author and text in the input');
  fire('disconnect', 'transport close');
}
