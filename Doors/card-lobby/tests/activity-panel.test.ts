/**
 * The ACTIVITY panel: one painter, wrapped at words, and the keys of the game
 * actually being played.
 *
 * Reported live with a screenshot (2026-09-02): "the activity log jumps a
 * little and has line break issues it cut words etc". Three faults in one
 * panel.
 *
 *  - An UNO table was being shown POKER's keys - "F Fold  X Check  C Call
 *    R Raise  L Leave  D Deal" - a line that no narrow panel can hold.
 *  - blessed's wrap counts `{yellow-fg}` against the width, so it broke that
 *    line mid-word: "D Dea" on one row, "l" on the next.
 *  - Two writers owned the widget. The door replaced its whole content while
 *    UIManager.renderUnoActivity PREPENDED to it and trimmed to twenty lines,
 *    so what was on screen depended on which ran last. That is the jump.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { wrapTagged, visibleWidth } from '../lib/utils';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-activity-'));

const WIDTH = 100;
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

// ---------------------------------------------------------------------------
// The wrap itself
// ---------------------------------------------------------------------------

export async function wrappingBreaksAtSpacesNotInsideWords(): Promise<void> {
  const lines = wrapTagged('Keys: F Fold  X Check  C Call  R Raise  L Leave  D Deal', 20);

  for (const line of lines) {
    assert.ok(visibleWidth(line) <= 20, `"${line}" is ${visibleWidth(line)} columns`);
  }
  // Every word survives whole - "Deal" must not become "Dea" and "l".
  const rejoined = lines.join(' ').replace(/\s+/g, ' ').trim();
  assert.strictEqual(rejoined, 'Keys: F Fold X Check C Call R Raise L Leave D Deal');
}

export async function tagsCostNoColumns(): Promise<void> {
  // The whole point: a line that FITS must not be broken because of its tags.
  const tagged = '{yellow-fg}Ready to deal.{/}';
  assert.deepStrictEqual(wrapTagged(tagged, 20), [tagged],
    'a 15-column line with 13 columns of tag markup fits a 20-column panel');

  const wrapped = wrapTagged('{red-fg}aaa bbb ccc ddd{/}', 7);
  for (const line of wrapped) {
    assert.ok(visibleWidth(line) <= 7, `"${line}" measures ${visibleWidth(line)}`);
  }
}

export async function aWordLongerThanThePanelIsSplitRatherThanLost(): Promise<void> {
  const lines = wrapTagged('supercalifragilistic', 8);
  assert.ok(lines.length > 1, 'it has to break somewhere');
  for (const line of lines) assert.ok(visibleWidth(line) <= 8);
  assert.strictEqual(lines.join(''), 'supercalifragilistic', 'and nothing is dropped');
}

// ---------------------------------------------------------------------------
// The panel, through the door
// ---------------------------------------------------------------------------

export async function nothingInThePanelOverflowsIt(): Promise<void> {
  const app = await openApp();
  try {
    app.uiManager.setActivityBody([
      '{yellow-fg}Ready to deal. Press D or use Deal to start.{/}',
      '{gray-fg}Keys: F Fold  X Check  C Call  R Raise  L Leave  D Deal{/}',
      '',
      'Table #1 opened: UNO 10',
      'spot joined table #1',
    ]);

    const content: string = app.uiManager.activityContent.getContent();
    const coords = app.uiManager.activityContent._getCoords?.();
    const width = (coords ? coords.xl - coords.xi : 0) || Number(app.uiManager.activityContent.width);

    for (const line of content.split('\n')) {
      assert.ok(visibleWidth(line) <= width,
        `"${line}" is ${visibleWidth(line)} columns in a ${width}-column panel`);
    }
    assert.ok(!/\bDea$/m.test(content), 'no word is cut at the panel edge');
  } finally { app.screen?.destroy?.(); }
}

export async function theUnoHeaderAndTheEventsShareOnePainter(): Promise<void> {
  // Both writers used to setContent independently; whichever ran last won.
  const app = await openApp();
  try {
    app.uiManager.setActivityBody(['Table #1 opened: UNO 10', 'spot joined table #1']);
    app.uiManager.renderUnoActivity('spot played G5');

    const content: string = app.uiManager.activityContent.getContent();
    assert.ok(content.includes('spot played G5'), 'the UNO header is there');
    assert.ok(content.includes('Table #1 opened'), 'and the events are still under it');

    // A second body render must not lose the header - that was the jump.
    app.uiManager.setActivityBody(['Table #1 opened: UNO 10', 'spot joined table #1', 'sysop drew a card']);
    const after: string = app.uiManager.activityContent.getContent();
    assert.ok(after.includes('spot played G5'), 'the header survives the next body render');
    assert.ok(after.includes('sysop drew a card'), 'and the new event is in');
    assert.strictEqual(
      (after.match(/Table #1 opened/g) ?? []).length, 1,
      'each line appears once - the old prepend-and-trim doubled them up',
    );
  } finally { app.screen?.destroy?.(); }
}

export async function anUnoTableIsNotToldPokersKeys(): Promise<void> {
  const app = await openApp();
  try {
    const table: any = {
      id: 1, gameId: 'uno', gameName: 'UNO', stakesLabel: '10',
      smallBlind: 10, bigBlind: 20, buyIn: 200, entryFee: 0,
      minPlayers: 2, maxPlayers: 4, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: 'sysop',
      autoStart: false, isPrivate: false, players: [], observers: [],
    };
    app.lobby.tables = [table];
    app.currentProfile.currentTableId = 1;
    app.viewMode = 'table';
    app.updateActivityPanel?.(table) ?? app.updateAllPanels();

    const content: string = app.uiManager.activityContent.getContent();
    assert.ok(!content.includes('Fold'), `an UNO table must not offer Fold: ${content}`);
    assert.ok(!content.includes('Check'), 'nor Check');
  } finally { app.screen?.destroy?.(); }
}
