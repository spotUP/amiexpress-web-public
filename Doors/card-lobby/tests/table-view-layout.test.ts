/**
 * The table view uses the screen it is on, and the hand fits the panel.
 *
 * Reported live 2026-09-02, from one screenshot: the table sat in the right
 * two-thirds with the left third black, "not all text is visible", a hand of
 * seven cards with none of them showing, and a scrollbar in the players panel
 * with room to spare underneath it.
 *
 * All of that was one line of the kind this door has already been caught by:
 * `applyViewMode` wrote `tableWindow.options.left` and `options.width`, and a
 * widget renders from its LIVE properties - `options` seeds it at
 * construction and is never read again. So the lobby pane hid itself and the
 * table window stayed exactly as narrow as it was built.
 *
 * Two more followed from it: the view reclaims the rows the hidden activity
 * log was holding, and the hand is laid out ACROSS a wide panel instead of
 * one card per row, which needed eleven rows in a panel that has eight.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-table-view-'));

const WIDTH = 106;
const HEIGHT = 30;

async function openApp(): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: WIDTH, height: HEIGHT }),
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const app: any = new CardLobbyApp({
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 1, secLevel: 255, screenHeight: HEIGHT, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  } as any);
  void app.run();
  await new Promise((r) => setTimeout(r, 1500));
  return app;
}

export async function theTableViewFillsTheScreen(): Promise<void> {
  const app = await openApp();
  try {
    app.applyViewMode('table');
    const win = app.uiManager.tableWindow;

    assert.strictEqual(win.position.left, 0,
      'with the lobby pane hidden the table starts at column 0, not a third of the way in');
    assert.strictEqual(win.position.width, WIDTH,
      'and it is as wide as the terminal - writing options.width moved nothing');
    assert.ok(app.uiManager.lobbyWindow.hidden, 'the lobby pane is hidden in table view');
  } finally { app.screen?.destroy?.(); }
}

export async function theLobbyViewKeepsItsSplit(): Promise<void> {
  const app = await openApp();
  try {
    app.applyViewMode('table');
    app.applyViewMode('lobby');
    const win = app.uiManager.tableWindow;

    assert.ok(!app.uiManager.lobbyWindow.hidden, 'the lobby pane comes back');
    assert.ok(win.position.left > 0, 'and the table sits beside it again');
    assert.ok(Number(win.position.width) < WIDTH, 'sharing the row rather than covering it');
  } finally { app.screen?.destroy?.(); }
}

export async function theHandFitsThePanelItIsDrawnIn(): Promise<void> {
  const app = await openApp();
  try {
    const { UnoGameEngine } = await import('../lib/uno-engine');
    app.applyViewMode('table');
    app.screen.render();
    await new Promise((r) => setTimeout(r, 150));

    const me = app.currentProfile.userId;
    const engine: any = new UnoGameEngine('standard', [me, 'cpu:9:1'], ['sysop', 'Nova-2'], [false, true]);
    const state = engine.getGameState();
    const player = state.players.find((p: any) => p.id === me);
    assert.strictEqual(player.hand.length, 7, 'UNO deals seven');

    app.uiManager.renderUnoHand(player.hand, engine.getPlayableCards(me), null);

    const coords = app.uiManager.handContent._getCoords();
    const rows = coords.yl - coords.yi;
    const lines = String(app.uiManager.handContent.getContent()).split('\n').length;

    assert.ok(lines <= rows,
      `the whole hand is on screen: ${lines} lines in ${rows} rows`);
    // And every card is actually in there.
    const content = String(app.uiManager.handContent.getContent());
    for (let i = 1; i <= 7; i++) {
      assert.ok(content.includes(`[${i}]`), `card ${i} is drawn`);
    }
  } finally { app.screen?.destroy?.(); }
}
