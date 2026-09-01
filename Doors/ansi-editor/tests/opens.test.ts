/**
 * The door OPENS. Driven, not read.
 *
 * Reported 2026-09-01 as "livechat has issues opening fullscreen responsive
 * mode in the bbs like sprited had, probably the same for all doors we
 * added fullscreen toggle to" - and this door was worse than that: the
 * 80x25 / responsive switch was created inside the sysop's BBS-files
 * browser, while the editor's own menu reads `this.terminalMode!` the
 * moment the door starts. A caller who never opened that dialog - which is
 * every caller - got a TypeError before the editor was built.
 *
 * backport.test.ts asserts the SOURCE mentions createTerminalModeSwitch,
 * and it passed the whole time. A source pin proves a call exists, not that
 * it runs, so this file starts the door instead.
 */

import assert from 'assert';
import { ANSIEditorDoor } from '../index';

interface Recorded { wide: number; fixed: number }

function fakeContext(recorded: Recorded) {
  const bbs: any = {
    write: () => {},
    writeLine: () => {},
    on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => { recorded.wide++; },
    disableWideMode: () => { recorded.fixed++; },
    connectionType: 'web',
    unicodeCapable: true,
  };
  return {
    bbs,
    storage: {
      keys: async () => [], load: async () => null,
      save: async () => {}, delete: async () => {},
    },
    user: { name: 'sysop', accessLevel: 255 },
    close: () => {},
  } as any;
}

/** Start the door, give it a moment, hand back what it built. */
async function started(recorded: Recorded): Promise<any> {
  const door: any = new (ANSIEditorDoor as any)();
  door.setContext(fakeContext(recorded));
  // start() resolves only when the door exits, so race it against a tick:
  // everything under test happens synchronously before the wait.
  await Promise.race([door.start(), new Promise(r => setTimeout(r, 250))]);
  return door;
}

export async function theDoorOpensWithoutThrowing(): Promise<void> {
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const door = await started(recorded);
  try {
    assert.ok(door.editor, 'the editor must exist after start()');
    assert.ok(door.terminalMode, 'and the size switch with it - the editor menu reads it');
  } finally {
    door.cleanup?.();
  }
}

export async function openingAsksTheTerminalToWiden(): Promise<void> {
  // Responsive is three things and this is the first: BBSTerminal is fixed
  // at 80x25 until a door asks otherwise, so a door that only sizes its own
  // widgets to 100% fills a terminal that never grew.
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const door = await started(recorded);
  try {
    assert.strictEqual(recorded.wide, 1, 'the door asks for the caller’s real terminal on open');
  } finally {
    door.cleanup?.();
  }
}

export async function leavingPutsTheBoardsEightyColumnsBack(): Promise<void> {
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const door = await started(recorded);
  door.cleanup?.();
  assert.ok(recorded.fixed >= 1, 'a caller returning to the BBS gets its 80 columns back');
}

export async function theSizeToggleIsInTheEditorsOwnMenu(): Promise<void> {
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const door = await started(recorded);
  try {
    const menus = (door.editor as any).extraMenus ?? [];
    const labels = menus.flatMap((m: any) => m.items.map((i: any) => String(i.label)));
    assert.ok(labels.some((l: string) => l.includes('80x25')),
      `the size toggle must be reachable from the menu bar; saw ${JSON.stringify(labels)}`);
  } finally {
    door.cleanup?.();
  }
}
