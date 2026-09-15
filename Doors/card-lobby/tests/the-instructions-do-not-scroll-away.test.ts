/**
 * WHAT TO PRESS STAYS ON SCREEN.
 *
 * "what am i supposed to do here?" (sysop, 2026-09-15) - at a table whose
 * legend was correct, generated, and two rows above the visible area.
 *
 * The activity panel is a feed: it follows the newest line, which is right
 * for events and wrong for instructions. A game writes its keys at the TOP
 * (`TableGameModule.activityLines`), and in a three-row panel the event log
 * underneath pushed them straight out of sight - so the caller read "Swap,
 * then play." and had no idea which key did that.
 *
 * A body that carries a game's instructions is pinned to its first line.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('pin');

async function openApp(): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 106, height: 30 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = new CardLobbyApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 30, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  } as any);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));
  return app;
}

const MANY_EVENTS = Array.from({ length: 30 }, (_, i) => `event ${i}`);

export async function aBodyWithInstructionsIsPinnedToItsFirstLine(): Promise<void> {
  const app = await openApp();
  try {
    // Give the panel a real height, or nothing scrolls and the test proves
    // nothing: an unlaid widget has no scroll height to move within.
    app.uiManager.activityContent.height = 3;
    app.uiManager.activityContent.width = 30;

    /*
     * The panel only scrolls once it has been laid out, and in a headless
     * test it has not - so the two calls are compared against each other
     * rather than against an absolute, which is the property that matters:
     * a pinned body sits at or above an unpinned one, never below.
     */
    app.uiManager.setActivityBody(MANY_EVENTS);
    const followed = app.uiManager.activityContent.getScroll();

    app.uiManager.setActivityBody(['1-3 hand  4-6 table  X ready', ...MANY_EVENTS], true);
    const pinned = app.uiManager.activityContent.getScroll();

    assert.strictEqual(pinned, 0, 'a pinned body shows its first line');
    assert.ok(pinned <= followed,
      `pinned (${pinned}) is never further down the feed than unpinned (${followed})`);
  } finally { app.screen?.destroy?.(); }
}

export async function theSkitgubbeTableSaysWhatToPress(): Promise<void> {
  // End to end: deal a real table and read the panel the caller reads.
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 96, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
      smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
      minPlayers: 2, maxPlayers: 3, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
      autoStart: false, isPrivate: false, observers: [],
      players: [{
        userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
        role: 'player', joinedAt: Date.now(), isBot: false,
      }],
    };
    app.syncBotsForTable(table);
    app.lobby.tables.unshift(table);
    app.currentProfile.currentTableId = 96;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();

    app.updateActivityPanel();
    const shown = app.uiManager.activityContent.getContent();

    assert.ok(/1-3/.test(shown), `the swap keys are on the panel: ${shown.slice(0, 120)}`);
    assert.ok(/4-6/.test(shown), 'including the table half of a swap');
    assert.ok(/Hand/.test(shown), 'and the hand is listed with its numbers');
    assert.strictEqual(app.uiManager.activityContent.getScroll(), 0,
      'pinned, so the event feed cannot push them off');
  } finally { app.screen?.destroy?.(); }
}

export async function theFocusedPanelLightsItsBorder(): Promise<void> {
  /*
   * "i cant tab between the panels and the borders dont lit up" (sysop,
   * 2026-09-15). The bordered PANEL is not what takes focus - the scrollable
   * content inside it is - so blessed's own focus style never reaches the
   * border and Tab moved invisibly.
   */
  const { UI_THEME } = await import('../lib/constants');
  const app = await openApp();
  try {
    app.uiManager.playersContent.focus();
    app.uiManager.highlightFocusedPanel();
    assert.strictEqual(app.uiManager.playersPanel.style.border.fg, UI_THEME.focusBorder.fg,
      'the panel holding the focus is lit');
    assert.strictEqual(app.uiManager.activityPanel.style.border.fg, UI_THEME.windowBorder.fg,
      'and the others are not');

    app.uiManager.activityContent.focus();
    app.uiManager.highlightFocusedPanel();
    assert.strictEqual(app.uiManager.activityPanel.style.border.fg, UI_THEME.focusBorder.fg,
      'the light follows the focus');
    assert.strictEqual(app.uiManager.playersPanel.style.border.fg, UI_THEME.windowBorder.fg,
      'and leaves the panel it came from');
  } finally { app.screen?.destroy?.(); }
}

export async function theFocusColourIsNotTheRestingColour(): Promise<void> {
  // A focus colour equal to the resting one is the same invisible Tab with
  // extra code, and a themed board must not collapse the two.
  const { UI_THEME } = await import('../lib/constants');
  assert.notStrictEqual(UI_THEME.focusBorder.fg, UI_THEME.windowBorder.fg,
    'focused and unfocused borders are different colours');
}
