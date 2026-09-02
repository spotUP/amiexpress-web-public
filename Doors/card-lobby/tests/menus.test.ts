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
      ['Lobby', 'Table', 'Profile', 'Leaders', 'Achievements', 'Bulletins'],
      'the two focus entries lead, then the windows');
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
