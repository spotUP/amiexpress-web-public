/**
 * SKITGUBBE IS DEALT FROM THE LOBBY, AND THE BOTS PLAY IT.
 *
 * The rules are tested next door against the sysop's own text. This drives
 * the DOOR: a table with the sysop in one seat and bots in the rest, dealt
 * through the app's own deal path, swapped, and played on to a Skitgubbe -
 * "add support for ai players ... so i can test it" (sysop, 2026-09-15).
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-vandtia-'));

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

/** A free three-seat table: the sysop, and bots in the rest. */
async function seatedAtSkitgubbe(app: any, id: number, allBots = false): Promise<any> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 2, maxPlayers: 3, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
      role: 'player', joinedAt: Date.now(), isBot: allBots,
    }],
  };
  app.syncBotsForTable(table);
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();
  return table;
}

export async function theBoardsSkitgubbeIsTheVandtiaOne(): Promise<void> {
  const app = await openApp();
  try {
    const module = app.gameModuleFor({ gameId: 'skitgubbe' });
    assert.ok(module, 'the lobby can deal it');
    assert.strictEqual(module.hintKind, 'vandtia',
      'and it is the three-down-three-up game, not the trick one');
    assert.strictEqual(module.usesPokerEngine, false,
      'its snapshot is its own - the poker loader must decline it');
  } finally { app.screen?.destroy?.(); }
}

export async function dealingLeavesEverybodySwappingAndTheBotsReady(): Promise<void> {
  const app = await openApp();
  try {
    await seatedAtSkitgubbe(app, 91);
    await app.dealHand();              // the door's own deal path

    const table = app.findTableById(91);
    assert.ok(table.hand, 'the game is dealt and saved on the table');
    assert.strictEqual(table.status, 'in-progress');

    const state = app.vandtia.load(table).engine.state;
    assert.strictEqual(state.phase, 'swap', 'the swap comes first');

    const me = state.players.find((p: any) => p.id === app.currentProfile.userId);
    assert.strictEqual(me.hand.length, 3, 'three in hand');
    assert.strictEqual(me.faceUp.length, 3, 'three face up');
    assert.strictEqual(me.faceDown.length, 3, 'and three face down');
    assert.strictEqual(me.ready, false, 'waiting on the human');

    for (const bot of state.players.filter((p: any) => p.isBot)) {
      assert.strictEqual(bot.ready, true, 'the bots have arranged their own tables already');
    }
    assert.strictEqual(app.actionInProgress, false, 'and the door still accepts input');
  } finally { app.screen?.destroy?.(); }
}

export async function theHumansReadyStartsThePlay(): Promise<void> {
  const app = await openApp();
  try {
    await seatedAtSkitgubbe(app, 92);
    await app.dealHand();

    // X during the swap means "ready".
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 400));

    const state = app.vandtia.load(app.findTableById(92)).engine.state;
    assert.notStrictEqual(state.phase, 'swap', 'play has started');
    if (state.phase === 'playing') {
      assert.strictEqual(state.currentIndex >= 0, true, 'somebody is on turn');
    }
  } finally { app.screen?.destroy?.(); }
}

export async function aPokerEngineNeverSeesASkitgubbeSnapshot(): Promise<void> {
  const app = await openApp();
  try {
    await seatedAtSkitgubbe(app, 93);
    await app.dealHand();
    assert.strictEqual(app.loadTableHand(app.findTableById(93)), null,
      'the poker loader declines the table rather than throwing at the screen');
  } finally { app.screen?.destroy?.(); }
}

export async function aTableOfBotsPlaysItselfToASkitgubbe(): Promise<void> {
  // Every seat a bot, driven the way a real table drives them, to a finished
  // game. This is the path the sysop watches when they sit down with bots.
  const app = await openApp();
  try {
    const table = await seatedAtSkitgubbe(app, 94, true);
    table.players = table.players.map((p: any) => ({ ...p, isBot: true }));
    await app.persistState();

    // No thinking pause in a test: the module's own 350ms per bot turn is
    // right at a table and is three minutes of nothing here.
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;

    await app.dealHand();
    for (let round = 0; round < 40 && app.findTableById(94).hand; round += 1) {
      await app.vandtia.advance(app.findTableById(94));
    }

    const finished = app.findTableById(94);
    assert.strictEqual(finished.hand, undefined, 'the game ended and the table was cleared');
    assert.ok(finished.lastHand, 'and it left a record of who got out');
    assert.deepStrictEqual(
      finished.players.map((p: any) => p.stack),
      finished.players.map(() => 0),
      'a social table moves no chips',
    );
  } finally { app.screen?.destroy?.(); }
}
