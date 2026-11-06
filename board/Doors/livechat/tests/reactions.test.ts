/**
 * Reactions travel to the backend (stored with the message) and the counts
 * come back as chat:reaction. /heart, /fire and /-1 are aliases of /react and
 * must react with their own emoji, not the +1 default. Driven through the
 * real door (createApp).
 */

import assert from 'assert';
import { createApp } from '../server';
import { getReactionCounts, formatReactionCounts, seedReactionCounts, clearReactionCounts } from '../features/reaction-store';

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

export async function reactionCommandsEmitTheirOwnEmojiForTheReceivedMessage(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  try {
    fire('chat:message', chatMsg('4242', 'hello from bob'));
    await settle();
    await typeLine(app, settle, '/react heart 4242');
    await typeLine(app, settle, '/heart 4242');
    await typeLine(app, settle, '/fire 4242');
    await typeLine(app, settle, '/-1 4242');
    await typeLine(app, settle, '/unreact heart 4242');
    const reacts = emits.filter(e => e.event === 'chat:react').map(e => e.payload);
    assert.deepStrictEqual(reacts.map(r => r.emoji), ['heart', 'heart', 'fire', '-1']);
    assert.ok(reacts.every(r => r.messageId === '4242' && r.roomId === 'r1'), JSON.stringify(reacts));
    const un = emits.find(e => e.event === 'chat:unreact');
    assert.ok(un && un.payload.emoji === 'heart' && un.payload.messageId === '4242', 'unreact must emit');

    // The broadcast fills the store the renderer reads; history seeds it too.
    fire('chat:reaction', { messageId: '4242', username: 'bob', emoji: 'heart', action: 'add', counts: { heart: 2, fire: 1 } });
    assert.deepStrictEqual(getReactionCounts('4242'), { heart: 2, fire: 1 });
    assert.strictEqual(formatReactionCounts('4242'), ' [<3 2] [*F* 1]');
    fire('chat:reaction', { messageId: '4242', username: 'bob', emoji: 'heart', action: 'remove', counts: {} });
    assert.deepStrictEqual(getReactionCounts('4242'), {});
    seedReactionCounts([{ id: 7, reactions: { wow: 3 } }, { id: 8 }]);
    assert.deepStrictEqual(getReactionCounts('7'), { wow: 3 });
  } finally {
    clearReactionCounts();
    fire('disconnect', 'transport close');
  }
}

/**
 * Stored counts reach the screen: a late joiner sees them on the history line
 * from room:joined, and a chat:reaction repaints the line with the new counts.
 */
export async function storedReactionCountsShowOnTheMessageLine(): Promise<void> {
  clearReactionCounts();
  const { app, fire, settle } = await openDoor();
  const chatLine = (needle: string): string => {
    for (const el of elements(app.screen)) {
      const text = String(el.getContent?.() ?? el.content ?? '').replace(/\{[^}]*\}/g, '').replace(/\x1b\[[0-9;]*m/g, '');
      const line = text.split(/\r?\n/).find(l => l.includes(needle));
      if (line) return line;
    }
    return '';
  };
  try {
    fire('room:joined', {
      roomId: 'r1', roomName: 'main', memberCount: 1,
      members: [{ user_id: 'u1', username: 'spot', is_online: true }],
      history: [
        { id: 77, username: 'bob', content: 'old news', createdAt: new Date().toISOString(), reactions: { heart: 3 } },
        { id: 78, username: 'bob', content: 'nobody cared', createdAt: new Date().toISOString() },
      ],
    });
    await settle();
    assert.ok(chatLine('old news').includes('[<3 3]'), `history line carries its stored count: "${chatLine('old news')}"`);
    assert.ok(!chatLine('nobody cared').includes('['.concat('<3')), 'a message without reactions has no suffix');

    fire('chat:reaction', { messageId: 78, username: 'spot', emoji: '+1', action: 'add', counts: { '+1': 1 } });
    await settle();
    assert.ok(chatLine('nobody cared').includes('[[+] 1]'), `live reaction repaints the line: "${chatLine('nobody cared')}"`);
  } finally {
    fire('disconnect', 'transport close');
  }
}
