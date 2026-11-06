/**
 * Enter in the command palette runs a command typed in full.
 *
 * Typing `/edit` opened the palette, and Enter only refilled the box with
 * `/edit ` - nothing changed on screen and pick mode never started. Enter now
 * runs a command whose name is typed in full, and still fills in a half-typed
 * one. Driven through createApp.
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

async function typeIntoPalette(input: any, value: string, settle: () => Promise<unknown>): Promise<void> {
  input.setValue(value);
  input.emit('keypress', value.slice(-1), { name: value.slice(-1) });
  await settle();
}

export async function enterRunsAFullyTypedCommand(): Promise<void> {
  const { app, fire, settle } = await openDoor();
  const input = elements(app.screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
  fire('chat:message', { id: 'm-1', channelId: 'r1', userId: 'u2', username: 'bob', content: 'hello', createdAt: new Date() });
  await settle();

  await typeIntoPalette(input, '/edit', settle);
  input.emit('keypress', '\r', { name: 'enter' });
  await settle();
  assert.match(String(input._label?.content || input.options?.label || ''), /PICK MESSAGE/, 'Enter on /edit starts pick mode');
  fire('disconnect', 'transport close');
}

export async function enterFillsAHalfTypedCommand(): Promise<void> {
  const { app, fire, settle } = await openDoor();
  const input = elements(app.screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
  await typeIntoPalette(input, '/edi', settle);
  input.emit('keypress', '\r', { name: 'enter' });
  await settle();
  assert.strictEqual(input.getValue(), '/edit ', 'Enter on /edi fills in /edit');
  fire('disconnect', 'transport close');
}
