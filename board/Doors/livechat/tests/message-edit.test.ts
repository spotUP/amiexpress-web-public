/**
 * Edit and delete (decisions D5, D6), driven through the real door
 * (createApp): /edit and /deletemsg emit chat:edit / chat:delete, /edit with
 * no id edits your own last stored message, chat:edited repaints the line in
 * place marked "(edited)", chat:deleted removes it, history marks edited
 * lines.
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

const chatMsg = (id: string, content: string) =>
  ({ id, channelId: 'r1', userId: 'u2', username: 'bob', content, createdAt: new Date() });

function chatLineOf(app: any, needle: string): string {
  for (const el of elements(app.screen)) {
    const text = String(el.getContent?.() ?? el.content ?? '').replace(/\{[^}]*\}/g, '').replace(/\x1b\[[0-9;]*m/g, '');
    const line = text.split(/\r?\n/).find(l => l.includes(needle));
    if (line) return line;
  }
  return '';
}

export async function editAndDeleteGoToTheServerAndRepaintTheLine(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  try {
    // Commands emit the wire shape the backend reads.
    fire('chat:message', chatMsg('4242', 'hello from bob'));
    await settle();
    await typeLine(app, settle, '/edit 4242 hello from bob, fixed');
    await typeLine(app, settle, '/deletemsg 4242');
    assert.deepStrictEqual(emits.find(e => e.event === 'chat:edit')?.payload,
      { roomId: 'r1', messageId: '4242', content: 'hello from bob, fixed' });
    assert.deepStrictEqual(emits.find(e => e.event === 'chat:delete')?.payload,
      { roomId: 'r1', messageId: '4242' });

    // /edit with no id edits the last line this user sent, once it has a stored id.
    await typeLine(app, settle, 'my own line');
    const sent = emits.find(e => e.event === 'room:message');
    fire('room:message:ack', { clientId: sent!.payload.clientId, id: '9001' });
    await typeLine(app, settle, '/edit my own line, better');
    assert.deepStrictEqual(emits.filter(e => e.event === 'chat:edit').pop()?.payload,
      { roomId: 'r1', messageId: '9001', content: 'my own line, better' });

    // The broadcast repaints the line where it stands, marked.
    fire('chat:message', chatMsg('5000', 'before'));
    fire('chat:message', chatMsg('5001', 'typo line'));
    fire('chat:message', chatMsg('5002', 'after'));
    await settle();
    fire('chat:edited', { messageId: '5001', roomId: 'r1', username: 'bob', content: 'fixed line', edited: true, createdAt: Date.now() });
    await settle();
    assert.ok(chatLineOf(app, 'fixed line').includes('(edited)'), `edited line is marked: "${chatLineOf(app, 'fixed line')}"`);
    assert.strictEqual(chatLineOf(app, 'typo line'), '', 'the old text is gone');
    assert.ok(chatLineOf(app, 'before') && chatLineOf(app, 'after'), 'neighbours stay');

    // The delete broadcast removes it.
    fire('chat:deleted', { messageId: '5001', roomId: 'r1', by: 'spot' });
    await settle();
    assert.strictEqual(chatLineOf(app, 'fixed line'), '', 'the deleted line is gone');
    assert.ok(chatLineOf(app, 'before') && chatLineOf(app, 'after'), 'neighbours stay after the delete');

    // History marks lines edited before this caller joined.
    fire('room:joined', {
      roomId: 'r1', roomName: 'main', memberCount: 1,
      members: [{ user_id: 'u1', username: 'spot', is_online: true }],
      history: [{ id: 31, username: 'bob', content: 'old but fixed', createdAt: new Date().toISOString(), edited: true }],
    });
    await settle();
    assert.ok(chatLineOf(app, 'old but fixed').includes('(edited)'), 'history carries the edited mark');
  } finally {
    fire('disconnect', 'transport close');
  }
}
