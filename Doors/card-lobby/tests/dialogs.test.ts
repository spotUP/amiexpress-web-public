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

  // What matters is that focus MOVED into the window's scrollable area -
  // not which class the SDK builds it from. DocModal uses ScrollableText;
  // the hand-rolled version used ScrollableBox and focused nothing at all.
  const focused: any = h.app.screen.getFocused();
  assert.ok(/Scrollable/.test(String(focused?.constructor?.name)),
    `the text window holds the focus, or Escape reaches nothing (focus was ${focused?.constructor?.name})`);

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

export async function theDoorUsesTheSdkWidgetsRatherThanItsOwn(): Promise<void> {
  // The through line of every defect reported on 2026-09-02: the door built
  // its own version of something the SDK already ships, and the hand-rolled
  // copy was the broken one. These are the pieces that were converted.
  const h = await openDoor();
  const ui = h.app.uiManager;

  const built = (widget: unknown): string => String((widget as any)?.constructor?.name);

  assert.strictEqual(built(ui.overlayShade), 'Overlay',
    'the dialog shade is the SDK Overlay, not a black Box');
  assert.strictEqual(built(ui.statusBar), 'StatusBar',
    'the footer is the SDK StatusBar, not a Box the door writes a joined string into');
  assert.strictEqual(built(ui.lobbyList), 'ListTable',
    'the lobby is the SDK ListTable');

  // And the text window is the SDK's document modal, which is why Escape
  // closes it.
  h.app.dialogManager.setModalActive(false);
  h.app.dialogManager.showTextWindow('Probe', 'body');
  await h.settle();
  const focused: any = h.app.screen.getFocused();
  assert.ok(/Scrollable/.test(String(focused?.constructor?.name)));
  h.escape();
  await h.settle();

  await h.app.shutdown();
  await h.finished;
}

export async function aBoardWithNoBulletinsSaysSo(): Promise<void> {
  // The live trace (2026-09-02): a click picked bulletin #20, BBSApi answered
  // "ENOENT: no such file or directory ... Bulletins/bull20.txt", and the
  // door opened a reader saying "Bulletin not found." - offering a bulletin
  // that was never posted, from a hardcoded table.
  const h = await openDoor();          // its readFile answers null for everything
  const dm = h.app.dialogManager;

  try {
    dm.setModalActive(false);
    await dm.showBulletinsWindow(h.session);
    await h.settle();

    const all = (node: any): any[] => [node, ...((node.children ?? []).flatMap(all))];
    const list = all(h.app.screen).find((c: any) =>
      Array.isArray(c.items) && String(c.options?.label ?? '').includes('Bulletins'));
    assert.ok(!list, 'a board with nothing posted must not offer a list of bulletins to read');

    const text = all(h.app.screen)
      .map((c: any) => (typeof c.getContent === 'function' ? String(c.getContent()) : ''))
      .join(' ');
    assert.ok(/No bulletins have been posted/.test(text), 'it says so instead');
    assert.ok(!/not found/i.test(text), 'and does not report a missing file at the player');

    h.escape();
    await h.settle();
    assert.strictEqual(dm.isModalActive(), false);
  } finally {
    await h.app.shutdown();
    await h.finished;
  }
}

export async function aReaderClosesOnTheKeysPeopleActuallyPress(): Promise<void> {
  // "i can not close the bulletin viewer with mouse or keyboard". The live log
  // shows what was pressed: \r and space, over and over. DocModal closed on
  // ESC/Q/F1 only, and every one of the door's own keys is gated on
  // modalActive - so the door answered nothing at all, which reads as frozen.
  for (const key of ['enter', 'space', 'escape', 'q'] as const) {
    const h = await openDoor();
    const dm = h.app.dialogManager;
    try {
      dm.setModalActive(false);
      dm.showTextWindow('Bulletin #20', 'nothing to see');
      await h.settle();
      assert.strictEqual(dm.isModalActive(), true, `${key}: the reader must be open first`);

      h.app.screen.program.emit('keypress', key === 'space' ? ' ' : '', { name: key, full: key });
      await h.settle();

      assert.strictEqual(dm.isModalActive(), false, `the reader must close on ${key}`);
    } finally {
      await h.app.shutdown();
      await h.finished;
    }
  }
}

export async function aBulletinCanBeReadAndClosed(): Promise<void> {
  // "i can not close the bulletin viewer with mouse or keyboard" (sysop,
  // 2026-09-02), and "there is no bulletin posted either so it cant display
  // it". The escape test above opens the bulletin LIST and closes that; what
  // it never did was PICK one, which is the half the sysop was stuck in.
  const h = await openDoor();
  const dm = h.app.dialogManager;

  try {
    // A board that HAS a bulletin: the list only offers what it can read.
    h.session.bbs.readFile = async () => 'Top of the chip leaders this week.';
    dm.setModalActive(false);
    void dm.showBulletinsWindow(h.session);
    await h.settle();

    // Choose the first bulletin, the way a player does.
    const list = h.app.screen.children
      .flatMap((child: any) => [child, ...(child.children ?? [])])
      .flatMap((child: any) => [child, ...(child.children ?? [])])
      .find((child: any) => Array.isArray(child.items) && child.items.length > 0
        && String(child.options?.label ?? '').includes('Bulletins'));
    assert.ok(list, 'the bulletin list must be on screen');
    list.emit('select', null, 0);
    await h.settle();

    assert.strictEqual(dm.isModalActive(), true,
      'picking a bulletin opens the reader - the board has none, so it says so');

    h.escape();
    await h.settle();

    assert.strictEqual(dm.isModalActive(), false,
      'and Escape closes the reader; the sysop could not close it at all');
  } finally {
    await h.app.shutdown();
    await h.finished;
  }
}
