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

    /*
     * During the SWAP the upper panel lends itself to the caller's own table
     * cards - there is no pile yet, and the swap needs both rows on screen
     * (sysop, 2026-09-16). It goes back to being the pile once play starts,
     * which is what the rest of this test walks through.
     */
    let before = app.vandtia.panelTitles(app.findTableById(120));
    assert.ok(/table cards/i.test(before.board ?? ''),
      `the upper panel holds the caller's table cards while swapping: ${before.board}`);
    assert.ok(/hand/i.test(before.hand ?? ''), `and the lower one is yours: ${before.hand}`);

    /*
     * Past the swap before touching V. During the swap both rows are already
     * on screen, so V has nothing to flip to and deliberately refuses - see
     * `theFlipCannotOutliveTheSwap`.
     */
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 600));

    // V flips the lower panel to the cards in front of you, and back.
    before = app.vandtia.panelTitles(app.findTableById(120));
    app.vandtia.toggleView();
    const flipped = app.vandtia.panelTitles(app.findTableById(120));
    assert.ok(/front of you/i.test(flipped.hand ?? ''), `V shows your table: ${flipped.hand}`);
    // The property is that V does not touch the upper panel - not what that
    // panel happens to hold in this phase.
    assert.strictEqual(flipped.board, before.board, 'and the upper panel has not moved');

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

export async function theUpperPanelNeverSpeaksForPoker(): Promise<void> {
  /*
   * "it says the pile is empty but we are playing" (sysop, 2026-09-16).
   * During the SWAP there is no pile to lead - the cards are being arranged -
   * and the panel said "The pile is empty - lead anything." anyway. Worse,
   * `renderBoardAndHand` had already written POKER's "Board not dealt yet."
   * into that widget, and the Skitgubbe text was only written when the card
   * widgets DECLINED to draw - so the poker sentence sat underneath a drawn
   * pile, ready to surface on any panel too small for card art.
   */
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 200, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
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
    app.currentProfile.currentTableId = 200;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    void table;
    app.applyViewMode('table');
    app.updateAllPanels();

    const panel = () => String(app.uiManager.flopContent.getContent()).replace(/\{[^}]*\}/g, '');

    assert.ok(!panel().includes('Board not dealt yet'),
      `no poker text in a Skitgubbe panel: ${panel()}`);
    assert.ok(!panel().includes('lead anything'),
      `nothing is led during the swap: ${panel()}`);
    assert.ok(/swap/i.test(panel()), `it says what the caller is doing: ${panel()}`);

    // Once the play starts and a card is on the pile, it counts the pile.
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 600));
    const loaded = app.vandtia.load(app.findTableById(200));
    loaded.engine.state.pile = [{ rank: '7', suit: 'H' }] as any;
    app.findTableById(200).hand.snapshot = loaded.engine.serialize();
    await app.persistState();
    app.updateAllPanels();

    assert.ok(/Pile\s+1/.test(panel()), `a pile with a card in it is counted: ${panel()}`);
    assert.ok(!panel().includes('Board not dealt yet'), 'and still no poker text');
  } finally { app.screen?.destroy?.(); }
}

export async function thePileAndStockCountsSurviveTheCards(): Promise<void> {
  /*
   * "pile and stock doesnt draw" (sysop, 2026-09-16). Both numbers lived in
   * the panel's TEXT, and drawing the cards hides that text by design - the
   * widgets cover the fallback. So the moment a card landed, a panel called
   * PILE AND STOCK showed neither number, and the stock (the clock this game
   * is played against) was invisible for the rest of the hand.
   *
   * A title is drawn by the frame rather than by the widgets, so it is there
   * either way - which is what this asks.
   */
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 205, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
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
    app.currentProfile.currentTableId = 205;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    app.vandtia.primaryAction();
    await new Promise((r) => setTimeout(r, 600));
    app.applyViewMode('table');

    const loaded = app.vandtia.load(app.findTableById(205));
    loaded.engine.state.pile = [
      { rank: '7', suit: 'H' }, { rank: '9', suit: 'S' }, { rank: 'K', suit: 'D' },
    ] as any;
    const stock = loaded.engine.state.stock.length;
    app.findTableById(205).hand.snapshot = loaded.engine.serialize();
    await app.persistState();
    app.updateAllPanels();

    // The cards ARE drawn - which is exactly when the text went away.
    assert.ok(app.tableCardButtons.focusables().length > 0, 'the pile draws as cards');

    const title = String(app.vandtia.panelTitles(app.findTableById(205)).board);
    assert.ok(/3/.test(title), `the title carries the pile count: ${title}`);
    assert.ok(new RegExp(String(stock)).test(title), `and the stock: ${title}`);
  } finally { app.screen?.destroy?.(); }
}

export async function theSwapShowsBothRowsFaceUp(): Promise<void> {
  /*
   * "it's very hard to swap cards at the start of the skitgubbe game still i
   * need to see both card rows with open side up and select witch cards two
   * switch" (sysop, 2026-09-16).
   *
   * It was hard because the door asked for a card it never showed. The swap
   * is 1-3 for a hand card and 4-6 for the table card it changes places
   * with - and 4-6 pointed at three cards that were nowhere on screen, since
   * the upper panel was holding the pile, which during a swap is empty.
   */
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 206, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
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
    app.currentProfile.currentTableId = 206;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    app.applyViewMode('table');
    app.updateAllPanels();

    const engine = app.vandtia.load(app.findTableById(206)).engine;
    assert.strictEqual(engine.state.phase, 'swap', 'the swap comes first');

    // BOTH rows, drawn as cards.
    assert.strictEqual(app.tableCardButtons.focusables().length, 3,
      'the three table cards are on screen');
    assert.strictEqual(app.cardButtons.focusables().length, 3,
      'and so is the hand');

    // Numbered the way the keys are: 1-3 below, 4-6 above.
    const labelsOf = (row: any) => row.focusables()
      .map((card: any) => String(card.getContent()).replace(/\{[^}]*\}/g, ''))
      .join(' ');
    assert.ok(/\[4\]/.test(labelsOf(app.tableCardButtons)), 'the table cards are 4, 5 and 6');
    assert.ok(/\[1\]/.test(labelsOf(app.cardButtons)), 'the hand is 1, 2 and 3');

    // And a click does the same as the key - which is what makes it easy.
    const mine = engine.playerById(me);
    const handCard = `${mine.hand[0].rank}${mine.hand[0].suit}`;
    const tableCard = `${mine.faceUp[0].rank}${mine.faceUp[0].suit}`;

    app.cardButtons.focusables()[0].emit('click');
    app.tableCardButtons.focusables()[0].emit('click');
    await new Promise((r) => setTimeout(r, 200));

    const after = app.vandtia.load(app.findTableById(206)).engine.playerById(me);
    const nowInHand = after.hand.map((card: any) => `${card.rank}${card.suit}`);
    const nowOnTable = after.faceUp.map((card: any) => `${card.rank}${card.suit}`);
    assert.ok(nowOnTable.includes(handCard),
      `the hand card went to the table: ${nowOnTable.join(' ')}`);
    assert.ok(nowInHand.includes(tableCard),
      `and the table card came to the hand: ${nowInHand.join(' ')}`);
  } finally { app.screen?.destroy?.(); }
}

export async function theFlipCannotOutliveTheSwap(): Promise<void> {
  /*
   * "i switched view with v and swapped some card but i cant seem to start
   * the game now?" (sysop, 2026-09-16). The game HAD started - the screen was
   * showing the wrong row.
   *
   * `V` flips the lower panel between the caller's hand and the six cards in
   * front of them. Pressed during the SWAP it was meaningless (both rows are
   * already on screen then) but it still flipped, and `handView` survived
   * into play: the lower panel showed the six in front of the caller instead
   * of the hand they were meant to play from, and every key answered "Pick a
   * card first."
   */
  const app = await openApp();
  try {
    const me = app.currentProfile.userId;
    const table: any = {
      id: 207, gameId: 'skitgubbe', gameName: 'Skitgubbe', stakesLabel: 'Social',
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
    app.currentProfile.currentTableId = 207;
    app.currentProfile.status = 'table';
    await app.persistState();
    await app.dealHand();
    (app.vandtia.constructor as any).BOT_PACE_MS = 0;

    /*
     * V works during the swap - refusing a key somebody reaches for is its
     * own trap ("i cant switch to game view with V like before", sysop
     * 2026-09-16). What must not happen is the flip OUTLIVING the swap, and
     * that is what the rest of this asserts.
     */
    app.vandtia.toggleView();
    assert.strictEqual(app.vandtia.handView, 'table', 'V flips, whatever the phase');

    // However it was left, play starts on the hand.
    app.vandtia.handView = 'table';
    app.vandtia.primaryAction();                     // X: ready
    await new Promise((r) => setTimeout(r, 600));

    const engine = app.vandtia.load(app.findTableById(207))?.engine;
    assert.ok(engine && engine.state.phase !== 'swap', 'the game started');
    assert.strictEqual(app.vandtia.handView, 'hand',
      'and the lower panel is the hand the caller plays from');
  } finally { app.screen?.destroy?.(); }
}
