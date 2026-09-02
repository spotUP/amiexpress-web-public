/**
 * CARD LOBBY paints in the board's theme.
 *
 * Its palette was a frozen literal - cyan frames, a blue bar, yellow labels -
 * so the door looked identical on a board running Quiet Phosphor or Neon.
 * The SDK's themes carry exactly the tokens it needs
 * (sdk/engines/ui/theme/tokens.ts).
 *
 * Driven, not read: a source check for `themeStyles` would pass on a door
 * that resolves a theme and then draws cyan anyway. These start the door
 * under two different themes and read the colours off the real widgets.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-theme-'));

async function openWithTheme(themeId: string): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const theme = themeById(themeId);

  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
    getTheme: () => theme,
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
  return { app, finished, theme };
}

export async function theWindowsTakeTheThemesChromeColour(): Promise<void> {
  const h = await openWithTheme('quiet-phosphor');
  const ui = h.app.uiManager;

  assert.strictEqual(ui.lobbyWindow.style.border.fg, h.theme.tokens.chrome,
    'the lobby window frame is the theme\'s chrome colour, not a hardcoded cyan');
  assert.strictEqual(ui.tableWindow.style.border.fg, h.theme.tokens.chrome);

  await h.app.shutdown();
  await h.finished;
}

export async function theBarsAndSelectionFollowTheTheme(): Promise<void> {
  const h = await openWithTheme('uprough-neon');
  const ui = h.app.uiManager;

  assert.strictEqual(ui.statusBar.style.bg, h.theme.tokens.bar, 'the status bar takes the bar token');
  assert.strictEqual(ui.lobbyList.style.selected.bg, h.theme.tokens.selectionBg,
    'the highlighted row takes the selection token');

  await h.app.shutdown();
  await h.finished;
}

export async function twoThemesGiveTwoDifferentDoors(): Promise<void> {
  // The point of the whole exercise: the same door, two boards, two looks.
  const classic = await openWithTheme('classic');
  const classicChrome = classic.app.uiManager.lobbyWindow.style.border.fg;
  await classic.app.shutdown();
  await classic.finished;

  const phosphor = await openWithTheme('quiet-phosphor');
  const phosphorChrome = phosphor.app.uiManager.lobbyWindow.style.border.fg;
  await phosphor.app.shutdown();
  await phosphor.finished;

  assert.notStrictEqual(classicChrome, phosphorChrome,
    'a door that draws the same colours in every theme is not theme aware');
}

export async function aBoardWithNoThemeStillOpens(): Promise<void> {
  // Older boards have no getTheme(); the door falls back to Classic rather
  // than throwing on startup.
  const { CardLobbyApp } = await import('../index');
  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width: 80, height: 25 }),
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

  assert.strictEqual(app.uiManager.lobbyWindow.style.border.fg, themeById('classic').tokens.chrome);

  await app.shutdown();
  await finished;
}
