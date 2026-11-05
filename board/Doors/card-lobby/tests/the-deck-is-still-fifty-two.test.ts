/**
 * FIFTY-TWO CARDS, THROUGH THE DOOR.
 *
 * "the deck has 52 cards it felt like we played more than 52 cards" and "uh i
 * got more face down cards when i played out my 3 face down cards" (sysop,
 * 2026-09-16).
 *
 * The engine keeps the count on its own - `vandtia-engine.test.ts` plays a
 * whole game and counts after every move. What the engine cannot see is the
 * DOOR around it: every action loads a new engine out of `table.hand.snapshot`
 * and saves it back, the bots run in their own pass, and the state is
 * persisted and re-read. A stale engine saved over a fresh one does not lose
 * a card - it brings a PLAYED one back, while the copy stays on the pile, and
 * the deck grows.
 *
 * So this counts the cards in the stored snapshot - the thing every node
 * reads - after every action a caller takes.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('deck52');

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

/** Every card the stored snapshot knows about, by id. */
function census(app: any, tableId: number): string[] {
  const snapshot: any = app.findTableById(tableId)?.hand?.snapshot;
  if (!snapshot) return [];
  const all: string[] = [
    ...(snapshot.stock ?? []),
    ...(snapshot.pile ?? []),
    ...(snapshot.burned ?? []),
  ];
  for (const player of snapshot.players ?? []) {
    all.push(...(player.hand ?? []), ...(player.faceUp ?? []), ...(player.faceDown ?? []));
  }
  return all;
}

function assertWholeDeck(app: any, tableId: number, when: string): void {
  const seen = census(app, tableId);
  assert.strictEqual(seen.length, 52, `${when}: ${seen.length} cards, not 52`);
  assert.strictEqual(new Set(seen).size, 52, `${when}: a card is in two places at once`);
}

async function playing(app: any, id: number): Promise<any> {
  const me = app.currentProfile.userId;
  const table: any = {
    id, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
    smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
    minPlayers: 2, maxPlayers: 3, status: 'open',
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
  await app.dealHand();
  (app.vandtia.constructor as any).BOT_PACE_MS = 0;
  app.vandtia.primaryAction();                   // ready, which starts play
  await new Promise((r) => setTimeout(r, 400));
  return app.findTableById(id);
}

/** Wait until the caller is the one to move, or the budget runs out. */
async function myTurn(app: any, id: number, budgetMs = 3000): Promise<boolean> {
  const me = app.currentProfile.userId;
  const until = Date.now() + budgetMs;
  while (Date.now() < until) {
    const engine = app.vandtia.load(app.findTableById(id))?.engine;
    if (!engine || engine.state.phase !== 'playing') return false;
    if (engine.currentPlayerId() === me && !app.actionInProgress) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

export async function theDeckHoldsFiftyTwoCardsAllGameLong(): Promise<void> {
  const app = await openApp();
  try {
    await playing(app, 140);
    assertWholeDeck(app, 140, 'when the hand is dealt');

    const me = app.currentProfile.userId;
    for (let turn = 0; turn < 25; turn += 1) {
      if (!await myTurn(app, 140)) break;

      const engine = app.vandtia.load(app.findTableById(140)).engine;
      const legal = engine.legalPlays(me);
      if (legal.length > 0) {
        app.vandtia.selectedCardIndex = legal[0];
        app.vandtia.selectedCards = [legal[0]];
        app.vandtia.primaryAction();
      } else {
        app.vandtia.secondaryAction();             // take the pile
      }
      await new Promise((r) => setTimeout(r, 120));
      assertWholeDeck(app, 140, `after the caller's move ${turn + 1}`);
    }
  } finally { app.screen?.destroy?.(); }
}

export async function nobodyEverGainsABlindCard(): Promise<void> {
  // "uh i got more face down cards when i played out my 3 face down cards".
  const app = await openApp();
  try {
    await playing(app, 141);
    const blindAtStart: Record<string, number> = {};
    for (const player of (app.findTableById(141).hand.snapshot as any).players) {
      blindAtStart[player.id] = player.faceDown.length;
    }

    const me = app.currentProfile.userId;
    for (let turn = 0; turn < 25; turn += 1) {
      if (!await myTurn(app, 141)) break;
      const engine = app.vandtia.load(app.findTableById(141)).engine;
      const legal = engine.legalPlays(me);
      if (legal.length > 0) {
        app.vandtia.selectedCardIndex = legal[0];
        app.vandtia.selectedCards = [legal[0]];
        app.vandtia.primaryAction();
      } else {
        app.vandtia.secondaryAction();
      }
      await new Promise((r) => setTimeout(r, 120));

      for (const player of (app.findTableById(141).hand.snapshot as any).players) {
        assert.ok(player.faceDown.length <= blindAtStart[player.id],
          `${player.name} has ${player.faceDown.length} blind cards, more than the ${blindAtStart[player.id]} dealt`);
      }
    }
  } finally { app.screen?.destroy?.(); }
}
