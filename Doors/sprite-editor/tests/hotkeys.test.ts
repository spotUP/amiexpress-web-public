/**
 * Every hotkey this door binds, checked against everything that already
 * owns a key.
 *
 * "make sure you dont clash with existing hotkeys, there are many" - and
 * they are not all in this repo: the EDITOR owns a set, and the BROWSER
 * owns another that no page can take back. A clash is silent (two things
 * happen, or the wrong one does) and it is exactly the kind of thing that
 * is fine the day it is written and wrong three commands later, so the
 * reserved lists are written down here and the door's own table is checked
 * against them.
 *
 * The other half of the ask - "all menu items needs to show hotkeys as
 * well" - is checked from the same table: a key that is bound and not
 * shown is a key nobody will ever find.
 */

import assert from 'assert';
import { SpriteStudioDoor } from '../studio';
import type { StudioCommand } from '../studio';

/**
 * Keys the ANSI editor widget handles itself, from its own source
 * (setupKeyHandlers / handleDrawKey / handleTextKey in
 * sdk/engines/ui/blessed/widgets/ansi-editor.ts).
 */
const EDITOR_KEYS = [
  'C-s',   // Save
  'C-m',   // Text/Draw mode
  'C-z',   // Undo
  'C-y',   // Redo
  'C-h',   // half-block sub-row
  'C-d',   // delete line, in text mode
  'M-c',   // foreground colour picker
  'M-b',   // background colour picker
  'M-h',   // half-block brush
  'tab', 'escape', 'enter', 'return', 'backspace', 'space', 'delete',
  ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`),
];

/**
 * Keys the browser keeps for itself whatever the terminal asks. Chrome
 * will not let a page prevent these, so a door that binds one gets a new
 * tab instead of a new frame.
 */
const BROWSER_KEYS = ['C-n', 'C-t', 'C-w'];

/** Keys the plain editor uses for cursor work, which arrive as bare names. */
const EDITOR_TEXT_KEYS = ['home', 'end', 'pageup', 'pagedown', 'up', 'down', 'left', 'right'];

function commands(): Record<string, StudioCommand> {
  return (new SpriteStudioDoor() as any).commands();
}

function boundKeys(): string[] {
  return Object.values(commands()).map(c => c.key).filter(Boolean) as string[];
}

export async function noHotkeyCollidesWithTheEditorsOwn(): Promise<void> {
  const editor = new Set(EDITOR_KEYS);
  for (const key of boundKeys()) {
    assert.ok(!editor.has(key),
      `${key} is the editor's own - binding it here means both things happen`);
  }
}

export async function noHotkeyIsOneTheBrowserKeeps(): Promise<void> {
  const browser = new Set(BROWSER_KEYS);
  for (const key of boundKeys()) {
    assert.ok(!browser.has(key),
      `${key} never reaches the terminal - the browser takes it first`);
  }
}

export async function noHotkeyIsAPrintableCharacter(): Promise<void> {
  // Draw mode types printables onto the canvas, so a bare letter would run
  // the command AND paint the letter.
  for (const key of boundKeys()) {
    assert.ok(/^(C-|M-|S-)/.test(key),
      `${key} has no modifier - in draw mode it would paint itself onto the art`);
  }
}

export async function anArrowCombinationDoesNotAlsoMoveTheCursor(): Promise<void> {
  // The editor's draw handler reads the arrow's NAME without looking at
  // Ctrl, so a Ctrl+arrow binding has to report the key as handled or the
  // cursor walks as well. bindHotkeys returns true for exactly that.
  const studio: any = new SpriteStudioDoor();
  const bound: Array<[string[], () => unknown]> = [];
  studio.screen = { key: (keys: string[], h: () => unknown) => bound.push([keys, h]), render() {} };
  studio.bindHotkeys();

  const arrows = bound.filter(([keys]) => keys.some(k => EDITOR_TEXT_KEYS.some(t => k.endsWith(t))));
  assert.ok(arrows.length > 0, 'there are arrow combinations to check');
  for (const [keys, handler] of bound) {
    // A command that opens a requester arms the dialog guard and leaves it
    // armed until the requester closes - which is right, and would make
    // every key after it in this loop report "not handled" for that reason
    // rather than the one under test.
    studio.screen.dialogOpen = false;
    assert.strictEqual(handler(), true, `${keys[0]} must report itself handled`);
  }
}

export async function noTwoCommandsShareAKey(): Promise<void> {
  const seen = new Map<string, string>();
  for (const [id, cmd] of Object.entries(commands())) {
    if (!cmd.key) continue;
    const other = seen.get(cmd.key);
    assert.ok(!other, `${cmd.key} is on both ${other} and ${id}`);
    seen.set(cmd.key, id);
  }
}

export async function everyBoundKeyIsPrintedInAMenu(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  const labels: string[] = studio.buildMenus()
    .flatMap((m: any) => m.items)
    .filter((i: any) => !i.separator)
    .map((i: any) => i.label);

  for (const cmd of Object.values(commands())) {
    if (!cmd.key) continue;
    const shown = cmd.show ?? cmd.key;
    assert.ok(labels.some(l => l.startsWith(cmd.label) && l.endsWith(shown)),
      `"${cmd.label}" is bound to ${shown} and no menu says so`);
  }
}

export async function everyMenuItemThatNamesAKeyIsBoundToIt(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  const bound = new Set(Object.values(commands()).map(c => c.show ?? c.key).filter(Boolean));
  const labels: string[] = studio.buildMenus()
    .flatMap((m: any) => m.items)
    .filter((i: any) => !i.separator)
    .map((i: any) => i.label);

  for (const label of labels) {
    const trailing = /\s(C-[A-Za-z]+|A-[A-Za-z]+|S-[A-Za-z]+)$/.exec(label);
    if (!trailing) continue;
    assert.ok(bound.has(trailing[1]),
      `the menu promises ${trailing[1]} for "${label.trim()}" and nothing binds it`);
  }
}

export async function theEditorIsNeverGivenTheKeyWhileADialogIsUp(): Promise<void> {
  const studio: any = new SpriteStudioDoor();
  const bound: Array<[string[], () => unknown]> = [];
  let ran = 0;
  studio.screen = {
    key: (keys: string[], h: () => unknown) => bound.push([keys, h]),
    render() {}, dialogOpen: true,
  };
  studio.step = () => { ran++; };
  studio.bindHotkeys();
  for (const [, handler] of bound) handler();
  assert.strictEqual(ran, 0, 'a requester owns the keyboard while it is up');
}

export async function todaysNewCommandsAllHaveAKey(): Promise<void> {
  // What was added on 2026-09-01: the footer strip's controls, and the
  // frame ends it introduced.
  const cmd = commands();
  for (const id of ['firstFrame', 'lastFrame', 'newFrame', 'dupFrame', 'delFrame',
    'moveEarlier', 'moveLater', 'zoomCycle', 'play', 'toggleLoop', 'slower', 'faster']) {
    assert.ok(cmd[id]?.key, `${id} is reachable by mouse or menu only`);
  }
}
