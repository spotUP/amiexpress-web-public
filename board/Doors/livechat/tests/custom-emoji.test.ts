/**
 * /customemoji (L8, D7): the sysop adds a board-wide emoji, the door stores it
 * in the single emoji lookup, and a received :code: renders as the display form
 * on a web caller and the ASCII form on a telnet caller (D1). A non-sysop add
 * emits nothing. Driven through the real door (createApp).
 */

import assert from 'assert';
import { createApp } from '../server';
import { setCustomEmojis, setEmojiRenderMode } from '../utils/emojis';

type Emit = { event: string; payload: any };

async function openDoor(connectionType: string, secLevel: number) {
  const handlers = new Map<string, Array<(...a: any[]) => void>>();
  const emits: Emit[] = [];
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType, unicodeCapable: connectionType === 'web',
  };
  const socket: any = {
    on: (event: string, fn: (...a: any[]) => void) => { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    emit: (event: string, payload: unknown) => { emits.push({ event, payload }); },
    off: () => {}, removeAllListeners: () => {},
  };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'spot', nodeId: 1, secLevel, tempData: {}, socket },
    user: { id: 1, name: 'spot', accessLevel: secLevel, secLevel },
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

function chatLine(app: any, needle: string): string {
  for (const el of elements(app.screen)) {
    const text = String(el.getContent?.() ?? el.content ?? '').replace(/\{[^}]*\}/g, '').replace(/\x1b\[[0-9;]*m/g, '');
    const line = text.split(/\r?\n/).find(l => l.includes(needle));
    if (line) return line;
  }
  return '';
}

const LIST = { emojis: [{ name: 'party', display: '\u{1F389}', ascii: '(P)' }] };
const chatMsg = (content: string) =>
  ({ id: '9001', channelId: 'r1', userId: 'u2', username: 'bob', content, createdAt: new Date() });

export async function sysopAddsACustomEmojiAndOpeningLoadsTheList(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor('web', 255);
  try {
    assert.ok(emits.some(e => e.event === 'chat:emoji:list'), 'opening must request the custom emoji list');
    await typeLine(app, settle, '/customemoji add party \u{1F389} (P)');
    const add = emits.find(e => e.event === 'chat:emoji:add');
    assert.deepStrictEqual(add?.payload, { name: 'party', display: '\u{1F389}', ascii: '(P)' });
    fire('chat:emoji-list', LIST);
    await typeLine(app, settle, '/customemoji list');
    assert.ok(chatLine(app, 'party').includes('(P)'), `list must print the entry: "${chatLine(app, 'party')}"`);
    await typeLine(app, settle, '/customemoji remove party');
    assert.deepStrictEqual(emits.find(e => e.event === 'chat:emoji:remove')?.payload, { name: 'party' });
  } finally {
    setCustomEmojis([]); setEmojiRenderMode(true);
    fire('disconnect', 'transport close');
  }
}

export async function nonSysopCustomEmojiAddEmitsNothing(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor('web', 10);
  try {
    await typeLine(app, settle, '/customemoji add party \u{1F389} (P)');
    await typeLine(app, settle, '/customemoji remove party');
    assert.ok(!emits.some(e => e.event === 'chat:emoji:add' || e.event === 'chat:emoji:remove'), 'a non-sysop must not emit');
  } finally {
    setCustomEmojis([]); setEmojiRenderMode(true);
    fire('disconnect', 'transport close');
  }
}

export async function customEmojiRendersDisplayOnWebAndAsciiOnTelnet(): Promise<void> {
  const web = await openDoor('web', 10);
  try {
    web.fire('chat:emoji-list', LIST);
    web.fire('chat:message', chatMsg('hi :party:'));
    await web.settle();
    const line = chatLine(web.app, 'hi ');
    assert.ok(line.includes('\u{1F389}') && !line.includes('(P)') && !line.includes(':party:'), `web line: "${line}"`);
  } finally {
    setCustomEmojis([]); setEmojiRenderMode(true);
    web.fire('disconnect', 'transport close');
  }
  const tel = await openDoor('telnet', 10);
  try {
    tel.fire('chat:emoji-list', LIST);
    tel.fire('chat:message', chatMsg('hi :party:'));
    await tel.settle();
    const line = chatLine(tel.app, 'hi ');
    assert.ok(line.includes('(P)') && !line.includes('\u{1F389}') && !line.includes(':party:'), `telnet line: "${line}"`);
  } finally {
    setCustomEmojis([]); setEmojiRenderMode(true);
    tel.fire('disconnect', 'transport close');
  }
}
