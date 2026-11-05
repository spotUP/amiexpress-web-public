/**
 * A picker inside TETRIS ATTACK is a MENU, and the phone has to be told.
 *
 * A phone in gesture mode reads a swipe as a piece move while a playfield is
 * up and as a menu step while a menu is - so the door announces which it is
 * showing (`setInputMode`). startTetrisAttack announced 'game' the moment it
 * was entered and then put two pickers up under that announcement, so every
 * swipe on the mode list moved a piece that was not there: "i cant swipe in
 * gmaster on the select mode dialog" (2026-09-06).
 *
 * The obvious fix - set `currentScreen = 'menu'` around the picker - is the
 * one that must not be made. That field also tells `showMainMenu` whether a
 * sub-screen ran, and setting it drops the door out of its menu loop; it was
 * made once and the door exited on game over.
 *
 * Driven through the real entry point, not pinned in source: only the picker
 * is stubbed, and it returns "back" so the flow unwinds the way a player
 * leaving the mode list does.
 */

import assert from 'assert';
import { GrandmasterApp } from '../../app';

function fakeSession(announced: string[]): any {
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    setInputMode: (mode: string) => { announced.push(mode); },
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

export async function theModePickerIsAnnouncedAsAMenu(): Promise<void> {
  const announced: string[] = [];
  const app: any = new (GrandmasterApp as any)(fakeSession(announced));

  let modeDuringPicker: string | undefined;
  app.chooseTetrisAttackMode = async () => {
    modeDuringPicker = announced[announced.length - 1];
    return null; // "back" - unwind the way a player leaving the list does
  };

  await app.startTetrisAttack();

  assert.strictEqual(
    modeDuringPicker, 'menu',
    'the terminal must be in menu mode while the mode list is on the glass, '
    + 'or a swipe moves a piece instead of choosing a mode',
  );
}

/**
 * And the playfield gets its own mode back. Announcing 'menu' and leaving it
 * there would break the game the picker leads into - a tap would be ENTER
 * rather than a swap.
 */
export async function thePlayfieldModeIsRestoredAfterThePicker(): Promise<void> {
  const announced: string[] = [];
  const app: any = new (GrandmasterApp as any)(fakeSession(announced));

  app.chooseTetrisAttackMode = async () => null;
  await app.startTetrisAttack();

  assert.strictEqual(
    announced[announced.length - 1], 'game',
    'after the picker closes the flow is a game again',
  );
  assert.ok(
    announced.includes('menu'),
    'and it did announce the picker - a test that only sees "game" proves nothing',
  );
}

/**
 * The trap this fix had to avoid: the picker must not touch `currentScreen`,
 * because showMainMenu repaints only when it is not 'menu'. If the flow ends
 * on 'menu' the door falls out of its menu loop and quits.
 */
export async function thePickerDoesNotDropTheDoorOutOfItsMenuLoop(): Promise<void> {
  const announced: string[] = [];
  const app: any = new (GrandmasterApp as any)(fakeSession(announced));

  app.chooseTetrisAttackMode = async () => null;
  await app.startTetrisAttack();

  assert.strictEqual(
    app.currentScreen, 'game',
    'startTetrisAttack returns with a non-menu screen, which is what makes '
    + 'showMainMenu repaint instead of letting the door exit',
  );
}
