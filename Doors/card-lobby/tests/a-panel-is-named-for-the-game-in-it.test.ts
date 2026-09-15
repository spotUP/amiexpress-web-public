/**
 * A PANEL IS NAMED FOR THE GAME IN IT.
 *
 * The four panels were labelled once, for poker, and every game added since
 * has played beneath those labels: a Skitgubbe swap under "FLOP - Board not
 * dealt yet.", a solitaire's piles under "YOUR HAND" (the sysop's own
 * screenshots, 2026-09-15).
 *
 * A panel whose title describes a different game is worse than an unlabelled
 * one - it tells the reader they are looking at something they are not - and
 * on a screen where nobody knows the keys yet, the heading is half the
 * instruction.
 */

import assert from 'assert';
import { isolatedDataDir } from './isolated-data-dir';

isolatedDataDir('titles');

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

const titleOf = (panel: any): string => String(panel.__title ?? '').trim();

export async function everyGameSaysWhatItsPanelsHold(): Promise<void> {
  const app = await openApp();
  try {
    const { GAME_CATALOG } = await import('../lib/constants');
    for (const game of GAME_CATALOG.filter((entry) => entry.enabled)) {
      const module = app.gameModuleFor({ gameId: game.id });
      assert.ok(module, `${game.name} has a module`);
      const titles = module.panelTitles?.({ gameId: game.id } as any);
      assert.ok(titles, `${game.name} names its panels - poker's headings fit poker alone`);
      assert.ok(titles.board && titles.hand, `${game.name} names the board and the hand`);
    }
  } finally { app.screen?.destroy?.(); }
}

export async function aSolitaireHasNoHandAndNoPlayers(): Promise<void> {
  // The two labels that were plainly wrong: a patience has piles and columns,
  // and nobody to play against.
  const app = await openApp();
  try {
    const module = app.gameModuleFor({ gameId: 'patience-klondike' });
    const titles = module.panelTitles({ gameId: 'patience-klondike' } as any);

    assert.ok(!/hand/i.test(titles.hand), `a solitaire's columns are not a hand: ${titles.hand}`);
    assert.ok(!/flop/i.test(titles.board ?? ''), 'and it has no flop');
    assert.strictEqual(titles.players, 'Klondike', 'the panel names the game being played');
  } finally { app.screen?.destroy?.(); }
}

export async function theTitleFollowsWhatTheCallerIsLookingAt(): Promise<void> {
  /*
   * Skitgubbe's LOWER panel holds two different things - the caller's hand
   * and the six cards in front of them - and `V` flips between them, so the
   * title has to follow the switch. The upper panel is the middle of the
   * table and says so whatever the phase ("the upper panel shows stack and
   * pile", sysop 2026-09-15).
   */
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 120, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
      smallBlind: 0, bigBlind: 0, buyIn: 0, entryFee: 0,
      minPlayers: 2, maxPlayers: 2, status: 'open',
      createdAt: Date.now(), updatedAt: Date.now(), hostUserId: me,
      autoStart: false, isPrivate: false, observers: [],
      players: [{
        userId: me, username: 'sysop', seat: 0, stack: 0, buyIn: 0,
        role: 'player', joinedAt: Date.now(), isBot: false,
      }],
    };
    app.syncBotsForTable(table);
    app.lobby.tables.unshift(table);
    app.currentProfile.currentTableId = 120;
    await app.persistState();
    await app.dealHand();

    const before = app.vandtia.panelTitles(app.findTableById(120));
    assert.ok(/pile/i.test(before.board ?? ''), `the upper panel is the table's: ${before.board}`);
    assert.ok(/hand/i.test(before.hand ?? ''), `and the lower one is yours: ${before.hand}`);

    // V flips the lower panel to the cards in front of you, and back.
    app.vandtia.toggleView();
    const flipped = app.vandtia.panelTitles(app.findTableById(120));
    assert.ok(/front of you/i.test(flipped.hand ?? ''), `V shows your table: ${flipped.hand}`);
    assert.ok(/pile/i.test(flipped.board ?? ''), 'and the upper panel has not moved');

    app.vandtia.toggleView();
    assert.ok(/hand/i.test(app.vandtia.panelTitles(app.findTableById(120)).hand ?? ''),
      'V again comes back to the hand');
  } finally { app.screen?.destroy?.(); }
}

export async function theTitlesReachTheWidgets(): Promise<void> {
  // The seam: a module naming its panels is no use if nothing applies it.
  const app = await openApp();
  try {
    app.uiManager.setPanelTitles({ board: 'The pile', players: 'Players', hand: 'Your hand' });
    assert.strictEqual(titleOf(app.uiManager.flopPanel), 'THE PILE');
    assert.strictEqual(titleOf(app.uiManager.handPanel), 'YOUR HAND');

    // And what a game leaves out keeps the name it has, so poker needs no
    // entry at all.
    app.uiManager.setPanelTitles({});
    assert.strictEqual(titleOf(app.uiManager.flopPanel), 'FLOP');
    assert.strictEqual(titleOf(app.uiManager.handPanel), 'YOUR HAND');
  } finally { app.screen?.destroy?.(); }
}
