/**
 * LiveChat B4: /whois asks the server (chat:whois), the chat:profile reply is
 * rendered and cancels the local fallback, ignore names match across the
 * @BOARD suffix, and a presence from a person not yet on the roster appears.
 */

import assert from 'assert';
import { createApp } from '../server';
import { createMuteList, toggleMute, canonicalName, muteLevel } from '../core/mute-list';

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
  fire('room:list', { rooms: [{ room_id: 'r1', room_name: 'main', is_public: true, member_count: 1 }] });
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

function chatLineOf(app: any, needle: string): string {
  for (const el of elements(app.screen)) {
    const text = String(el.getContent?.() ?? el.content ?? '').replace(/\{[^}]*\}/g, '').replace(/\x1b\[[0-9;]*m/g, '');
    const line = text.split(/\r?\n/).find(l => l.includes(needle));
    if (line) return line;
  }
  return '';
}


const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function whoisAsksTheServerAndRendersTheProfile(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  try {
    await typeLine(app, settle, '/whois bob');
    assert.deepStrictEqual(emits.filter(e => e.event === 'chat:whois').map(e => e.payload), [{ username: 'bob' }]);
    fire('chat:profile', { found: true, user: 'bob@TEST', nick: 'bob', board: 'TEST', status: 'away', statusText: 'at lunch', online: '1', idleSeconds: '12', firstSeen: '1700000000' });
    await settle();
    assert.ok(chatLineOf(app, 'bob @TEST - away - at lunch'), 'the server profile must reach the chat');
    await sleep(1600);
    assert.strictEqual(chatLineOf(app, 'is not known'), '', 'no fallback after a reply');
  } finally {
    fire('disconnect', 'transport close');
  }
}

export async function ignoreNamesMatchAcrossTheBoardSuffix(): Promise<void> {
  const list = createMuteList();
  assert.strictEqual(toggleMute(list, 'bob@TEST', 'ignore'), 'ignore');
  assert.strictEqual(canonicalName(list, 'bob'), 'bob@test');
  assert.strictEqual(muteLevel(list, 'bob'), 'ignore');
}

export async function presenceFromAnUnlistedUserJoinsTheRoster(): Promise<void> {
  const { app, fire, settle } = await openDoor();
  try {
    fire('chat:presence', { userId: 'carol@TEST', username: 'carol@TEST', status: 'away', custom: 'brb' });
    await settle();
    assert.ok(chatLineOf(app, 'carol@TEST is away'), 'a presence from an unknown user must show');
  } finally {
    fire('disconnect', 'transport close');
  }
}
