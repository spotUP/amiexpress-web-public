/**
 * A sent line has three ids unless the server names it: the door makes a local
 * one, the server saves a DB row, and everyone else sees the DB id. The server
 * answers room:message with room:message:ack { clientId, id }; the door re-keys
 * its own line so Pin / React / Edit / Delete act on the id the room knows.
 * Driven through createApp; the pin menu entry reads chatMessageIds.
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

async function pinUnderPointer(app: any, emits: Emit[]): Promise<Emit | undefined> {
  const chatLog = elements(app.screen).find(e => e.listeners('rightclick').length > 0);
  chatLog.emit('rightclick', { x: 10, y: 3 });
  const menu = elements(app.screen).find(e => e.zIndex === 9999 && typeof e.select === 'function');
  const items: string[] = (menu.items ?? []).map((i: any) => String(i.content ?? i).replace(/\{[^}]*\}/g, ''));
  const idx = items.indexOf('Pin Message');
  assert.ok(idx >= 0, `menu must offer Pin Message, has: ${items.join('|')}`);
  menu.emit('select', menu.items[idx], idx);
  return emits.find(e => e.event === 'chat:pin:add');
}

export async function theServerAckReKeysTheSentLine(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  const input = elements(app.screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
  input.emit('submit', 'hello world');
  await settle();
  const sent = emits.find(e => e.event === 'room:message');
  assert.ok(sent, 'room:message must be emitted');
  assert.strictEqual(typeof sent!.payload.clientId, 'string', 'room:message must carry a clientId');

  fire('room:message:ack', { clientId: sent!.payload.clientId, id: '4242' });
  const pin = await pinUnderPointer(app, emits);
  assert.ok(pin, 'Pin Message must emit chat:pin:add');
  assert.strictEqual(pin!.payload.messageId, '4242', 'the pinned id is the server id');
  fire('disconnect', 'transport close');
}
