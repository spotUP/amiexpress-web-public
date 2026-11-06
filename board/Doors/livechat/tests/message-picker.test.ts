/**
 * Message pick mode (plan L3): Up on an empty line, or a bare /pin /love ...,
 * selects a message with the arrow keys instead of typing its id.
 *
 * The reachability test drives the real door (createApp) with real key events;
 * the sentinel is the input label and the highlighted log content, which only
 * pick mode produces. /pin is the command under test because its emit
 * (chat:pin:add) exists today; /love goes through the same startFromCommand.
 */

import assert from 'assert';
import { createApp } from '../server';
import { messageRows, moveSelection, newestMessageRow, createMessagePicker } from '../features/message-picker';

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
    roomId: 'r1', roomName: 'main', memberCount: 2,
    members: [{ user_id: 'u1', username: 'spot', is_online: true }, { user_id: 'u2', username: 'bob', is_online: true }],
  });
  await settle();
  return { app, emits, fire, settle };
}

const everything = (node: any): any[] => [node, ...((node.children ?? []).flatMap(everything))];

function key(screen: any, name: string): void {
  if (name === 'enter') {
    screen.program.emit('keypress', '\r', { name: 'return', full: 'return', sequence: '\r' });
    screen.program.emit('keypress', '\r', { name: 'enter', full: 'enter', sequence: '\r' });
    return;
  }
  screen.program.emit('keypress', undefined, { name, full: name, sequence: '' });
}

const chatMsg = (id: string, content: string) =>
  ({ id, channelId: 'r1', userId: 'u2', username: 'bob', content, createdAt: new Date() });

export async function arrowKeysPickTheMessageForAPinCommand(): Promise<void> {
  const { app, emits, fire, settle } = await openDoor();
  try {
    const screen = app.screen;
    const input = everything(screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
    fire('chat:message', chatMsg('m-first', 'first message'));
    fire('chat:message', chatMsg('m-second', 'second message'));
    await settle();
    input.focus();
    input.setValue('');

    // Sentinel: nothing is picked before the command.
    assert.ok(!String(input.options?.label ?? input._label?.content ?? '').includes('PICK'));
    input.emit('submit', '/pin');
    await settle();
    const label = () => String(input._label?.content ?? input.options?.label ?? '');
    assert.ok(label().includes('PICK MESSAGE'), `pick mode must show its label, got: ${label()}`);
    assert.strictEqual(emits.filter(e => e.event === 'chat:pin:add').length, 0, 'a bare /pin must not pin anything');

    const chatLog = everything(screen).find(e => e.listeners('rightclick').length > 0);
    assert.ok(/-bg\}[^{]*second message/.test(String(chatLog.getContent())), 'the picked message is an inverse bar');
    assert.ok(!/-bg\}[^{]*first message/.test(String(chatLog.getContent())), 'only the picked message is');
    key(screen, 'up');
    key(screen, 'enter');
    await settle();
    const pin = emits.find(e => e.event === 'chat:pin:add');
    assert.ok(pin, 'Enter must dispatch /pin with the picked id');
    assert.strictEqual(pin!.payload.messageId, 'm-first');
    assert.ok(!label().includes('PICK'), 'pick mode ends on Enter');
  } finally {
    fire('disconnect', 'transport close');
  }
}

export async function upOnAnEmptyLineEntersPickModeAndEscLeaves(): Promise<void> {
  const { app, fire, settle } = await openDoor();
  try {
    const screen = app.screen;
    const input = everything(screen).find(e => e.type === 'textarea' && e.listeners('submit').length > 0);
    const chatLog = everything(screen).find(e => e.listeners('rightclick').length > 0);
    fire('chat:message', chatMsg('m-1', 'alpha'));
    await settle();
    input.focus();
    input.setValue('');
    const label = () => String(input._label?.content ?? input.options?.label ?? '');
    key(screen, 'up');
    assert.ok(label().includes('PICK MESSAGE'), `Up on an empty line enters pick mode: ${label()}`);
    key(screen, 'escape');
    assert.ok(!label().includes('PICK'), 'Esc cancels');
    // With text typed, Up is history, not pick mode.
    input.setValue('typed');
    key(screen, 'up');
    assert.ok(!label().includes('PICK'), 'Up with text typed must not enter pick mode');
  } finally {
    fire('disconnect', 'transport close');
  }
}

// ----- pure: movement over display rows -----

export async function moveSkipsNullRowsAndJumpsWholeMessages(): Promise<void> {
  //            0       1     2     3      4     5      6
  const ids = [null, 'a', 'a', null, 'b', null, 'c'];
  assert.strictEqual(newestMessageRow(ids), 6);
  assert.deepStrictEqual(messageRows(ids, 2), { first: 1, last: 2 });
  assert.strictEqual(messageRows(ids, 3), null);
  assert.strictEqual(moveSelection(ids, 6, -1), 4, 'c -> b over a null row');
  assert.strictEqual(moveSelection(ids, 4, -1), 1, 'b -> the FIRST row of the two-row message a');
  assert.strictEqual(moveSelection(ids, 1, -1), 1, 'stays at the oldest');
  assert.strictEqual(moveSelection(ids, 1, 1), 4, 'a (two rows) -> b in one step');
  assert.strictEqual(moveSelection(ids, 6, 1), 6, 'stays at the newest');
  assert.strictEqual(newestMessageRow([null, null]), null);

  const calls: string[] = [];
  const picker = createMessagePicker({
    ids: () => ids,
    onChange: () => calls.push('change'),
    onConfirm: (a, id) => calls.push(`${a.kind === 'command' ? a.command : 'menu'}:${id}`),
  });
  assert.ok(picker.startFromCommand('/react heart'), 'react with only an emoji picks');
  assert.ok(!picker.state.active || picker.state.rowIndex === 6);
  picker.move(-1);
  picker.confirm();
  assert.strictEqual(calls[calls.length - 1], 'react:b');
  assert.ok(!picker.startFromCommand('/love 12'), 'an id given means no pick mode');
  assert.ok(!picker.startFromCommand('/hello'), 'other commands are untouched');
}
