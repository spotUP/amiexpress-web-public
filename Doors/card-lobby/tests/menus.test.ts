/**
 * The menu bar.
 *
 * "the lobby and table menus are not needed put their content in the views
 * menu in cardlobby" (2026-09-02). Two menus held one entry each, and both
 * entries were about what to LOOK at - which is what Views is for.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-menus-'));

async function openApp(): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 100, height: 30 }),
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

/** The labels on the bar itself, in order. */
function barLabels(app: any): string[] {
  return app.uiManager.menuButtons.map((button: any) =>
    String(button.getContent()).replace(/\{[^}]*\}/g, '').trim());
}

export async function theBarCarriesViewsAndSystemOnly(): Promise<void> {
  const app = await openApp();
  try {
    assert.deepStrictEqual(barLabels(app), ['Views', 'System'],
      'Lobby and Table are folded into Views');
  } finally { app.screen?.destroy?.(); }
}

export async function viewsHoldsBothFocusEntriesAndTheWindows(): Promise<void> {
  const app = await openApp();
  try {
    const views = app.uiManager.menus[0];
    const labels = views.items.map((item: any) => item.label);

    assert.deepStrictEqual(labels,
      ['Lobby', 'Table', 'Profile', 'Leaders', 'Achievements', 'Bulletins',
       'Say Something (T)', 'Card Style', 'Theme'],
      'the two focus entries lead, then the windows, then how the door looks');
  } finally { app.screen?.destroy?.(); }
}

export async function theFocusEntriesStillDoWhatTheyDid(): Promise<void> {
  // Folded, not dropped: choosing them still switches the view.
  const app = await openApp();
  try {
    const views = app.uiManager.menus[0];
    const table = views.items.find((item: any) => item.label === 'Table');
    const lobby = views.items.find((item: any) => item.label === 'Lobby');

    table.action();
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(app.viewMode, 'table', 'Views > Table shows the table');

    lobby.action();
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(app.viewMode, 'lobby', 'Views > Lobby comes back');
  } finally { app.screen?.destroy?.(); }
}

// ---------------------------------------------------------------------------
// Announcements: a table nobody else knows about is a table nobody joins.
// ---------------------------------------------------------------------------

export async function openingATableAnnouncesItOffTheBoard(): Promise<void> {
  const announced: Array<{ type: string; message: string; data?: any }> = [];
  const { CardLobbyApp } = await import('../index');

  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 100, height: 30 }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
    emitCustomEvent: (type: string, message: string, data?: any) => {
      announced.push({ type, message, data });
    },
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = new CardLobbyApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: 30, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  } as any);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));

  try {
    assert.strictEqual(app.announce.available, true, 'the host can carry announcements');

    // Through the door's own creation path, past the dialogs.
    const { GAME_CATALOG } = await import('../lib/constants');
    const uno = GAME_CATALOG.find((game: any) => game.id === 'uno');
    assert.ok(uno, 'the catalogue must offer UNO');
    await app.tableFlow.finalizeCreateTable(uno, 0, 4, false, false);

    const opened = announced.find((event) => event.type === 'door_opened');
    assert.ok(opened, `no open announcement in: ${announced.map(a => a.type).join(', ') || 'nothing'}`);
    assert.ok(/UNO/.test(opened!.message), `the message names the game: ${opened!.message}`);
    assert.ok(/open/i.test(opened!.message), 'and says it is open');
    assert.strictEqual(opened!.data.game, 'UNO');
    assert.strictEqual(opened!.data.seats, 4, 'with the seats, so a reader knows there is room');
  } finally { app.screen?.destroy?.(); }
}
