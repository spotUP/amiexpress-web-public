/**
 * "The emoji picker inserts two emojis per pick" (the sysop, 2026-11-06).
 *
 * Driven through the real door (createApp): F4 opens the picker, the keyboard
 * or the mouse picks a row, and the message box must hold exactly one emoji.
 */

import assert from 'assert';
import { createApp } from '../server';

async function openDoor(): Promise<any> {
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'spot', nodeId: 1, secLevel: 255, tempData: {}, socket },
    user: { id: 1, name: 'spot', accessLevel: 255 },
  };
  return createApp(session);
}

function everything(node: any): any[] {
  return [node, ...((node.children ?? []).flatMap(everything))];
}

/** A terminal's Enter reaches the widgets as 'return' and then 'enter' (blessed program). */
function key(screen: any, name: string): void {
  if (name === 'enter') {
    screen.program.emit('keypress', '\r', { name: 'return', full: 'return', sequence: '\r' });
    screen.program.emit('keypress', '\r', { name: 'enter', full: 'enter', sequence: '\r' });
    return;
  }
  screen.program.emit('keypress', undefined, { name, full: name, sequence: '' });
}

function click(screen: any, x: number, y: number): void {
  screen.program.emit('mouse', { x, y, action: 'mousedown', button: 'left', shift: false, ctrl: false, meta: false });
  screen.program.emit('mouse', { x, y, action: 'mouseup', button: 'left', shift: false, ctrl: false, meta: false });
}

const inputBoxOf = (screen: any): any =>
  everything(screen).find((el: any) => String(el.options?.label ?? '').trim() === 'Message');

/** The picker's item list: the List inside the visible CategoryPicker. */
const itemListOf = (screen: any): any =>
  everything(screen).find((el: any) => el._itemList && el.visible)?._itemList;

/** How many emoji the box holds: each insert is one `:code: ` token (decision D1). */
function emojiCount(value: string): number {
  return (value.match(/:\w+: /g) ?? []).length;
}

async function pick(how: 'enter' | 'click'): Promise<string> {
  const app: any = await openDoor();
  try {
    const screen = app.screen;
    const input = inputBoxOf(screen);
    assert.ok(input, 'the message box exists');
    input.setValue('');
    key(screen, 'f4');
    screen.render();
    const list = itemListOf(screen);
    assert.ok(list, 'F4 opens the picker');
    list.focus();
    if (how === 'enter') {
      key(screen, 'enter');
    } else {
      click(screen, list.aleft + 4, list.atop + 2);
    }
    await new Promise(resolve => setTimeout(resolve, 150));
    return String(input.getValue());
  } finally {
    app.screen.destroy?.();
  }
}

export async function enterInThePickerInsertsExactlyOneEmoji(): Promise<void> {
  const value = await pick('enter');
  assert.strictEqual(emojiCount(value), 1, `one :code: emoji after Enter, got ${JSON.stringify(value)}`);
}

export async function clickingARowInsertsExactlyOneEmoji(): Promise<void> {
  const value = await pick('click');
  assert.strictEqual(emojiCount(value), 1, `one :code: emoji after a click, got ${JSON.stringify(value)}`);
}
