/**
 * The door as the board's full-screen message editor (SysCmd FULLEDIT).
 *
 * express.e's edit() (10106-10141) hands the editor Node<n>/Work/msg.i to
 * start from and reads back Node<n>/Work/msg when the editor is gone
 * (the sysop, 2026-09-29: "we have ansi-edit"). Driven through start().
 */

import assert from 'assert';
import { ANSIEditorDoor, fullEditFiles } from '../index';

function fakeContext(files: Map<string, string>, doorCommand: string) {
  let closed = 0;
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    connectionType: 'web', unicodeCapable: true,
    fileExists: async (f: string) => files.has(f),
    readFile: async (f: string) => files.get(f) ?? null,
    writeFile: async (f: string, content: string) => { files.set(f, content); return true; },
  };
  return {
    ctx: {
      bbs, nodeId: 3, bbsSession: { doorCommand },
      storage: { keys: async () => [], load: async () => null, save: async () => {}, delete: async () => {} },
      user: { name: 'caller', secLevel: 10 },
      close: () => { closed++; },
    } as any,
    closedCount: () => closed,
  };
}

async function started(ctx: any): Promise<any> {
  const door: any = new (ANSIEditorDoor as any)();
  door.setContext(ctx);
  await Promise.race([door.start(), new Promise(r => setTimeout(r, 250))]);
  return door;
}

export async function asFullEditItOpensTheQuoteInTextMode(): Promise<void> {
  const files = new Map([[fullEditFiles(3).include, 'the quoted line\n']]);
  const { ctx } = fakeContext(files, 'FULLEDIT');
  const door = await started(ctx);
  try {
    assert.strictEqual(door.fullEdit, true);
    assert.strictEqual(door.editor.mode, 'text', 'a message is typed, not drawn');
    assert.ok(door.editor.getContent().includes('the quoted line'), 'it starts from msg.i');
  } finally {
    door.cleanup?.();
  }
}

export async function savingWritesMsgAndLeaves(): Promise<void> {
  const files = new Map<string, string>();
  const { ctx, closedCount } = fakeContext(files, 'FULLEDIT');
  const door = await started(ctx);
  await door.editor.onSaveCallback('hello board\nsecond line');
  assert.strictEqual(files.get(fullEditFiles(3).result), 'hello board\nsecond line');
  assert.ok(closedCount() > 0, 'the door ends so the board can post the message');
}

export async function runAsItselfItIsTheArtEditorStill(): Promise<void> {
  const { ctx } = fakeContext(new Map(), 'ANSI-EDIT');
  const door = await started(ctx);
  try {
    assert.strictEqual(door.fullEdit, false);
    assert.strictEqual(door.editor.mode, 'draw');
  } finally {
    door.cleanup?.();
  }
}
