/**
 * Message ids are strings (`${userId}-${Date.now()}` or server ids). /pin,
 * /unpin and /thread used to parseInt them - "12-345" became 12 - and the
 * context menu's Pin Message said the server could not pin. Driven through the
 * real door (createApp); the stub socket records every emit().
 */

import assert from 'assert';
import { createApp } from '../server';

type Emit = { event: string; payload: any };

async function openDoor(): Promise<{ app: any; emits: Emit[]; fire: (event: string, ...args: unknown[]) => void; settle: () => Promise<unknown> }> {
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

async function typeLine(app: any, settle: () => Promise<unknown>, text: string): Promise<void> {
  const input = elements(app.screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
  assert.ok(input, 'the input box must exist');
  input.emit('submit', text);
  await settle();
}

export async function slashPinKeepsTheStringId(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  await typeLine(app, settle, '/pin 12-345');
  const pin = emits.find(e => e.event === 'chat:pin:add');
  assert.ok(pin, 'chat:pin:add must be emitted');
  assert.strictEqual(pin!.payload.messageId, '12-345');
  fire('disconnect', 'transport close');
}

export async function slashUnpinAndThreadKeepTheStringId(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  await typeLine(app, settle, '/unpin 12-345');
  await typeLine(app, settle, '/thread 12-345 hello');
  assert.strictEqual(emits.find(e => e.event === 'chat:pin:remove')?.payload.messageId, '12-345');
  assert.strictEqual(emits.find(e => e.event === 'chat:thread:reply')?.payload.threadId, '12-345');
  fire('disconnect', 'transport close');
}

export async function copyTextWritesAnOsc52ClipboardSequence(): Promise<void> {
  const { app, fire, settle } = await openDoor();
  await typeLine(app, settle, 'hello {bold}world{/bold} caf\u00e9');
  const chatLog = elements(app.screen).find(e => e.listeners('rightclick').length > 0);
  chatLog.emit('rightclick', { x: 10, y: 3 });
  const menu = elements(app.screen).find(e => e.zIndex === 9999 && typeof e.select === 'function');
  const items: string[] = (menu.items ?? []).map((i: any) => String(i.content ?? i).replace(/\{[^}]*\}/g, ''));
  const idx = items.indexOf('Copy Text');
  assert.ok(idx >= 0, `menu must offer Copy Text, has: ${items.join('|')}`);
  const written: string[] = [];
  const program = app.screen.program;
  const realWrite = program.write.bind(program);
  program.write = (d: string) => { written.push(d); };
  try { menu.emit('select', menu.items[idx], idx); } finally { program.write = realWrite; }
  const osc = written.find(w => w.startsWith('\x1b]52;c;'));
  assert.ok(osc, 'Copy Text must write an OSC 52 sequence');
  assert.ok(osc!.endsWith('\x07'));
  const text = Buffer.from(osc!.slice(7, -1), 'base64').toString('utf8');
  assert.ok(text.includes('caf\u00e9'), `clipboard carries the message text: ${text}`);
  assert.ok(!text.includes('{bold}'), 'blessed tags are stripped');
  fire('disconnect', 'transport close');
}

export async function theContextMenuPinsTheMessageUnderThePointer(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  await typeLine(app, settle, 'hello world');
  const sent = emits.find(e => e.event === 'chat:message' || e.event === 'room:message');
  const chatLog = elements(app.screen).find(e => e.listeners('rightclick').length > 0);
  assert.ok(chatLog, 'the chat log must take a right-click');
  chatLog.emit('rightclick', { x: 10, y: 3 });
  const menu = elements(app.screen).find(e => e.zIndex === 9999 && typeof e.select === 'function');
  assert.ok(menu, 'the context menu must exist');
  const items: string[] = (menu.items ?? []).map((i: any) => String(i.content ?? i).replace(/\{[^}]*\}/g, ''));
  const idx = items.indexOf('Pin Message');
  assert.ok(idx >= 0, `menu must offer Pin Message, has: ${items.join('|')} (sent: ${JSON.stringify(sent)})`);
  menu.emit('select', menu.items[idx], idx);
  const pin = emits.find(e => e.event === 'chat:pin:add');
  assert.ok(pin, 'Pin Message must emit chat:pin:add');
  assert.ok(/^1-\d+$/.test(pin!.payload.messageId), `id stays the string: ${pin!.payload.messageId}`);
  assert.strictEqual(pin!.payload.roomId, 'r1');
  fire('disconnect', 'transport close');
}
