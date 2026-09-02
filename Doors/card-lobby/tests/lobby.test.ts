/**
 * The lobby: joining what is highlighted, following a resize, and Tab.
 *
 * Three reports from the sysop on 2026-09-02, each a different way for the
 * door to look dead:
 *
 *   "nothing happens when i press enter to join a game"  - the status bar
 *     said "Select a table first". UIManager passed the door its OWN copy of
 *     the row -> table id map, which nothing ever wrote to (its setter was an
 *     empty stub that said as much), so selectedTableId was always null.
 *   "alt enter doesnt resize the panels" - the terminal grew, the docked
 *     widgets moved, and the two windows kept the absolute width and height
 *     they were built with.
 *   "tab does nothing" - the lobby's focus ring held two hint bars built
 *     `focusable: false`, so Tab moved focus to widgets that refused it.
 *
 * All three are driven here against a real screen and real widgets.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-lobby-'));

function table(id: number, gameId = 'uno'): any {
  return {
    id, gameId, gameName: gameId === 'uno' ? 'UNO' : "Texas Hold'em",
    stakesLabel: '10/20', smallBlind: 10, bigBlind: 20, buyIn: 200, entryFee: 0,
    minPlayers: 2, maxPlayers: 4, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: 'someone',
    autoStart: false, isPrivate: false, players: [], observers: [],
  };
}

async function openLobby(): Promise<any> {
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

  // Three tables through the door's own painting path, so the row -> id map
  // is built the way it is at runtime.
  app.lobby.tables = [table(4), table(3), table(1, 'holdem')];
  app.updateLobbyPanel();

  const list: any = app.uiManager.lobbyList;
  const press = (name: string) => {
    list.focused = true;
    list.emit('keypress', name, { name, full: name });
  };
  return { app, finished, list, press };
}

export async function enterJoinsTheTableUnderTheHighlight(): Promise<void> {
  const h = await openLobby();
  const joined: Array<number | null> = [];
  h.app.tableFlow.joinSelectedTable = async () => { joined.push(h.app.selectedTableId); };

  h.press('j');            // highlight the second row - table #3
  h.press('enter');
  await new Promise((r) => setTimeout(r, 100));

  assert.deepStrictEqual(joined, [3],
    'ENTER joins the highlighted table, not null - "Select a table first" was the door reading an empty map');

  await h.app.shutdown();
  await h.finished;
}

export async function movingTheHighlightPicksUpTheTableId(): Promise<void> {
  const h = await openLobby();

  h.press('j');
  assert.strictEqual(h.app.selectedTableId, 3, 'the second row is table #3');
  h.press('j');
  assert.strictEqual(h.app.selectedTableId, 1, 'the third row is table #1');
  h.press('k');
  assert.strictEqual(h.app.selectedTableId, 3, 'and back');

  await h.app.shutdown();
  await h.finished;
}

export async function theWindowsFollowATerminalResize(): Promise<void> {
  const h = await openLobby();
  const ui = h.app.uiManager;

  const before = { w: ui.lobbyWindow.width, h: ui.lobbyWindow.height, tw: ui.tableWindow.width };

  h.app.screen.width = 132;
  h.app.screen.height = 43;
  ui.relayout();

  assert.strictEqual(ui.lobbyWindow.width, Math.max(25, Math.floor(132 * 0.30)),
    'the lobby window takes its 30% of the new width');
  assert.strictEqual(ui.tableWindow.width, 132 - Math.max(25, Math.floor(132 * 0.30)) + 1,
    'the table window takes the rest');
  assert.strictEqual(ui.lobbyWindow.height, 43 - 1 - 1 - 4,
    'and both windows use the new height');
  assert.strictEqual(ui.tableWindow.height, 43 - 1 - 1 - 4);
  assert.notStrictEqual(ui.lobbyWindow.width, before.w, 'something must actually have changed');
  assert.notStrictEqual(ui.tableWindow.width, before.tw);

  await h.app.shutdown();
  await h.finished;
}

export async function altEnterRelayoutsThroughTheDoorsOwnSwitch(): Promise<void> {
  // The switch calls onRelayout; this is the door's wiring of it, not the
  // SDK's. A door that follows the resize but never re-lays its windows
  // draws an 80-column UI in the corner of a wide terminal.
  const h = await openLobby();
  const ui = h.app.uiManager;

  h.app.screen.width = 120;
  h.app.screen.height = 40;
  h.app.screen.emit('resize');
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(ui.lobbyWindow.height, 40 - 6, 'the resize event re-lays the windows out');

  await h.app.shutdown();
  await h.finished;
}

export async function tabMovesFocusToSomethingThatTakesIt(): Promise<void> {
  const h = await openLobby();
  const ui = h.app.uiManager;

  ui.lobbyList.focus();
  // Through the program, which is where the SDK dispatches keys registered
  // with screen.key() - the same path the door's own gamepad code uses.
  h.app.screen.program.emit('keypress', '\t', { name: 'tab', full: 'tab' });
  await new Promise((r) => setTimeout(r, 50));

  // getFocused() is the ELEMENT; screen.focused is a boolean.
  const focused = h.app.screen.getFocused();
  assert.notStrictEqual(focused, ui.lobbyActions,
    'Tab must never land on a hint bar built focusable: false');
  assert.strictEqual(focused, ui.tableContent,
    'Tab goes from the table list to the table details, which can be scrolled');

  await h.app.shutdown();
  await h.finished;
}

export async function theTablePanelsAreLaidOutWhereTheyBelong(): Promise<void> {
  // "i created a table and ended up in this broken screen" - one small box in
  // an empty window. layoutTablePanels() wrote geometry to `.options`, which
  // seeds a widget at construction and is never read again, so all four
  // panels kept the 10x6 they were built with, stacked at the same spot.
  const h = await openLobby();
  const ui = h.app.uiManager;

  ui.layoutTablePanels();

  const panels = [ui.flopPanel, ui.playersPanel, ui.handPanel, ui.activityPanel];
  const boxes = panels.map((p: any) => ({ top: Number(p.top), left: Number(p.left), w: Number(p.width), h: Number(p.height) }));

  for (const b of boxes) {
    assert.ok(b.w > 10, `a laid-out panel is wider than the 10 columns it was built with (got ${b.w})`);
    assert.ok(b.h >= 4, `and taller than nothing (got ${b.h})`);
  }

  const positions = new Set(boxes.map((b) => `${b.top}:${b.left}`));
  assert.strictEqual(positions.size, 4, 'the four panels occupy four different places');

  // The two columns line up, and the bottom row sits below the top row.
  assert.strictEqual(boxes[0].top, boxes[1].top, 'flop and players share the top row');
  assert.strictEqual(boxes[2].top, boxes[3].top, 'hand and activity share the bottom row');
  assert.ok(boxes[2].top > boxes[0].top, 'the bottom row is below the top row');

  await h.app.shutdown();
  await h.finished;
}

export async function theActionButtonsSpreadAcrossTheRow(): Promise<void> {
  // Same defect, same fix: the buttons were placed through `.options` too.
  const h = await openLobby();
  const ui = h.app.uiManager;

  ui.layoutTablePanels();

  const lefts = ['fold', 'check', 'call', 'raise', 'quit'].map((k) => Number(ui.actionButtons[k].left));
  const sorted = [...lefts].sort((a, b) => a - b);

  assert.deepStrictEqual(lefts, sorted, 'the buttons run left to right');
  assert.strictEqual(new Set(lefts).size, 5, 'and no two share a column');

  await h.app.shutdown();
  await h.finished;
}
