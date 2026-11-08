/**
 * Topic, operator and settings commands (decision D6, plan L6), driven through
 * the real door (createApp): /topic, /op, /deop and /delete emit the wire
 * events the backend reads, /sounds goes through the settings overlay's
 * saveSettings path and changes the prefs, /status busy reaches presence.
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

export async function roomCommandsEmitAndSettingsCommandsChangePrefs(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  try {
    await typeLine(app, settle, '/topic Weekly demo night');
    await typeLine(app, settle, '/op @bob');
    await typeLine(app, settle, '/deop bob');
    await typeLine(app, settle, '/delete #random');
    await typeLine(app, settle, '/status busy gone fishing');
    assert.deepStrictEqual(emits.find(e => e.event === 'room:topic')?.payload, { topic: 'Weekly demo night' });
    assert.deepStrictEqual(emits.filter(e => e.event === 'room:op').map(e => e.payload),
      [{ username: 'bob', op: true }, { username: 'bob', op: false }]);
    assert.deepStrictEqual(emits.find(e => e.event === 'admin:delete-channel')?.payload, { channel: 'random' });
    assert.deepStrictEqual(emits.find(e => e.event === 'chat:presence')?.payload, { status: 'busy', custom: 'gone fishing' });

    // Settings commands change state.prefs through saveSettings.
    const before = app.state.prefs.notificationSound;
    await typeLine(app, settle, before ? '/sounds off' : '/sounds on');
    assert.strictEqual(app.state.prefs.notificationSound, !before, '/sounds must change the preference');
    const compact = app.state.prefs.compactMode;
    await typeLine(app, settle, '/compact');
    assert.strictEqual(app.state.prefs.compactMode, !compact, '/compact must toggle');

    // The backend's broadcast lands in the door.
    fire('room:topic', { roomId: 'r1', topic: 'New topic', by: 'bob' });
    await settle();
    assert.ok(chatLineOf(app, 'set the topic: New topic'), 'the topic broadcast must reach the chat');
    // L13: the chat panel's header label is what the user reads as the
    // channel header; it showed only "#main" after a topic was set.
    const labels = elements(app.screen).map((el: any) => String(el.getLabel?.() ?? ''));
    assert.ok(labels.some(l => l.includes('main - New topic')), `the channel header must show the topic, got ${JSON.stringify(labels.filter(Boolean))}`);
  } finally {
    fire('disconnect', 'transport close');
  }
}
