/**
 * Alt+Enter gives GRANDMASTER the terminal it really has.
 *
 * versusLayout has known how many opponent boards a width holds since the
 * commit that added it, and the render path has built them since the one
 * after - but nothing in this door ever ASKED the terminal to grow, so the
 * wide branch could not be reached by playing. "wire fullscreen into
 * gmaster then" (2026-09-01).
 *
 * Fixed to start, unlike the editors: the menus, the attract screen and the
 * solo playfield are 80-column art, and only the versus screen gains from
 * the room - so a player opts in.
 *
 * Driven, not read: the ANSI editor door shipped a call to the same SDK
 * switch from a code path nobody reached, and its source-pinning test
 * passed while the door threw on start.
 */

import assert from 'assert';
import { GrandmasterApp } from '../app';

interface Recorded { wide: number; fixed: number }

function fakeSession(recorded: Recorded): any {
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => { recorded.wide++; },
    disableWideMode: () => { recorded.fixed++; },
    connectionType: 'web', unicodeCapable: true,
  };
  return {
    bbs,
    user: { id: 1, name: 'sysop', accessLevel: 255 },
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1 },
    params: [],
    close: () => {},
  };
}

function app(recorded: Recorded): any {
  return new (GrandmasterApp as any)(fakeSession(recorded));
}

export async function theDoorOpensAtTheSizeTheBoardServes(): Promise<void> {
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const a = app(recorded);
  try {
    assert.strictEqual(recorded.wide, 0,
      'GRANDMASTER must not take the whole terminal on its own - its menus are 80-column art');
    assert.strictEqual(a.terminalMode.mode(), 'fixed');
  } finally { a.screen.destroy(); }
}

export async function altEnterAsksForTheWholeTerminal(): Promise<void> {
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const a = app(recorded);
  try {
    a.terminalMode.toggle();
    assert.strictEqual(recorded.wide, 1, 'the door asks the terminal to widen');
    assert.strictEqual(a.terminalMode.mode(), 'wide');

    a.terminalMode.toggle();
    assert.strictEqual(a.terminalMode.mode(), 'fixed');
    assert.ok(recorded.fixed >= 1, 'and back to the board’s 80 columns');
  } finally { a.screen.destroy(); }
}

export async function theKeyIsBoundWhileTheDoorIsOpen(): Promise<void> {
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const a = app(recorded);
  try {
    const bound = (a.screen as any).keyHandlers?.get('M-enter');
    assert.ok(bound && bound.length > 0,
      'Alt+Enter must be bound on the screen, not only offered in a menu');
  } finally { a.screen.destroy(); }
}

export async function theScreenIsAllowedToChangeSize(): Promise<void> {
  // Screen pins itself to 80x25 unless it was built responsive, so without
  // this the terminal would widen and the door would keep drawing at 80.
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const a = app(recorded);
  try {
    a.screen.resize(120, 30);
    assert.strictEqual(a.screen.width, 120, 'the screen follows the terminal');
    assert.strictEqual(a.screen.height, 30);
  } finally { a.screen.destroy(); }
}

export async function aWiderTerminalReachesTheVersusLayout(): Promise<void> {
  // The point of the whole thing: the decision that was unreachable at 80
  // columns answers differently once the door can be wide.
  const { versusLayout } = await import('../ui/versus-layout');
  assert.strictEqual(versusLayout(80, 3, 0).fullBoards, 0, 'three opponents are miniatures at 80');
  assert.strictEqual(versusLayout(120, 3, 0).fullBoards, 3, 'and full boards once Alt+Enter is pressed');
}

export async function leavingPutsTheBoardsColumnsBack(): Promise<void> {
  const recorded: Recorded = { wide: 0, fixed: 0 };
  const a = app(recorded);
  a.terminalMode.toggle();          // player went wide
  await a.quit();
  assert.ok(recorded.fixed >= 1,
    'a player returning to the BBS gets its 80 columns back, whatever they chose');
  assert.strictEqual(a.terminalMode, null, 'and the switch is let go');
}

export async function theSettingsMenuOffersTheSizeToo(): Promise<void> {
  // "we also need to add a fullscren toggle in the settings menu"
  // (2026-09-02). A player who never finds Alt+Enter never finds the room.
  const { SettingsScreen } = await import('../ui/settings-screen');
  let mode: 'fixed' | 'wide' = 'fixed';
  const sw = { mode: () => mode, toggle: () => { mode = mode === 'wide' ? 'fixed' : 'wide'; } };
  const state: any = { settings: { rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
    ghostPiece: true, lockDelay: 500, previewCount: 4, musicVolume: 0, sfxVolume: 0,
    keyBindings: {}, gamepadBindings: {}, blockGlow: false, glowIntensity: 0,
    clearStyle: 'instant', clearDirection: 'center', placementEffects: false,
    floatTextMode: 'off', b2bGlowEnabled: false, connectedBlocks: false } };
  const screen: any = { program: { enableMouse() {} }, render() {} };
  const settings: any = new (SettingsScreen as any)(screen, state, { playSfx() {} }, null, sw);

  const items = (): string[] => settings.getMenuItems();
  const line = items().find((i: string) => i.includes('Screen Size'));
  assert.ok(line, 'the settings list must offer the size');
  assert.ok(line!.includes('80x25'), 'and say which one is on');

  // The index the handler answers on must BE the line's index, or the
  // entry toggles something else entirely.
  const index = items().findIndex((i: string) => i.includes('Screen Size'));
  await settings.handleSelection(index, { setItems() {}, select() {} });
  assert.strictEqual(sw.mode(), 'wide', 'choosing it asks for the room');
  assert.ok(items()[index].includes('RESPONSIVE'), 'and the line says so afterwards');
}

export async function saveAndExitIsStillTheLastLine(): Promise<void> {
  // Adding a section moves it. The select handler used to know it by a
  // hardcoded index (renumbered by hand once already); it now asks the row
  // itself, so what this pins is that exactly one row exits and it is the
  // one that says Save & Exit.
  const { SettingsScreen } = await import('../ui/settings-screen');
  const state: any = { settings: { rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
    ghostPiece: true, lockDelay: 500, previewCount: 4, musicVolume: 0, sfxVolume: 0,
    keyBindings: {}, gamepadBindings: {}, blockGlow: false, glowIntensity: 0,
    clearStyle: 'instant', clearDirection: 'center', placementEffects: false,
    floatTextMode: 'off', b2bGlowEnabled: false, connectedBlocks: false } };
  const settings: any = new (SettingsScreen as any)({}, state, { playSfx() {} }, null, null);
  const items: string[] = settings.getMenuItems();
  const index = items.findIndex(i => i.includes('Save & Exit'));
  assert.ok(index >= 0, 'the settings list must offer Save & Exit');
  assert.strictEqual(index, items.length - 1, 'and it must be the last line');

  const rows: any[] = settings.menuRows();
  assert.strictEqual(rows.length, items.length, 'one row per line, no drift');
  const exiting = rows.map((r, i) => (r.exits ? i : -1)).filter(i => i >= 0);
  assert.deepStrictEqual(exiting, [index], 'exactly the Save & Exit row exits');
  assert.ok(!rows[index].run, 'and it is not also a setting');
}
