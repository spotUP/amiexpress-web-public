/**
 * Every dialog takes focus, closes on Escape, and does not black out the board.
 *
 * Reported 2026-09-02: "i tried to view bulletins in cardlobby it found none
 * and it shows i dialog i can't exit", and "many dialogs open up on a black
 * screen instead of overlayed and i cant exit them".
 *
 * Two causes, both a level below the door:
 *
 *   Element defaults to `focusable: false` and focus() used to return
 *   silently for such a widget, so the text windows kept the focus they had
 *   and their own key(['escape','q']) handlers never ran. Nothing threw.
 *
 *   The dialog shade was a full-screen Box filled with solid black rather
 *   than the SDK's Overlay, so a modal wiped out the board behind it.
 *
 * Driven, not read: each dialog is opened against a real screen, and Escape
 * is delivered through the program the way a keypress arrives.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-dialogs-'));

async function openDoor(): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    readFile: async () => null, writeFile: async () => {},
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 25, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };
  const app: any = new CardLobbyApp(session);
  const finished = app.run();
  await new Promise((r) => setTimeout(r, 1500));
  return {
    app, finished, session,
    escape: () => app.screen.program.emit('keypress', '\x1b', { name: 'escape', full: 'escape' }),
    settle: () => new Promise((r) => setTimeout(r, 200)),
  };
}

export async function everyDialogClosesOnEscape(): Promise<void> {
  const h = await openDoor();
  const dm = h.app.dialogManager;

  const openers: Array<[string, () => void]> = [
    ['profile', () => dm.showProfileWindow(h.app.currentProfile)],
    ['achievements', () => dm.showAchievementsWindow(h.app.currentProfile)],
    ['leaderboard', () => dm.showLeaderboardWindow(h.app.profiles)],
    ['bulletins', () => void dm.showBulletinsWindow(h.session)],
    ['list', () => void dm.showListDialog('Pick', ['one', 'two'])],
    ['message', () => void dm.showMessageDialog('Note', 'hello')],
    ['yes/no', () => void dm.showYesNoDialog('Sure?', 'really?')],
    ['prompt', () => void dm.showPromptDialog('Name', 'enter', 'x')],
  ];

  const stuck: string[] = [];
  for (const [name, open] of openers) {
    dm.setModalActive(false);
    open();
    await h.settle();
    h.escape();
    await h.settle();
    if (dm.isModalActive()) stuck.push(name);
    dm.setModalActive(false);
  }

  assert.deepStrictEqual(stuck, [], 'these dialogs could not be closed with Escape');

  await h.app.shutdown();
  await h.finished;
}

export async function aTextWindowTakesTheFocusItBindsKeysOn(): Promise<void> {
  // The specific defect: focus() on a widget built without focusable: true
  // used to do nothing at all, so the window's own key handlers were dead.
  const h = await openDoor();
  const dm = h.app.dialogManager;

  dm.setModalActive(false);
  dm.showTextWindow('Probe', 'body');
  await h.settle();

  const focused: any = h.app.screen.getFocused();
  assert.strictEqual(focused?.constructor?.name, 'ScrollableBox',
    'the text window holds the focus, or Escape reaches nothing');

  h.escape();
  await h.settle();
  assert.strictEqual(dm.isModalActive(), false);

  await h.app.shutdown();
  await h.finished;
}

export async function theDialogShadeDoesNotPaintTheBoardBlack(): Promise<void> {
  const h = await openDoor();
  const shade: any = h.app.uiManager.overlayShade;

  assert.strictEqual(shade.constructor?.name, 'Overlay',
    'the shade is the SDK Overlay, not a black box of the door\'s own');
  assert.notStrictEqual(shade.style?.bg, 'black',
    'a modal must not wipe out the board behind it');

  await h.app.shutdown();
  await h.finished;
}
