/**
 * CARD LOBBY wears the theme's CHROME, not only its colours.
 *
 * The door mapped every token in the palette and drew one still `/////` at
 * the right end of its menu bar - "the theme colors are correct but the
 * chrome is missing", and then "only colors makes no great theme". The
 * animated rail, the draw-in and the glitches all ship in the SDK
 * (sdk/engines/ui/theme/chrome.ts); what was missing was the call.
 *
 * Driven, not read: a source check for `attachDoorChrome` would pass on a
 * door that calls it with an element nothing ever draws. These start the
 * door for real and read the masthead row off the live widget.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-chrome-'));

/** blessed tags are markup; the ROW is what is left when they are gone. */
function plain(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

async function openAt(width: number, themeId = 'uprough-neon'): Promise<any> {
  const { CardLobbyApp } = await import('../index');
  const theme = themeById(themeId);

  const bbs: any = {
    write: () => {}, writeLine: () => {}, on: () => {},
    getTerminalSize: () => ({ width, height: 25 }),
    getTheme: () => theme,
    enableWideMode: () => {}, disableWideMode: () => {},
    getModemSpeed: () => 0, disableModemEmulation: () => {}, setModemSpeed: () => {},
    connectionType: 'web', unicodeCapable: true,
  };
  const socket: any = { on: () => {}, emit: () => {}, off: () => {}, removeAllListeners: () => {} };
  const session: any = {
    bbs, socket, params: [],
    bbsSession: { userId: 1, username: 'sysop', nodeId: 3, secLevel: 255, screenHeight: 25, socket },
    user: { id: 1, username: 'sysop', name: 'sysop', accessLevel: 255 },
  };

  const app: any = new CardLobbyApp(session);
  const finished = app.run();
  await new Promise((r) => setTimeout(r, 1500));
  return { app, finished, theme };
}

export async function theMastheadCarriesTheThemesRail(): Promise<void> {
  const h = await openAt(80);
  const row = h.app.uiManager.mastheadRow;

  assert.ok(row, 'the top bar carries a masthead row');
  assert.strictEqual(row.hidden, false, 'and it is on screen at 80 columns');
  assert.ok(plain(row.getContent()).includes('CARD LOBBY'),
    'the headline is there, in full words');
  assert.ok(plain(row.getContent()).includes(h.theme.rail),
    'and so is the theme\'s mark - a masthead with no rail is the bug');

  await h.app.shutdown();
  await h.finished;
}

export async function theRailSlides(): Promise<void> {
  // The moving bar IS the chrome - the door had the colours and stood still.
  const h = await openAt(80);
  const row = h.app.uiManager.mastheadRow;

  const first = row.getContent();
  await new Promise((r) => setTimeout(r, 300));
  const second = row.getContent();

  assert.notStrictEqual(first, second, 'the rail is animated, not printed once');

  await h.app.shutdown();
  await h.finished;
}

export async function theMastheadNeverOverrunsItsRow(): Promise<void> {
  // A masthead that overran would wrap and take the row below it with it.
  const h = await openAt(80);
  const row = h.app.uiManager.mastheadRow;

  assert.ok(plain(row.getContent()).length <= Number(row.width),
    'the run is sized from the columns the menus leave, not from 80');

  await h.app.shutdown();
  await h.finished;
}

export async function closingTheDoorStopsEveryChromeTimer(): Promise<void> {
  // A timer writing to a destroyed screen is how a door takes the session
  // with it.
  const h = await openAt(80);
  const row = h.app.uiManager.mastheadRow;

  await h.app.shutdown();
  await h.finished;

  const atRest = row.getContent();
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(row.getContent(), atRest, 'nothing is still writing to the row');
}

export async function aFortyColumnScreenGetsNoMovingChrome(): Promise<void> {
  // The C64 tier: the menus leave six columns, which is not a masthead but a
  // clipped word, and a moving effect on a 40-column canvas leaves stray
  // glyphs mid-row. The bar keeps the still mark it always drew.
  const h = await openAt(40);
  const ui = h.app.uiManager;

  // Whatever the menus leave: with one menu the title still fits at 40 and
  // is drawn STILL; with more menus it is hidden and the bar keeps the mark.
  // Either way nothing moves - the SDK chrome reports itself static.
  assert.strictEqual(ui.chrome?.animated, false, 'no moving chrome at 40 columns');
  if (ui.mastheadRow.hidden) {
    assert.ok(ui.topBar.getContent().includes(h.theme.rail),
      'the top bar keeps the theme\'s mark where no masthead fits');
  } else {
    assert.ok(ui.mastheadRow.getContent().includes('CARD LOBBY'),
      'a still title where it fits');
    assert.ok(!ui.mastheadRow.getContent().includes(h.theme.rail.repeat(3)),
      'no rail at 40 columns');
  }

  await h.app.shutdown();
  await h.finished;
}
