/**
 * EVERY CARD IN A HAND CAN BE REACHED, NOT JUST THE FIRST TEN.
 *
 * The lobby picked cards with the number keys alone - 1 to 9, and 0 for the
 * tenth (index.ts). That is fine for a hand of seven. It is not fine for
 * Skitgubbe, where the whole point of the first phase is to COLLECT cards
 * and a shedding hand of fifteen is ordinary: every card past the tenth was
 * unselectable, and therefore unplayable.
 *
 * Reading csol (https://github.com/nielssp/csol) named the fix: it steers a
 * cursor with the arrow keys rather than addressing piles by number. So the
 * arrows walk the hand, wrapping at both ends, and the number keys stay as
 * the shortcut they always were.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('longhand');

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

/** A Skitgubbe table mid-shed, with a hand far longer than the number keys. */
async function tableWithALongHand(app: any, id: number): Promise<any> {
  const { SkitgubbeEngine } = await import('../lib/games/skitgubbe/engine');
  const me = app.currentProfile.userId;

  const table: any = {
    id, gameId: 'skitgubbe-tricks', gameName: 'Skitgubbe (Tricks)', stakesLabel: '10',
    smallBlind: 0, bigBlind: 10, buyIn: 200, entryFee: 0,
    minPlayers: 2, maxPlayers: 2, status: 'in-progress',
    createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
    autoStart: false, isPrivate: false, observers: [],
    players: [
      { userId: me, username: 'sysop', seat: 0, stack: 200, buyIn: 200, role: 'player', joinedAt: Date.now(), isBot: false },
      { userId: 'cpu:1', username: 'Ada', seat: 1, stack: 200, buyIn: 200, role: 'player', joinedAt: Date.now(), isBot: true },
    ],
  };

  const engine = new SkitgubbeEngine([me, 'cpu:1'], ['sysop', 'Ada'], [false, true], { seed: 'long-hand' });
  const suits = ['S', 'H', 'D', 'C'] as const;
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
  // Fourteen cards: four more than the number keys can address.
  const longHand = ranks.slice(0, 14).map((rank, i) => ({ rank, suit: suits[i % 4] }));
  Object.assign(engine.state, {
    phase: 'shedding', trump: 'C', stock: [], table: [], tableOwners: [],
    trickPlayers: 2, leaderIndex: 0, currentIndex: 0,
  });
  engine.state.players[0].hand = longHand as any;
  engine.state.players[1].hand = [{ rank: 'A', suit: 'S' }] as any;

  table.hand = { snapshot: engine.serialize(), beforeStacks: { [me]: 200 }, startedAt: Date.now(), updatedAt: Date.now() };
  app.lobby.tables.unshift(table);
  app.currentProfile.currentTableId = id;
  app.currentProfile.status = 'table';
  await app.persistState();
  return { table, size: longHand.length };
}

export async function theArrowKeysReachPastTheTenthCard(): Promise<void> {
  const app = await openApp();
  try {
    const { size } = await tableWithALongHand(app, 81);
    const module = app.gameModuleFor(app.findTableById(81));
    assert.ok(module, 'the table has a module');

    // Walk right across the whole hand. Every index must be reachable -
    // including the ones no number key can name.
    const seen = new Set<number>();
    for (let step = 0; step < size + 2; step += 1) {
      module.moveSelection(1);
      seen.add(app.skitgubbe.selectedCardIndex as number);
    }

    assert.ok(seen.has(10), 'the eleventh card can be selected');
    assert.ok(seen.has(size - 1), 'and so can the last one');
    assert.strictEqual(seen.size, size, 'every card in the hand is reachable');
  } finally { app.screen?.destroy?.(); }
}

export async function theSelectionWrapsRatherThanSticking(): Promise<void> {
  const app = await openApp();
  try {
    const { size } = await tableWithALongHand(app, 82);
    const module = app.gameModuleFor(app.findTableById(82));

    module.moveSelection(1);
    const first = app.skitgubbe.selectedCardIndex as number;
    module.moveSelection(-1);
    const back = app.skitgubbe.selectedCardIndex as number;
    assert.strictEqual(back, (first - 1 + size) % size, 'left of the first card is the last one');

    for (let step = 0; step < size; step += 1) module.moveSelection(1);
    assert.strictEqual(app.skitgubbe.selectedCardIndex, back,
      'a full lap comes back to where it started');
  } finally { app.screen?.destroy?.(); }
}

export async function thePickStartsOnACardThatCanActuallyBePlayed(): Promise<void> {
  // The arrows should be useful before they are precise: the first press
  // lands on a legal card rather than on whatever happens to be first.
  const app = await openApp();
  try {
    await tableWithALongHand(app, 83);
    const table = app.findTableById(83);
    const module = app.gameModuleFor(table);

    // Put a card in front of the caller that only some of the hand beats.
    const loaded = app.skitgubbe.load(table);
    loaded.engine.state.table = [{ rank: 'J', suit: 'S' }];
    loaded.engine.state.tableOwners = ['cpu:1'];
    table.hand.snapshot = loaded.engine.serialize();
    await app.persistState();

    app.skitgubbe.selectedCardIndex = null;
    module.moveSelection(1);

    const picked = app.skitgubbe.selectedCardIndex as number;
    const legal = app.skitgubbe.load(table).engine.legalPlays(app.currentProfile.userId);
    assert.ok(legal.includes(picked), 'the first press picks a card the rules will accept');
  } finally { app.screen?.destroy?.(); }
}
