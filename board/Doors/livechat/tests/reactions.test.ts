/**
 * Reactions travel to the backend (stored with the message) and the counts
 * come back as chat:reaction. /heart, /fire and /-1 are aliases of /react and
 * must react with their own emoji, not the +1 default. Driven through the
 * real door (createApp).
 */

import assert from 'assert';
import { createApp } from '../server';
import { getReactionCounts, seedReactionCounts, clearReactionCounts } from '../features/reaction-store';
import { formatReactionCounts, reactionRowTexts, reactionGlyph, reactionPickerLabel, textIndent, withReactionRows } from '../features/reaction-rows';

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
    assert.strictEqual(formatReactionCounts('4242'), ` [${reactionGlyph('heart')} 2] [${reactionGlyph('fire')} 1]`);
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
 * Stored counts reach the screen on their own row under the message: a late
 * joiner sees them from room:joined, and a chat:reaction repaints them.
 * (Before 2026-11-08 they were an inline ` [<3 3]` suffix on the message line.)
 */
export async function storedReactionCountsShowOnTheirOwnRowUnderTheMessage(): Promise<void> {
  clearReactionCounts();
  const { app, fire, settle } = await openDoor();
  const logLines = (): string[] => {
    for (const el of elements(app.screen)) {
      const text = String(el.getContent?.() ?? el.content ?? '').replace(/\{[^}]*\}/g, '').replace(/\x1b\[[0-9;]*m/g, '');
      const lines = text.split(/\r?\n/);
      if (lines.some(l => l.includes('old news'))) return lines;
    }
    return [];
  };
  const rowsAfter = (needle: string): string[] => {
    const lines = logLines();
    const at = lines.findIndex(l => l.includes(needle));
    return at < 0 ? [] : lines.slice(at + 1);
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
    const old = logLines().find(l => l.includes('old news')) ?? '';
    assert.ok(!old.includes('3'.concat(']')) && !old.includes('<3'), `the message line itself has no counts: "${old}"`);
    const row = rowsAfter('old news')[0] ?? '';
    // Glyph for this caller (unicodeCapable is true in this door): real emoji, then the count.
    assert.ok(/^\s{10,}\S+ 3\s*$/.test(row) && row.includes(reactionGlyph('heart')), `reaction row under old news, indented: "${row}"`);
    assert.ok(!(rowsAfter('nobody cared')[0] ?? '').includes(' 1'), 'a message without reactions has no row');
    assert.ok(logLines().findIndex(l => l.includes('nobody cared')) === logLines().findIndex(l => l.includes('old news')) + 2, 'the next message follows the reaction row');

    fire('chat:reaction', { messageId: 78, username: 'spot', emoji: '+1', action: 'add', counts: { '+1': 1 } });
    await settle();
    const live = rowsAfter('nobody cared')[0] ?? '';
    assert.ok(live.includes(reactionGlyph('+1')) && /1\s*$/.test(live), `live reaction paints a row: "${live}"`);
  } finally {
    clearReactionCounts();
    fire('disconnect', 'transport close');
  }
}

/** Glyphs: ASCII faces for byte callers, real emoji (2 columns each) for UTF-8 callers. */
export async function glyphsFollowTheCallersCharset(): Promise<void> {
  const ascii = ['+1', '-1', 'heart', 'fire', 'laugh', 'wow', 'sad', 'angry'].map(n => reactionGlyph(n, false));
  assert.deepStrictEqual(ascii, [':)', ':/', '<3', '*', ':D', ':O', ':(', '>(']);
  assert.strictEqual(reactionGlyph('+1', true), '\u{1F44D}');
  assert.strictEqual(reactionGlyph('heart', true), '\u2764\uFE0F');
  assert.strictEqual(reactionGlyph('mystery', true), 'mystery', 'an unknown name shows as the name');
  assert.strictEqual(reactionPickerLabel(0, false), ':)  Thumbs Up');
  assert.strictEqual(reactionPickerLabel(3, false), '*   Fire');
  assert.strictEqual(reactionPickerLabel(7, false), '>(  Angry');
}

/** Row layout and wrap: indent, two-space gaps, new row at the same indent, emoji count as 2 columns. */
export async function reactionRowsIndentAndWrap(): Promise<void> {
  assert.deepStrictEqual(reactionRowTexts({}, 8, 40, false), [], 'no row when nothing has a count');
  assert.deepStrictEqual(reactionRowTexts({ heart: 0 }, 8, 40, false), [], 'a zero count is no reaction');
  assert.deepStrictEqual(reactionRowTexts({ heart: 2, fire: 1 }, 8, 40, false), ['        <3 2  * 1']);
  // Width 20, indent 8: "<3 2" ends at col 12, "  * 1" at 17, "  :D 10" would pass 20 -> new row at the same indent.
  assert.deepStrictEqual(reactionRowTexts({ heart: 2, fire: 1, laugh: 10 }, 8, 20, false),
    ['        <3 2  * 1', '        :D 10']);
  // Indent is capped at half the width.
  assert.deepStrictEqual(reactionRowTexts({ heart: 1 }, 30, 20, false), ['          <3 1']);
  // Emoji are 2 columns: indent 4, three items of 4 columns each -> 4+4, +2+4 = 14, third at 20 > 18 wraps.
  const rows = reactionRowTexts({ '+1': 1, fire: 2, laugh: 3 }, 4, 18, true);
  assert.strictEqual(rows.length, 2, JSON.stringify(rows));
  assert.ok(rows[1].startsWith('    ') && rows[1].includes('\u{1F602} 3'));
  // Indent comes off the painted first row: "[time] <nick> ".
  assert.strictEqual(textIndent('{x-fg}[12:30:45]{/x-fg} <{c-fg}bob{/c-fg}> hello'), 17);
}

/** The display list: rows after the LAST row of a message, carrying its id, with source rows mapped. */
export async function reactionRowsAreCountedInTheDisplayList(): Promise<void> {
  clearReactionCounts();
  seedReactionCounts([{ id: 5, reactions: { heart: 1 } }]);
  try {
    const raw = ['[t] <bob> one', '   two', '[t] <amy> three'];
    const d = withReactionRows(raw, raw, ['5', '5', '6'], 40, 'cyan', false);
    assert.strictEqual(d.raw.length, 4);
    assert.deepStrictEqual(d.ids, ['5', '5', '5', '6'], 'the reaction row carries its message id (click target)');
    assert.deepStrictEqual(d.at, [0, 1, 3], 'the row after it moves down by one');
    assert.ok(d.raw[2].includes('<3 1'));
  } finally {
    clearReactionCounts();
  }
}

/** React opens the picker (8 items, spec order); Enter sends that reaction; Escape closes without sending. */
export async function reactOpensThePickerAndSendsTheChosenReaction(): Promise<void> {
  const { createContextMenus } = await import('../features/context-menus');
  const { app, fire } = await openDoor();
  try {
    const sent: Emit[] = [];
    const said: string[] = [];
    const sock = { connected: true, emit: (event: string, payload: any) => { sent.push({ event, payload }); } };
    const { contextMenu, reactionPicker, showContextMenu } = createContextMenus(app.screen, { focus: () => {} }, () => {}, () => {}, m => said.push(m), sock, { currentRoom: () => 'r1' });
    showContextMenu(2, 3, 'chat', '4242');
    contextMenu.emit('select', 'React', 2);
    assert.strictEqual(sent.length, 0, 'React alone sends nothing: it opens the picker');
    assert.strictEqual(reactionPicker.hidden, false, 'picker is shown');
    assert.strictEqual((reactionPicker as any).items.length, 8);
    const labels: string[] = (reactionPicker as any).items.map((i: any) => String(i.content ?? i));
    assert.ok(/Heart$/.test(labels[2]) && /Thumbs Up$/.test(labels[0]) && /Angry$/.test(labels[7]), labels.join('|'));
    reactionPicker.emit('select', 'x', 2);
    assert.deepStrictEqual(sent.pop(), { event: 'chat:react', payload: { roomId: 'r1', messageId: '4242', emoji: 'heart' } });
    assert.strictEqual(said.pop(), 'Reaction sent.');
    assert.strictEqual(reactionPicker.hidden, true);

    showContextMenu(2, 3, 'chat', '4242');
    contextMenu.emit('select', 'React', 2);
    reactionPicker.emit('keypress', undefined, { name: 'escape' });
    assert.strictEqual(sent.length, 0, 'Escape sends nothing');

    sock.connected = false;
    showContextMenu(2, 3, 'chat', '4242');
    contextMenu.emit('select', 'React', 2);
    reactionPicker.emit('select', 'x', 7);
    assert.strictEqual(sent.length, 0);
    assert.strictEqual(said.pop(), 'The reaction did not go through.');
  } finally {
    fire('disconnect', 'transport close');
  }
}
