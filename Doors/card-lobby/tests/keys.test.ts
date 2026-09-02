/**
 * ENTER joins a table. J does not.
 *
 * Reported 2026-09-02: "the selected row moves down when i press j to join
 * it doesnt join, and enter should probably join instead of j". Both halves
 * were one defect: the lobby list reads j/k as vi-style down/up, and the
 * door had bound J to join on top of it, so the keystroke moved the cursor
 * AND asked to join whatever the cursor had just left.
 *
 * The widget now separates the two events (see the SDK's
 * listtable-select-events test); this is the door held to the same line,
 * driven through the real list with real keypresses.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-keys-'));

interface Harness {
  app: any;
  finished: Promise<void>;
  list: any;
  joins: () => number;
  press: (name: string) => void;
  row: () => number;
}

async function openLobby(): Promise<Harness> {
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

  const list: any = app.uiManager.lobbyList;
  list.setRows([
    ['4', 'UNO', '10', '0/2', 'open'],
    ['3', 'UNO', '10', '0/2', 'open'],
    ['1', "Texas Hold'em", '10', '0/2', 'open'],
  ]);

  let joins = 0;
  app.tableFlow.joinSelectedTable = async () => { joins++; };

  return {
    app, finished, list,
    joins: () => joins,
    press: (name: string) => {
      list.focused = true;
      list.emit('keypress', name, { name, full: name });
    },
    row: () => list.getSelected(),
  };
}

export async function jMovesTheCursorAndJoinsNothing(): Promise<void> {
  const h = await openLobby();

  assert.strictEqual(h.row(), 0, 'the lobby starts on the first table');
  h.press('j');

  assert.strictEqual(h.row(), 1, 'j moves the highlight down');
  assert.strictEqual(h.joins(), 0, 'j must not join - it was joining the row it had just left');

  await h.app.shutdown();
  await h.finished;
}

export async function enterJoinsTheHighlightedTable(): Promise<void> {
  const h = await openLobby();

  h.press('j');
  h.press('enter');
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(h.joins(), 1, 'ENTER joins');
  assert.strictEqual(h.row(), 1, 'and joining does not move the highlight');

  await h.app.shutdown();
  await h.finished;
}

export async function movingThroughTheListNeverJoins(): Promise<void> {
  // The refresh timer re-selects a row every few seconds; if that read as a
  // choice the door would re-join a table on its own.
  const h = await openLobby();

  h.press('j');
  h.press('j');
  h.press('k');
  h.list.selectRow(0);
  await new Promise((r) => setTimeout(r, 100));

  assert.strictEqual(h.joins(), 0, 'nothing but ENTER joins');

  await h.app.shutdown();
  await h.finished;
}
