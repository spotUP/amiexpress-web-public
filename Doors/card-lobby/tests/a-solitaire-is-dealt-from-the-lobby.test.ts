/**
 * A SOLITAIRE IS DEALT FROM THE LOBBY, AND ANOTHER ONE IS A TEXT FILE.
 *
 * The engine plays a definition and the parser reads one; this is the part
 * that makes them reachable - a table in the lobby, one seat, no bots, no
 * stake, dealt through the app's own deal path.
 *
 * The promise being tested is the one that justified adopting csol's format
 * at all: every enabled `patience-*` entry in the catalogue has a file behind
 * it and can actually be dealt. A catalogue entry with no file is a game the
 * lobby offers and then refuses, which is worse than not offering it.
 */

import assert from 'assert';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.BBS_DATA_DIR = mkdtempSync(join(tmpdir(), 'card-lobby-patience-'));

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

async function soloTable(app: any, id: number, gameId: string): Promise<any> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId, gameName: gameId, stakesLabel: 'Solo',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 1, maxPlayers: 1, status: 'open',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [{
      userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
      role: 'player', joinedAt: Date.now(), isBot: false,
    }],
  };
  app.syncBotsForTable(table);
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();
  return table;
}

export async function everySolitaireOfferedHasAFileBehindIt(): Promise<void> {
  const app = await openApp();
  try {
    const { GAME_CATALOG } = await import('../lib/constants');
    const offered = GAME_CATALOG.filter((game) => game.enabled && game.id.startsWith('patience-'));
    assert.ok(offered.length >= 4, 'the lobby offers some solitaires');

    for (const game of offered) {
      const module = app.gameModuleFor({ gameId: game.id });
      assert.ok(module, `${game.name} has a module`);
      assert.ok(app.patience.definitionFor({ gameId: game.id }),
        `${game.name} has a .game file behind it - an entry with none is a game the lobby refuses to deal`);
    }
  } finally { app.screen?.destroy?.(); }
}

export async function aSoloTableFillsNoSeatsWithBots(): Promise<void> {
  // A solitaire is the caller against the pack. The lobby fills
  // `maxPlayers - humans` seats with bots, which for one seat is none - so
  // this needed no special case, and this test is what says so.
  const app = await openApp();
  try {
    const table = await soloTable(app, 101, 'patience-klondike');
    assert.strictEqual(table.players.length, 1, 'just the caller');
    assert.strictEqual(table.players.filter((p: any) => p.isBot).length, 0, 'and no bots');
  } finally { app.screen?.destroy?.(); }
}

export async function dealingKlondikeLaysOutItsBoard(): Promise<void> {
  const app = await openApp();
  try {
    await soloTable(app, 102, 'patience-klondike');
    await app.dealHand();

    const table = app.findTableById(102);
    assert.ok(table.hand, 'the game is dealt and saved on the table');

    const engine = app.patience.load(table);
    assert.ok(engine, 'and restores through the patience engine');
    const tableaus = engine.state.piles.filter((p: any) => p.type === 'tableau');
    assert.deepStrictEqual(tableaus.map((p: any) => p.cards.length), [1, 2, 3, 4, 5, 6, 7]);
    assert.strictEqual(app.loadTableHand(table), null,
      'and the poker loader declines it rather than throwing at the screen');
  } finally { app.screen?.destroy?.(); }
}

export async function twoNumberKeysMakeAMove(): Promise<void> {
  // A move is two picks: the pile a card leaves, then where it goes.
  const app = await openApp();
  try {
    await soloTable(app, 103, 'patience-klondike');
    await app.dealHand();
    const table = app.findTableById(103);

    // Rig a move that must be legal: an ace on the first column, an empty
    // foundation to receive it.
    const engine = app.patience.load(table);
    const piles = app.patience.boardOrder(engine);
    const tableau = piles.find((p: any) => p.type === 'tableau');
    const foundation = piles.find((p: any) => p.type === 'foundation');
    tableau.cards = [{ rank: 'A', suit: 'S', faceUp: true }];
    foundation.cards = [];
    table.hand.snapshot = engine.serialize();
    await app.persistState();

    const from = piles.findIndex((p: any) => p.id === tableau.id);
    const to = piles.findIndex((p: any) => p.id === foundation.id);

    app.patience.selectCard(from);
    assert.strictEqual(app.patience.selectedPileId, tableau.id, 'the first key picks the source');

    app.patience.selectCard(to);
    const after = app.patience.load(app.findTableById(103));
    assert.strictEqual(after.pile(foundation.id).cards.length, 1, 'the second key makes the move');
    assert.strictEqual(after.pile(tableau.id).cards.length, 0, 'and the card has left');
    assert.strictEqual(app.patience.selectedPileId, null, 'the pick is spent');
  } finally { app.screen?.destroy?.(); }
}

export async function theKeysAreOnThePanelThatKeepsThem(): Promise<void> {
  const app = await openApp();
  try {
    await soloTable(app, 104, 'patience-klondike');
    await app.dealHand();
    app.updateActivityPanel();

    const shown = app.uiManager.activityContent.getContent();
    assert.ok(/1-9/.test(shown), `the pile keys are on the panel: ${shown.slice(0, 120)}`);
    assert.ok(/Moves/.test(shown), 'with the move count');
    assert.strictEqual(app.uiManager.activityContent.getScroll(), 0, 'pinned above the feed');
  } finally { app.screen?.destroy?.(); }
}
