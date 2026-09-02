/**
 * Dealing an UNO game reaches the human's turn, and releases the door.
 *
 * The sysop pressed D, got "failed to restore hand: cannot restore undefined"
 * and then "Please wait for current action to complete." on every keypress
 * afterwards (2026-09-02). That second message comes from `runAction`, which
 * refuses while `actionInProgress` is set - a flag only an action that never
 * settles can leave behind.
 *
 * This drives the whole path: a real table with a bot in the other seat, the
 * door's own startUnoGame, the bot's turns, and the stop at the human. It
 * asserts the game is actually dealt, that the turn comes back to the player,
 * and that the door is accepting input again afterwards.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-deal-'));

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

/** A two-seat UNO table with the profile in seat 0, on disk where the deal path looks. */
async function seatedAtUnoTable(app: any, id: number): Promise<any> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId: 'uno', gameName: 'UNO', stakesLabel: '10/20',
    smallBlind: 10, bigBlind: 20, buyIn: 200, entryFee: 0,
    minPlayers: 2, maxPlayers: 2, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: me, username: 'sysop', seat: 0, stack: 200, buyIn: 200,
      role: 'player', joinedAt: Date.now(), isBot: false,
    }],
  };
  app.syncBotsForTable(table);          // the empty seat becomes a bot
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();             // startUnoGame reloads state before it deals
  return table;
}

export async function anEmptySeatBecomesABot(): Promise<void> {
  const app = await openApp();
  try {
    const table = await seatedAtUnoTable(app, 41);
    const bots = table.players.filter((p: any) => p.isBot);
    assert.strictEqual(bots.length, 1, 'the free seat is filled by a bot - there is no "add AI" to find');
  } finally { app.screen?.destroy?.(); }
}

export async function dealingReachesTheHumansTurn(): Promise<void> {
  const app = await openApp();
  try {
    await seatedAtUnoTable(app, 42);
    await app.startUnoGame(app.findTableById(42));

    const table = app.findTableById(42);
    assert.ok(table.hand, 'the hand is dealt and saved');
    assert.strictEqual(table.status, 'in-progress');

    const state = app.loadUnoGameState(table);
    assert.ok(state, 'and it restores through the UNO engine, not the poker one');
    assert.strictEqual(state.engine.getCurrentPlayer().name, 'sysop',
      'the bot has taken any turns of its own and stopped at the human');
  } finally { app.screen?.destroy?.(); }
}

export async function theDoorAcceptsInputAfterwards(): Promise<void> {
  const app = await openApp();
  try {
    await seatedAtUnoTable(app, 43);
    await app.startUnoGame(app.findTableById(43));

    assert.strictEqual(app.actionInProgress, false,
      'the action flag is released - it is what makes every later keypress answer "Please wait for current action to complete."');

    let ran = false;
    app.runAction(() => { ran = true; });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(ran, 'so the next action actually runs');
  } finally { app.screen?.destroy?.(); }
}
